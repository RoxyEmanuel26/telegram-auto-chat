import dotenv from 'dotenv';
import dns from 'dns';
import https from 'https';

// Load environment variables FIRST, before any other imports that may reference them
dotenv.config();

// Validate required environment variables
const REQUIRED_ENV_VARS = ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY'];
const missingVars = REQUIRED_ENV_VARS.filter(v => !process.env[v]);
if (missingVars.length > 0) {
  console.error(`❌ Missing required environment variables: ${missingVars.join(', ')}`);
  console.error('💡 Copy .env.example to .env and fill in your values. Run: pnpm gen:secrets');
  process.exit(1);
}

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import logger from './utils/logger';
import authRoutes from './routes/auth.routes';
import botRoutes from './routes/bot.routes';
import channelRoutes from './routes/channel.routes';
import postRoutes from './routes/post.routes';
import uploadRoutes from './routes/upload.routes';
import templateRoutes from './routes/template.routes';
import importRoutes from './routes/import.routes';
import userRoutes from './routes/user.routes';
import webhookRoutes from './routes/webhook.routes';
import notificationRoutes from './routes/notification.routes';
import analyticsRoutes from './routes/analytics.routes';
import path from 'path';
import prisma from './utils/prisma';
import { initScheduler } from './services/scheduler.service';

const app = express();
// Trust proxy header X-Forwarded-For on cloud hosting platforms (like Hugging Face)
app.set('trust proxy', 1);
const PORT = process.env.PORT || 5000;

// Security Middlewares
app.use(helmet());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:3000',
  credentials: true,
}));

// Rate Limiter: max 100 requests per 15 minutes
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Terlalu banyak permintaan dari IP ini, silakan coba lagi nanti.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// Request Parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Custom Lightweight Cookie Parser Middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const cookieHeader = req.headers.cookie;
  const cookies: Record<string, string> = {};
  if (cookieHeader) {
    cookieHeader.split(';').forEach((cookie) => {
      const parts = cookie.split('=');
      if (parts.length >= 2) {
        const name = parts[0].trim();
        const value = parts.slice(1).join('=').trim();
        cookies[name] = decodeURIComponent(value);
      }
    });
  }
  // Attach cookies object to request
  (req as any).cookies = cookies;
  next();
});

// Logging HTTP Requests using Winston
const morganFormat = process.env.NODE_ENV === 'development' ? 'dev' : 'combined';
app.use(
  morgan(morganFormat, {
    stream: {
      write: (message) => logger.http(message.trim()),
    },
  })
);

// Health Check Endpoint
app.get('/api/health', async (req: Request, res: Response) => {
  try {
    // Check DB Connection
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'OK',
      timestamp: new Date(),
      services: {
        database: 'CONNECTED',
        server: 'UP',
      },
    });
  } catch (error) {
    logger.error(`Health check failed: ${error}`);
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date(),
      services: {
        database: 'DISCONNECTED',
        server: 'UP',
      },
    });
  }
});

// Diagnostic Route for Network Debugging
app.get('/api/diag', async (req: Request, res: Response) => {
  const results: any = { timestamp: new Date() };
  let telegramApiUrl = process.env.TELEGRAM_API_URL || 'https://api.telegram.org';
  if (telegramApiUrl && !telegramApiUrl.startsWith('http://') && !telegramApiUrl.startsWith('https://')) {
    telegramApiUrl = `https://${telegramApiUrl}`;
  }
  if (telegramApiUrl.endsWith('/')) {
    telegramApiUrl = telegramApiUrl.slice(0, -1);
  }
  results.configuredTelegramApiUrl = telegramApiUrl;
  
  // 1. DNS Lookup for Telegram API (or proxy host)
  let hostToLookup = 'api.telegram.org';
  try {
    const urlObj = new URL(telegramApiUrl);
    hostToLookup = urlObj.hostname;
  } catch (err) {}

  await new Promise<void>((resolve) => {
    dns.lookup(hostToLookup, (err, address, family) => {
      if (err) {
        results.dns = { host: hostToLookup, success: false, error: err.message || err };
      } else {
        results.dns = { host: hostToLookup, success: true, address, family };
      }
      resolve();
    });
  });

  // 2. HTTP connection using Node.js built-in 'https' (with 3s timeout)
  await new Promise<void>((resolve) => {
    try {
      const targetUrl = telegramApiUrl.endsWith('/') ? telegramApiUrl : (telegramApiUrl + '/');
      const req = https.get(targetUrl, { timeout: 3000 }, (resHttps) => {
        results.https = { success: true, statusCode: resHttps.statusCode };
        resolve();
      });
      
      req.on('error', (err) => {
        results.https = { success: false, error: err.message || err };
        resolve();
      });
      
      req.on('timeout', () => {
        req.destroy();
        results.https = { success: false, error: 'Connection timed out (3s)' };
        resolve();
      });
    } catch (err: any) {
      results.https = { success: false, error: `Request initialization failed: ${err.message || err}` };
      resolve();
    }
  });

  // 3. Connection using Node.js global 'fetch' (undici) with 3s timeout
  try {
    const targetUrl = telegramApiUrl.endsWith('/') ? telegramApiUrl : (telegramApiUrl + '/');
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 3000);
    const fetchRes = await fetch(targetUrl, { 
      method: 'GET',
      signal: controller.signal
    });
    clearTimeout(id);
    results.fetch = { success: true, statusCode: fetchRes.status };
  } catch (err: any) {
    results.fetch = { 
      success: false, 
      error: err.name === 'AbortError' ? 'Fetch timed out (3s)' : err.message || err, 
      cause: err.cause?.message || err.cause || null 
    };
  }

  res.status(200).json(results);
});

// Serve Uploaded Files Statically
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));

// Authentication Routes
app.use('/api/auth', authRoutes);
app.use('/api/bots', botRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/imports', importRoutes);
app.use('/api/users', userRoutes);
app.use('/api/webhooks', webhookRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/analytics', analyticsRoutes);

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error(`Unhandled error: ${err.message || err}`);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Terjadi kesalahan server internal' : err.message,
  });
});

// Start Server
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
  // Start Recurring Scheduler Daemon
  initScheduler();
});

// Graceful Shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);
  await prisma.$disconnect();
  logger.info('Database connection closed.');
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
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

// Load environment variables
dotenv.config();

const app = express();
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

export default app;

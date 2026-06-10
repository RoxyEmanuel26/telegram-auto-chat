import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  register,
  login,
  verify2FA,
  refresh,
  getMe,
  updateProfile,
  changePassword,
  setup2FA,
  enable2FA,
  disable2FA,
  getSessions
} from './auth.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

// Stricter rate limiter for authentication routes (login/register) to prevent brute-forcing
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // limit each IP to 5 requests per windowMs
  message: { error: 'Terlalu banyak percobaan masuk/daftar, silakan coba lagi dalam 15 menit.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Public routes
router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/refresh', refresh);

// Protected routes (require valid JWT)
router.get('/me', authenticateJWT, getMe);
router.post('/profile', authenticateJWT, updateProfile);
router.post('/change-password', authenticateJWT, changePassword);

// 2FA management
router.post('/2fa/setup', authenticateJWT, setup2FA);
router.post('/2fa/enable', authenticateJWT, enable2FA);
router.post('/2fa/disable', authenticateJWT, disable2FA);
router.post('/verify-2fa', authenticateJWT, verify2FA);

// Session history
router.get('/sessions', authenticateJWT, getSessions);

export default router;

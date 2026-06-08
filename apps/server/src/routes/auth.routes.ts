import { Router } from 'express';
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

// Public routes
router.post('/register', register);
router.post('/login', login);
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

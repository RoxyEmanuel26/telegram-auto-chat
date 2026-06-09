import { Router } from 'express';
import { addBot, getBots, deleteBot, testConnection, getBotAvatar, refreshBotAvatar } from './bot.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';
import { UserRole } from 'shared';

const router = Router();

// Public route to serve bot avatars (so browser <img src> can load it directly)
router.get('/:id/avatar', getBotAvatar);

// All other bot management routes require logged in users
router.use(authenticateJWT);

router.get('/', getBots);
router.post('/', requireRole([UserRole.ADMIN, UserRole.EDITOR]), addBot);
router.post('/:id/test', testConnection);
router.post('/:id/refresh-avatar', requireRole([UserRole.ADMIN, UserRole.EDITOR]), refreshBotAvatar);
router.delete('/:id', requireRole([UserRole.ADMIN, UserRole.EDITOR]), deleteBot);

export default router;

import { Router } from 'express';
import { addChannel, getChannels, deleteChannel, sendTestMessage } from './channel.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';
import { UserRole } from 'shared';

const router = Router();

// All channel routes require active authentication
router.use(authenticateJWT);

router.get('/', getChannels);
router.post('/', requireRole([UserRole.ADMIN, UserRole.EDITOR]), addChannel);
router.post('/:id/test', requireRole([UserRole.ADMIN, UserRole.EDITOR]), sendTestMessage);
router.delete('/:id', requireRole([UserRole.ADMIN]), deleteChannel);

export default router;

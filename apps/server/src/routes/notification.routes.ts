import { Router } from 'express';
import { getNotifications, markAsRead, markAllAsRead } from './notification.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

// Notifications endpoints require authentication
router.use(authenticateJWT);

router.get('/', getNotifications);
router.put('/read-all', markAllAsRead);
router.put('/:id/read', markAsRead);

export default router;

import { Router } from 'express';
import { getWebhooks, createWebhook, updateWebhook, deleteWebhook, testWebhook } from './webhook.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';
import { UserRole } from 'shared';

const router = Router();

// Webhooks endpoints require Editor or Admin permissions
router.use(authenticateJWT);
router.use(requireRole([UserRole.ADMIN, UserRole.EDITOR]));

router.get('/', getWebhooks);
router.post('/', createWebhook);
router.put('/:id', updateWebhook);
router.delete('/:id', deleteWebhook);
router.post('/:id/test', testWebhook);

export default router;

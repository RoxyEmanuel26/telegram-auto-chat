import { Router } from 'express';
import { getUsers, updateUserRole, updateUserStatus, getAuditLogs } from './user.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';
import { UserRole } from 'shared';

const router = Router();

// All user and audit routes require administrative privileges
router.use(authenticateJWT);
router.use(requireRole([UserRole.ADMIN]));

router.get('/', getUsers);
router.put('/:id/role', updateUserRole);
router.put('/:id/status', updateUserStatus);
router.get('/audit-logs', getAuditLogs);

export default router;

import { Router } from 'express';
import { 
  createPost, getPosts, getPostDetail, 
  retryFailedTargets, reschedulePost, cancelScheduledPost 
} from './post.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';
import { UserRole } from 'shared';

const router = Router();

// All posting routes require active authentication
router.use(authenticateJWT);

router.get('/', getPosts);
router.get('/:id', getPostDetail);
router.post('/', requireRole([UserRole.ADMIN, UserRole.EDITOR]), createPost);
router.post('/:id/retry', requireRole([UserRole.ADMIN, UserRole.EDITOR]), retryFailedTargets);
router.post('/:id/reschedule', requireRole([UserRole.ADMIN, UserRole.EDITOR]), reschedulePost);
router.post('/:id/cancel', requireRole([UserRole.ADMIN, UserRole.EDITOR]), cancelScheduledPost);

export default router;

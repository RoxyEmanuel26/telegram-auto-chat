import { Router } from 'express';
import { 
  createTemplate, getTemplates, getTemplateDetail, updateTemplate, 
  deleteTemplate, incrementUsage 
} from './template.controller';
import { authenticateJWT, requireRole } from '../middleware/auth.middleware';
import { UserRole } from 'shared';

const router = Router();

// All template routes require active user login
router.use(authenticateJWT);

router.get('/', getTemplates);
router.get('/:id', getTemplateDetail);
router.post('/', requireRole([UserRole.ADMIN, UserRole.EDITOR]), createTemplate);
router.put('/:id', requireRole([UserRole.ADMIN, UserRole.EDITOR]), updateTemplate);
router.delete('/:id', requireRole([UserRole.ADMIN, UserRole.EDITOR]), deleteTemplate);
router.post('/:id/use', incrementUsage);

export default router;

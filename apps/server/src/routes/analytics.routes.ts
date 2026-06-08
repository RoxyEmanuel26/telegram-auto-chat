import { Router } from 'express';
import { getAnalyticsSummary, getChannelPerformance } from './analytics.controller';
import { authenticateJWT } from '../middleware/auth.middleware';

const router = Router();

// Analytics endpoints require authentication
router.use(authenticateJWT);

router.get('/summary', getAnalyticsSummary);
router.get('/channels', getChannelPerformance);

export default router;

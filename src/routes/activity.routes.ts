/**
 * Activity Routes
 * Endpoints for activity log management
 */

import { Router } from 'express';
import { activityController } from '../controllers/activity.controller';

const router = Router();

/**
 * GET /activity
 * Get activity logs with pagination and filters
 * Query params: contactId, action, channel, actorType, page, limit
 */
router.get('/', activityController.getActivities.bind(activityController));

/**
 * GET /activity/recent
 * Get recent activity logs
 * Query params: limit
 */
router.get('/recent', activityController.getRecent.bind(activityController));

/**
 * GET /activity/stats
 * Get activity statistics
 * Query params: days
 */
router.get('/stats', activityController.getStats.bind(activityController));

export default router;


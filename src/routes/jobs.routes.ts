/**
 * Jobs Routes
 * Manual trigger endpoints for automation jobs
 * Day 8: Daily Automation
 */

import { Router } from 'express';
import { jobsController } from '../controllers/jobs.controller';

const router = Router();

/**
 * POST /api/v1/jobs/scrape/trigger
 * Manually trigger scrape job
 */
router.post('/scrape/trigger', jobsController.triggerScrape.bind(jobsController));

/**
 * POST /api/v1/jobs/enrich/trigger
 * Manually trigger enrich job
 */
router.post('/enrich/trigger', jobsController.triggerEnrich.bind(jobsController));

/**
 * POST /api/v1/jobs/merge/trigger
 * Manually trigger merge job
 */
router.post('/merge/trigger', jobsController.triggerMerge.bind(jobsController));

/**
 * POST /api/v1/jobs/validate/trigger
 * Manually trigger validate job
 */
router.post('/validate/trigger', jobsController.triggerValidate.bind(jobsController));

/**
 * POST /api/v1/jobs/enroll/trigger
 * Manually trigger auto-enroll job
 */
router.post('/enroll/trigger', jobsController.triggerEnroll.bind(jobsController));

/**
 * GET /api/v1/jobs/history
 * Get job execution history
 */
router.get('/history', jobsController.getHistory.bind(jobsController));

/**
 * GET /api/v1/jobs/stats
 * Get job statistics
 */
router.get('/stats', jobsController.getStats.bind(jobsController));

/**
 * GET /api/v1/jobs/status
 * Get current job status
 */
router.get('/status', jobsController.getStatus.bind(jobsController));

export default router;


/**
 * Metrics Routes
 * API routes for time-series metrics and analytics
 */

import { Router } from 'express';
import { metricsController } from '../controllers/metrics.controller';

const router = Router();

/**
 * GET /api/v1/metrics/daily
 * Get daily metrics for last N days (default: 30)
 */
router.get('/daily', metricsController.getDailyMetrics.bind(metricsController));

/**
 * GET /api/v1/metrics/range
 * Get daily metrics for specific date range
 */
router.get('/range', metricsController.getMetricsRange.bind(metricsController));

/**
 * GET /api/v1/metrics/aggregated
 * Get aggregated stats for dashboard summary
 */
router.get('/aggregated', metricsController.getAggregatedStats.bind(metricsController));

/**
 * POST /api/v1/metrics/recalculate
 * Recalculate rates for today (manual trigger)
 */
router.post('/recalculate', metricsController.recalculateRates.bind(metricsController));

export default router;


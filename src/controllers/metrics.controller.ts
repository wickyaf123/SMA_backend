/**
 * Metrics Controller
 * API endpoints for time-series metrics and dashboard analytics
 */

import { Request, Response, NextFunction } from 'express';
import { dailyMetricsService } from '../services/metrics/daily-metrics.service';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export class MetricsController {
  /**
   * GET /api/v1/metrics/daily
   * Get daily metrics for last N days
   */
  async getDailyMetrics(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const days = parseInt(req.query.days as string) || 30;

      if (days < 1 || days > 365) {
        throw new AppError('Days must be between 1 and 365', 400, 'INVALID_RANGE');
      }

      logger.debug({ days, userId }, 'Fetching daily metrics');

      const metrics = await dailyMetricsService.getLastNDays(days, userId);

      res.json({
        success: true,
        data: metrics,
        meta: {
          days,
          count: metrics.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/metrics/range
   * Get daily metrics for specific date range
   */
  async getMetricsRange(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const startDate = req.query.startDate
        ? new Date(req.query.startDate as string)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const endDate = req.query.endDate
        ? new Date(req.query.endDate as string)
        : new Date();

      if (startDate > endDate) {
        throw new AppError('Start date must be before end date', 400, 'INVALID_RANGE');
      }

      logger.debug({ startDate, endDate, userId }, 'Fetching metrics for date range');

      const metrics = await dailyMetricsService.getMetricsForRange(startDate, endDate, userId);

      res.json({
        success: true,
        data: metrics,
        meta: {
          startDate,
          endDate,
          count: metrics.length,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/metrics/aggregated
   * Get aggregated stats for dashboard summary
   */
  async getAggregatedStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const days = parseInt(req.query.days as string) || 30;

      logger.debug({ days, userId }, 'Fetching aggregated stats');

      const stats = await dailyMetricsService.getAggregatedStats(days, userId);

      res.json({
        success: true,
        data: stats,
        meta: {
          days,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/metrics/recalculate
   * Recalculate rates for today (manual trigger)
   */
  async recalculateRates(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      logger.info('Manually triggering rate recalculation');

      await dailyMetricsService.recalculateRates();

      res.json({
        success: true,
        message: 'Rates recalculated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const metricsController = new MetricsController();


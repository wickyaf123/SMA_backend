/**
 * Activity Controller
 * Handles activity log endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { activityService } from '../services/activity/activity.service';
import { sendSuccess } from '../utils/response';

export class ActivityController {
  /**
   * Get activity logs with filters
   * GET /activity
   */
  async getActivities(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        contactId,
        action,
        channel,
        actorType,
        page,
        limit,
      } = req.query;

      const result = await activityService.getActivities({
        contactId: contactId as string,
        action: action as string,
        channel: channel as any,
        actorType: actorType as string,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      });

      sendSuccess(res, result.data, undefined, result.pagination);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get recent activities
   * GET /activity/recent
   */
  async getRecent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { limit } = req.query;
      const activities = await activityService.getRecent(
        limit ? parseInt(limit as string) : 20
      );
      sendSuccess(res, activities);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get activity stats
   * GET /activity/stats
   */
  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { days } = req.query;
      const stats = await activityService.getStats(
        days ? parseInt(days as string) : 7
      );
      sendSuccess(res, stats);
    } catch (error) {
      next(error);
    }
  }
}

export const activityController = new ActivityController();


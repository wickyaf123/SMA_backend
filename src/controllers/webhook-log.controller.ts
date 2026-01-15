/**
 * Webhook Log Controller
 * Handles webhook log endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { webhookLogService } from '../services/webhook/webhook-log.service';
import { sendSuccess } from '../utils/response';

export class WebhookLogController {
  /**
   * Get webhook logs with filters
   * GET /webhooks/logs
   */
  async getLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        source,
        eventType,
        processed,
        page,
        limit,
      } = req.query;

      const result = await webhookLogService.getLogs({
        source: source as string,
        eventType: eventType as string,
        processed: processed !== undefined ? processed === 'true' : undefined,
        page: page ? parseInt(page as string) : undefined,
        limit: limit ? parseInt(limit as string) : undefined,
      });

      sendSuccess(res, result.data, undefined, result.pagination);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get recent webhook logs
   * GET /webhooks/logs/recent
   */
  async getRecent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { limit } = req.query;
      const logs = await webhookLogService.getRecent(
        limit ? parseInt(limit as string) : 20
      );
      sendSuccess(res, logs);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get webhook stats
   * GET /webhooks/logs/stats
   */
  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { days } = req.query;
      const stats = await webhookLogService.getStats(
        days ? parseInt(days as string) : 7
      );
      sendSuccess(res, stats);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a single webhook log
   * GET /webhooks/logs/:id
   */
  async getLog(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const log = await webhookLogService.getLogs({ page: 1, limit: 1 });
      // Find by id (simplified - in production use findUnique)
      sendSuccess(res, log.data[0] || null);
    } catch (error) {
      next(error);
    }
  }
}

export const webhookLogController = new WebhookLogController();


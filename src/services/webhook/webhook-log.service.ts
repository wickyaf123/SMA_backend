/**
 * Webhook Log Service
 * Manages webhook event logs for the system
 */

import { prisma } from '../../config/database';
import { Prisma } from '@prisma/client';
import { logger } from '../../utils/logger';

export interface WebhookLogInput {
  source: string;
  eventType: string;
  payload: Record<string, unknown>;
}

export interface WebhookLogFilters {
  source?: string;
  eventType?: string;
  processed?: boolean;
  page?: number;
  limit?: number;
}

export class WebhookLogService {
  /**
   * Log an incoming webhook
   */
  async log(data: WebhookLogInput): Promise<string> {
    try {
      const log = await prisma.webhookLog.create({
        data: {
          source: data.source,
          eventType: data.eventType,
          payload: data.payload as Prisma.InputJsonValue,
          processed: false,
        },
      });
      return log.id;
    } catch (error) {
      logger.error({ error, data }, 'Failed to log webhook');
      throw error;
    }
  }

  /**
   * Mark webhook as processed
   */
  async markProcessed(id: string, errorMessage?: string): Promise<void> {
    await prisma.webhookLog.update({
      where: { id },
      data: {
        processed: true,
        processedAt: new Date(),
        errorMessage,
      },
    });
  }

  /**
   * Get webhook logs with filters and pagination
   */
  async getLogs(filters: WebhookLogFilters) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 50, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.WebhookLogWhereInput = {};

    if (filters.source) {
      where.source = filters.source;
    }

    if (filters.eventType) {
      where.eventType = filters.eventType;
    }

    if (filters.processed !== undefined) {
      where.processed = filters.processed;
    }

    const [logs, total] = await Promise.all([
      prisma.webhookLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.webhookLog.count({ where }),
    ]);

    return {
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get recent webhook logs
   */
  async getRecent(limit: number = 20) {
    return await prisma.webhookLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get webhook stats
   */
  async getStats(days: number = 7) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const bySource = await prisma.webhookLog.groupBy({
      by: ['source'],
      where: {
        createdAt: { gte: since },
      },
      _count: true,
    });

    const byProcessed = await prisma.webhookLog.groupBy({
      by: ['processed'],
      where: {
        createdAt: { gte: since },
      },
      _count: true,
    });

    const errors = await prisma.webhookLog.count({
      where: {
        createdAt: { gte: since },
        errorMessage: { not: null },
      },
    });

    return {
      bySource: bySource.reduce((acc, item) => {
        acc[item.source] = item._count;
        return acc;
      }, {} as Record<string, number>),
      processed: byProcessed.find(p => p.processed === true)?._count || 0,
      pending: byProcessed.find(p => p.processed === false)?._count || 0,
      errors,
    };
  }

  /**
   * Get unprocessed webhooks (for retry logic)
   */
  async getUnprocessed(limit: number = 100) {
    return await prisma.webhookLog.findMany({
      where: { processed: false },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  /**
   * Delete old webhook logs
   */
  async cleanup(daysToKeep: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.webhookLog.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
        processed: true,
      },
    });

    logger.info({ deleted: result.count, daysToKeep }, 'Cleaned up old webhook logs');
    return result.count;
  }
}

export const webhookLogService = new WebhookLogService();


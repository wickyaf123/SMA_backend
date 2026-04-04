/**
 * Activity Service
 * Manages activity logs for the system
 */

import { prisma } from '../../config/database';
import { OutreachChannel, Prisma } from '@prisma/client';
import { logger } from '../../utils/logger';

export interface ActivityLogInput {
  contactId?: string;
  action: string;
  channel?: OutreachChannel;
  description?: string;
  metadata?: Record<string, unknown>;
  actorType?: string;
  actorId?: string;
  userId?: string;
}

export interface ActivityFilters {
  contactId?: string;
  action?: string;
  channel?: OutreachChannel;
  actorType?: string;
  page?: number;
  limit?: number;
}

export class ActivityService {
  /**
   * Log an activity
   */
  async log(data: ActivityLogInput): Promise<void> {
    try {
      await prisma.activityLog.create({
        data: {
          contactId: data.contactId,
          action: data.action,
          channel: data.channel,
          description: data.description,
          metadata: data.metadata as Prisma.InputJsonValue,
          actorType: data.actorType || 'system',
          actorId: data.actorId,
          ...(data.userId && { userId: data.userId }),
        },
      });
    } catch (error) {
      logger.error({ error, data }, 'Failed to log activity');
    }
  }

  /**
   * Get activity logs with filters and pagination
   */
  async getActivities(filters: ActivityFilters, userId?: string) {
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 50, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.ActivityLogWhereInput = {};

    if (userId) {
      where.userId = userId;
    }

    if (filters.contactId) {
      where.contactId = filters.contactId;
    }

    if (filters.action) {
      where.action = filters.action;
    }

    if (filters.channel) {
      where.channel = filters.channel;
    }

    if (filters.actorType) {
      where.actorType = filters.actorType;
    }

    const [activities, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        include: {
          contact: {
            select: {
              id: true,
              email: true,
              fullName: true,
              firstName: true,
              lastName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      prisma.activityLog.count({ where }),
    ]);

    return {
      data: activities,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get recent activities
   */
  async getRecent(limit: number = 20, userId?: string) {
    const where: any = {};
    if (userId) where.userId = userId;

    return await prisma.activityLog.findMany({
      where,
      include: {
        contact: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Get activity stats
   */
  async getStats(days: number = 7, userId?: string) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const baseWhere: any = { createdAt: { gte: since } };
    if (userId) baseWhere.userId = userId;

    const activities = await prisma.activityLog.groupBy({
      by: ['action'],
      where: baseWhere,
      _count: true,
    });

    const byChannel = await prisma.activityLog.groupBy({
      by: ['channel'],
      where: {
        ...baseWhere,
        channel: { not: null },
      },
      _count: true,
    });

    return {
      byAction: activities.reduce((acc, item) => {
        acc[item.action] = item._count;
        return acc;
      }, {} as Record<string, number>),
      byChannel: byChannel.reduce((acc, item) => {
        if (item.channel) {
          acc[item.channel] = item._count;
        }
        return acc;
      }, {} as Record<string, number>),
    };
  }

  // ========== Convenience logging methods ==========

  async logContactCreated(contactId: string, source?: string): Promise<void> {
    await this.log({
      contactId,
      action: 'contact_created',
      description: `Contact created from ${source || 'manual'}`,
      metadata: { source },
    });
  }

  async logContactImported(contactId: string, source: string, jobId?: string): Promise<void> {
    await this.log({
      contactId,
      action: 'contact_imported',
      description: `Contact imported from ${source}`,
      metadata: { source, jobId },
    });
  }

  async logContactValidated(contactId: string, emailValid: boolean, phoneValid: boolean): Promise<void> {
    await this.log({
      contactId,
      action: 'contact_validated',
      description: `Email: ${emailValid ? 'valid' : 'invalid'}, Phone: ${phoneValid ? 'valid' : 'invalid'}`,
      metadata: { emailValid, phoneValid },
    });
  }

  async logContactEnrolled(contactId: string, campaignId: string, channel: OutreachChannel): Promise<void> {
    await this.log({
      contactId,
      action: 'contact_enrolled',
      channel,
      description: `Enrolled in ${channel} campaign`,
      metadata: { campaignId },
    });
  }

  async logMessageSent(contactId: string, channel: OutreachChannel, messageId?: string): Promise<void> {
    await this.log({
      contactId,
      action: 'message_sent',
      channel,
      description: `${channel} message sent`,
      metadata: { messageId },
    });
  }

  async logReplyReceived(contactId: string, channel: OutreachChannel): Promise<void> {
    await this.log({
      contactId,
      action: 'reply_received',
      channel,
      description: `Reply received via ${channel}`,
    });
  }

  async logCampaignsStopped(contactId: string, reason: string): Promise<void> {
    await this.log({
      contactId,
      action: 'campaigns_stopped',
      description: `All campaigns stopped: ${reason}`,
      metadata: { reason },
    });
  }

  async logWebhookReceived(source: string, eventType: string, success: boolean): Promise<void> {
    await this.log({
      action: 'webhook_received',
      description: `Webhook from ${source}: ${eventType}`,
      metadata: { source, eventType, success },
      actorType: 'webhook',
      actorId: source,
    });
  }

  async logJobStarted(jobType: string, jobId: string): Promise<void> {
    await this.log({
      action: 'job_started',
      description: `${jobType} job started`,
      metadata: { jobType, jobId },
      actorType: 'cron',
      actorId: jobType,
    });
  }

  async logJobCompleted(jobType: string, jobId: string, result: Record<string, unknown>): Promise<void> {
    await this.log({
      action: 'job_completed',
      description: `${jobType} job completed`,
      metadata: { jobType, jobId, result },
      actorType: 'cron',
      actorId: jobType,
    });
  }

  async logJobFailed(jobType: string, jobId: string, error: string): Promise<void> {
    await this.log({
      action: 'job_failed',
      description: `${jobType} job failed: ${error}`,
      metadata: { jobType, jobId, error },
      actorType: 'cron',
      actorId: jobType,
    });
  }
}

export const activityService = new ActivityService();


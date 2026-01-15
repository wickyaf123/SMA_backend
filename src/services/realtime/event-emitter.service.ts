/**
 * Real-Time Event Emitter Service
 * Central service for emitting events to WebSocket clients
 * Used throughout the application to broadcast updates
 */

import { broadcast, emitToRoom, WSEventType, getConnectedClients } from '../../config/websocket';
import { logger } from '../../utils/logger';
import type { OutreachChannel } from '@prisma/client';

export interface JobEventData {
  jobId: string;
  jobType: string;
  status: 'started' | 'progress' | 'completed' | 'failed';
  progress?: {
    current: number;
    total: number;
    percentage: number;
  };
  result?: any;
  error?: string;
  duration?: number;
}

export interface ContactEventData {
  contactId: string;
  email?: string;
  fullName?: string;
  action: string;
  details?: any;
}

export interface ReplyEventData {
  replyId: string;
  contactId: string;
  contactName?: string;
  contactEmail?: string;
  channel: OutreachChannel;
  content?: string;
  stoppedCampaigns?: number;
}

export interface CampaignEventData {
  campaignId: string;
  campaignName?: string;
  action: string;
  enrollmentCount?: number;
  details?: any;
}

export interface QueueStatusData {
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface MetricsUpdateData {
  date: string;
  contactsImported?: number;
  emailsSent?: number;
  smsSent?: number;
  repliesReceived?: number;
  [key: string]: any;
}

class RealtimeEventEmitter {
  /**
   * Emit job-related events
   */
  emitJobEvent(data: JobEventData): void {
    const eventType = this.getJobEventType(data.status);
    broadcast(eventType, {
      type: 'job',
      ...data,
    });

    logger.debug(
      { jobId: data.jobId, jobType: data.jobType, status: data.status },
      'Job event emitted'
    );
  }

  private getJobEventType(status: string): WSEventType {
    switch (status) {
      case 'started':
        return WSEventType.JOB_STARTED;
      case 'progress':
        return WSEventType.JOB_PROGRESS;
      case 'completed':
        return WSEventType.JOB_COMPLETED;
      case 'failed':
        return WSEventType.JOB_FAILED;
      default:
        return WSEventType.JOB_PROGRESS;
    }
  }

  /**
   * Emit contact-related events
   */
  emitContactCreated(data: ContactEventData): void {
    broadcast(WSEventType.CONTACT_CREATED, {
      type: 'contact',
      ...data,
    });
  }

  emitContactUpdated(data: ContactEventData): void {
    broadcast(WSEventType.CONTACT_UPDATED, {
      type: 'contact',
      ...data,
    });
  }

  emitContactValidated(data: ContactEventData): void {
    broadcast(WSEventType.CONTACT_VALIDATED, {
      type: 'contact',
      ...data,
    });
  }

  emitContactEnriched(data: ContactEventData): void {
    broadcast(WSEventType.CONTACT_ENRICHED, {
      type: 'contact',
      ...data,
    });
  }

  emitContactEnrolled(data: ContactEventData): void {
    broadcast(WSEventType.CONTACT_ENROLLED, {
      type: 'contact',
      ...data,
    });
  }

  /**
   * Emit reply received event - HIGH PRIORITY
   * This is the most important real-time event for the user
   */
  emitReplyReceived(data: ReplyEventData): void {
    broadcast(WSEventType.REPLY_RECEIVED, {
      type: 'reply',
      priority: 'high',
      ...data,
    });

    logger.info(
      {
        contactId: data.contactId,
        channel: data.channel,
        replyId: data.replyId,
      },
      'Reply received event emitted'
    );
  }

  /**
   * Emit campaign-related events
   */
  emitCampaignUpdated(data: CampaignEventData): void {
    broadcast(WSEventType.CAMPAIGN_UPDATED, {
      type: 'campaign',
      ...data,
    });
  }

  emitCampaignEnrollment(data: CampaignEventData): void {
    broadcast(WSEventType.CAMPAIGN_ENROLLMENT, {
      type: 'campaign',
      ...data,
    });
  }

  /**
   * Emit queue status update
   */
  emitQueueStatus(queues: QueueStatusData[]): void {
    broadcast(WSEventType.QUEUE_STATUS, {
      type: 'queue',
      queues,
    });
  }

  /**
   * Emit pipeline status (enabled/disabled, job statuses)
   */
  emitPipelineStatus(data: {
    pipelineEnabled: boolean;
    schedulerEnabled: boolean;
    runningJobs: string[];
    lastRun?: Record<string, Date>;
  }): void {
    broadcast(WSEventType.PIPELINE_STATUS, {
      type: 'pipeline',
      ...data,
    });
  }

  /**
   * Emit metrics update (for live dashboard)
   */
  emitMetricsUpdate(data: MetricsUpdateData): void {
    broadcast(WSEventType.METRICS_UPDATE, {
      type: 'metrics',
      ...data,
    });
  }

  /**
   * Emit system alert
   */
  emitSystemAlert(data: {
    level: 'info' | 'warning' | 'error' | 'critical';
    title: string;
    message: string;
    action?: string;
  }): void {
    broadcast(WSEventType.SYSTEM_ALERT, {
      type: 'alert',
      ...data,
    });

    logger.info({ level: data.level, title: data.title }, 'System alert emitted');
  }

  /**
   * Get connection stats
   */
  async getStats(): Promise<{ connectedClients: number }> {
    const connectedClients = await getConnectedClients();
    return { connectedClients };
  }
}

// Export singleton
export const realtimeEmitter = new RealtimeEventEmitter();




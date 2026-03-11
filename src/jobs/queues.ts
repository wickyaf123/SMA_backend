/**
 * BullMQ Queue Definitions
 * Central queue setup for real-time job processing
 * 
 * Queue Architecture:
 * - lead-processing: New contact processing (validation, enrichment, dedup)
 * - scraper: Shovels permit scraping jobs
 * - enrichment: Clay enrichment
 * - campaign: Campaign enrollment and outreach
 * - notification: Email notifications for replies
 */

import { Queue, QueueOptions, QueueEvents } from 'bullmq';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';

/**
 * Default queue options with retry and cleanup policies
 * Optimized to reduce Redis request volume
 */
const defaultQueueOptions: QueueOptions = {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 24 * 3600, // Keep completed jobs for 24 hours
      count: 500,     // Reduced from 1000 to limit Redis storage
    },
    removeOnFail: {
      age: 3 * 24 * 3600, // Reduced from 7 days to 3 days
    },
  },
  streams: {
    events: {
      maxLen: 100, // Limit event stream length to reduce Redis memory/requests
    },
  },
};

/**
 * High-priority queue options (for real-time processing)
 */
const highPriorityQueueOptions: QueueOptions = {
  ...defaultQueueOptions,
  defaultJobOptions: {
    ...defaultQueueOptions.defaultJobOptions,
    priority: 1,
    attempts: 5,
  },
  streams: {
    events: {
      maxLen: 100, // Limit event stream length
    },
  },
};

// ==================== JOB DATA TYPES ====================

export interface LeadProcessingJobData {
  type: 'validate' | 'enrich' | 'deduplicate' | 'full-pipeline';
  contactId?: string;
  contactIds?: string[];
  batchSize?: number;
  options?: {
    validateEmail?: boolean;
    validatePhone?: boolean;
    enrichWithClay?: boolean;
    checkDuplicates?: boolean;
  };
}

export interface ScraperJobData {
  type: 'shovels';
  config: {
    query?: string;
    location?: string;
    maxResults?: number;
    industry?: string;
    enrichLimit?: number;
    useSettings?: boolean;
  };
}

export interface EnrichmentJobData {
  contactId?: string;
  contactIds?: string[];
  batchSize?: number;
  source: 'hunter' | 'apollo';
}

export interface CampaignJobData {
  type: 'enroll' | 'send-email' | 'send-sms' | 'sync-status';
  campaignId?: string;
  contactIds?: string[];
  batchSize?: number;
}

export interface NotificationJobData {
  type: 'reply-notification' | 'daily-summary' | 'error-alert';
  data: any;
}

export interface ValidationJobData {
  contactId: string;
  validateEmail: boolean;
  validatePhone: boolean;
}

export interface OutreachJobData {
  outreachStepId: string;
  contactId?: string;
  channel?: string;
}

export interface LinkedInJobData {
  linkedInActionId: string;
  contactId?: string;
  actionType?: string;
}

// ==================== QUEUES ====================

/**
 * Lead Processing Queue
 * Handles: validation, enrichment, deduplication
 * Priority: High (real-time processing of new leads)
 */
export const leadProcessingQueue = new Queue<LeadProcessingJobData>(
  'lead-processing',
  highPriorityQueueOptions
);

/**
 * Scraper Queue
 * Handles: Shovels permit scraping
 * Priority: Normal (scheduled jobs)
 */
export const scraperQueue = new Queue<ScraperJobData>(
  'scraper',
  defaultQueueOptions
);

/**
 * Enrichment Queue
 * Handles: Clay enrichment
 * Priority: Normal
 */
export const enrichmentQueue = new Queue<EnrichmentJobData>(
  'enrichment',
  defaultQueueOptions
);

/**
 * Campaign Queue
 * Handles: Enrollment, email/SMS sending, status sync
 * Priority: High (user-facing)
 */
export const campaignQueue = new Queue<CampaignJobData>(
  'campaign',
  highPriorityQueueOptions
);

/**
 * Notification Queue
 * Handles: Reply notifications, daily summaries
 * Priority: High (time-sensitive)
 */
export const notificationQueue = new Queue<NotificationJobData>(
  'notification',
  highPriorityQueueOptions
);

/**
 * Validation Queue (Legacy - for backward compatibility)
 */
export const validationQueue = new Queue<ValidationJobData>(
  'validation',
  defaultQueueOptions
);

/**
 * Outreach Queue (Legacy)
 */
export const outreachQueue = new Queue<OutreachJobData>(
  'outreach',
  defaultQueueOptions
);

/**
 * LinkedIn Queue (Legacy)
 */
export const linkedinQueue = new Queue<LinkedInJobData>(
  'linkedin',
  {
    ...defaultQueueOptions,
    defaultJobOptions: {
      ...defaultQueueOptions.defaultJobOptions,
      attempts: 2, // Lower retries for LinkedIn
    },
  }
);

// ==================== QUEUE EVENTS ====================

/**
 * Queue event listeners for real-time updates
 */
export const leadProcessingEvents = new QueueEvents('lead-processing', { connection: redis });
export const scraperEvents = new QueueEvents('scraper', { connection: redis });
export const campaignEvents = new QueueEvents('campaign', { connection: redis });

// ==================== QUEUE REGISTRY ====================

export const allQueues = [
  leadProcessingQueue,
  scraperQueue,
  enrichmentQueue,
  campaignQueue,
  notificationQueue,
  validationQueue,
  outreachQueue,
  linkedinQueue,
];

export const queueNames = allQueues.map(q => q.name);

/**
 * Get queue by name
 */
export function getQueue(name: string): Queue | undefined {
  return allQueues.find(q => q.name === name);
}

/**
 * Get queue status for all queues
 */
export async function getAllQueueStats(): Promise<Array<{
  queueName: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
}>> {
  const stats = await Promise.all(
    allQueues.map(async (queue) => {
      const [waiting, active, completed, failed, delayed, isPaused] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
        queue.isPaused(),
      ]);

      return {
        queueName: queue.name,
        waiting,
        active,
        completed,
        failed,
        delayed,
        paused: isPaused,
      };
    })
  );

  return stats;
}

/**
 * Pause all queues (emergency stop)
 */
export async function pauseAllQueues(): Promise<void> {
  await Promise.all(allQueues.map(q => q.pause()));
  logger.warn('All queues paused');
}

/**
 * Resume all queues
 */
export async function resumeAllQueues(): Promise<void> {
  await Promise.all(allQueues.map(q => q.resume()));
  logger.info('All queues resumed');
}

/**
 * Close all queues gracefully
 */
export async function closeQueues(): Promise<void> {
  await Promise.all([
    ...allQueues.map(q => q.close()),
    leadProcessingEvents.close(),
    scraperEvents.close(),
    campaignEvents.close(),
  ]);
  logger.info('All queues closed');
}

// Log queue initialization
logger.info({ queues: queueNames }, '✓ Job queues initialized');

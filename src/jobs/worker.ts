/**
 * BullMQ Worker Manager
 * Manages all queue workers for real-time job processing
 * 
 * This file can be run as a standalone process:
 *   npm run worker
 * 
 * Or workers are automatically started when the main server starts
 */

import { Worker, Job } from 'bullmq';
import { redis } from '../config/redis';
import { logger } from '../utils/logger';
import { realtimeEmitter } from '../services/realtime/event-emitter.service';

// Import job processors
import { processLeadJob } from './processors/lead-processor';
import { processScraperJob } from './processors/scraper-processor';
import { processCampaignJob } from './processors/campaign-processor';

// Import job data types
import type {
  LeadProcessingJobData,
  ScraperJobData,
  CampaignJobData,
  ValidationJobData,
  OutreachJobData,
  LinkedInJobData,
  NotificationJobData,
  WorkflowJobData,
} from './queues';

// Import workflow engine
import { workflowEngine } from '../services/workflow/workflow.engine';

// Worker instances
let workers: Worker[] = [];
let isInitialized = false;

/**
 * Initialize all workers
 */
export async function initializeWorkers(): Promise<void> {
  if (isInitialized) {
    logger.warn('Workers already initialized');
    return;
  }

  logger.info('Initializing BullMQ workers...');

  // Lead Processing Worker
  const leadWorker = new Worker<LeadProcessingJobData>(
    'lead-processing',
    processLeadJob,
    {
      connection: redis,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000, // 10 jobs per second max
      },
    }
  );

  // Scraper Worker
  const scraperWorker = new Worker<ScraperJobData>(
    'scraper',
    processScraperJob,
    {
      connection: redis,
      concurrency: 2, // Lower concurrency due to API rate limits
      limiter: {
        max: 5,
        duration: 1000, // 5 jobs per second max
      },
    }
  );

  // Campaign Worker
  const campaignWorker = new Worker<CampaignJobData>(
    'campaign',
    processCampaignJob,
    {
      connection: redis,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000, // 10 jobs per second max
      },
    }
  );

  // Notification Worker
  const notificationWorker = new Worker<NotificationJobData>(
    'notification',
    async (job: Job<NotificationJobData>) => {
      logger.info({ jobId: job.id, type: job.data.type }, 'Processing notification job');
      // Notification processing is handled elsewhere (email-notification.service.ts)
      return { success: true };
    },
    {
      connection: redis,
      concurrency: 3,
      limiter: {
        max: 5,
        duration: 1000, // 5 jobs per second max
      },
    }
  );

  // Legacy Validation Worker (for backward compatibility)
  const validationWorker = new Worker<ValidationJobData>(
    'validation',
    async (job: Job<ValidationJobData>) => {
      // Delegate to lead processor
      return processLeadJob({
        ...job,
        data: {
          type: 'validate',
          contactId: job.data.contactId,
          options: {
            validateEmail: job.data.validateEmail,
            validatePhone: job.data.validatePhone,
          },
        },
      } as any);
    },
    {
      connection: redis,
      concurrency: 5,
      limiter: {
        max: 10,
        duration: 1000, // 10 jobs per second max
      },
    }
  );

  // Legacy Outreach Worker
  const outreachWorker = new Worker<OutreachJobData>(
    'outreach',
    async (job: Job<OutreachJobData>) => {
      logger.info({ jobId: job.id, data: job.data }, 'Processing outreach job');
      // Outreach is handled by Instantly webhooks and GHL
      return { success: true, message: 'Outreach handled by external services' };
    },
    {
      connection: redis,
      concurrency: 10,
      limiter: {
        max: 15,
        duration: 1000, // 15 jobs per second max
      },
    }
  );

  // Legacy LinkedIn Worker
  const linkedinWorker = new Worker<LinkedInJobData>(
    'linkedin',
    async (job: Job<LinkedInJobData>) => {
      logger.info({ jobId: job.id, data: job.data }, 'Processing LinkedIn job');
      // LinkedIn is handled by PhantomBuster
      return { success: true, message: 'LinkedIn handled by PhantomBuster' };
    },
    {
      connection: redis,
      concurrency: 2,
      limiter: {
        max: 3,
        duration: 1000, // 3 jobs per second max
      },
    }
  );

  // Workflow Worker
  const workflowWorker = new Worker<WorkflowJobData>(
    'workflow',
    async (job: Job<WorkflowJobData>) => {
      const { workflowId } = job.data;
      logger.info({ jobId: job.id, workflowId }, 'Processing workflow job');
      await workflowEngine.executeWorkflow(workflowId);
      return { success: true, workflowId };
    },
    {
      connection: redis,
      concurrency: 3, // Allow a few workflows to run concurrently
      limiter: {
        max: 5,
        duration: 1000, // 5 jobs per second max
      },
    }
  );

  workers = [
    leadWorker,
    scraperWorker,
    campaignWorker,
    notificationWorker,
    validationWorker,
    outreachWorker,
    linkedinWorker,
    workflowWorker,
  ];

  // Add event handlers to all workers
  workers.forEach(setupWorkerEvents);

  isInitialized = true;
  logger.info({ workerCount: workers.length }, '✓ BullMQ workers initialized');
}

/**
 * Setup event handlers for a worker
 */
function setupWorkerEvents(worker: Worker): void {
  worker.on('completed', (job, result) => {
    logger.info(
      {
        worker: worker.name,
        jobId: job.id,
        jobName: job.name,
        duration: job.processedOn ? Date.now() - job.processedOn : undefined,
      },
      'Job completed'
    );
  });

  worker.on('failed', (job, error) => {
    logger.error(
      {
        worker: worker.name,
        jobId: job?.id,
        jobName: job?.name,
        error: error.message,
        stack: error.stack,
        attemptsMade: job?.attemptsMade,
      },
      'Job failed'
    );

    // Emit system alert for important job failures
    if (job && ['scraper', 'campaign'].includes(worker.name)) {
      realtimeEmitter.emitSystemAlert({
        level: 'error',
        title: `Job Failed: ${worker.name}`,
        message: error.message,
        action: 'Check job logs',
      });
    }
  });

  worker.on('error', (error) => {
    logger.error({ worker: worker.name, error: error.message }, 'Worker error');
  });

  worker.on('stalled', (jobId) => {
    logger.warn({ worker: worker.name, jobId }, 'Job stalled');
  });

  worker.on('progress', (job, progress) => {
    logger.debug(
      { worker: worker.name, jobId: job.id, progress },
      'Job progress'
    );
  });
}

/**
 * Stop all workers gracefully
 */
export async function stopWorkers(): Promise<void> {
  if (!isInitialized) return;

  logger.info('Stopping workers...');

  await Promise.all(
    workers.map(async (worker) => {
      await worker.close();
      logger.debug({ worker: worker.name }, 'Worker stopped');
    })
  );

  workers = [];
  isInitialized = false;
  logger.info('✓ All workers stopped');
}

/**
 * Get worker status
 */
export function getWorkerStatus(): Array<{ name: string; isRunning: boolean }> {
  return workers.map((worker) => ({
    name: worker.name,
    isRunning: worker.isRunning(),
  }));
}

// If running as standalone process
if (require.main === module) {
  logger.info('Starting worker process...');

  initializeWorkers()
    .then(() => {
      logger.info('Worker process started. Waiting for jobs...');
    })
    .catch((error) => {
      logger.error({ error }, 'Failed to start worker process');
      process.exit(1);
    });

  // Handle shutdown
  const shutdown = async () => {
    logger.info('Shutdown signal received');
    await stopWorkers();
  process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

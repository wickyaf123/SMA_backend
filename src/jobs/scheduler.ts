/**
 * Job Scheduler
 * Schedules automation jobs using node-cron with database-configurable schedules
 * Supports dynamic schedule templates and custom cron expressions
 */

import * as cron from 'node-cron';
import { enrichJob } from './enrich.job';
import { mergeJob } from './merge.job';
import { validateJob } from './validate.job';
import { autoEnrollJob } from './auto-enroll.job';
import { shovelsScraperJob } from './shovels-scrape.job';
import { homeownerScraperJob } from './homeowner-scrape.job';
import { connectionJob } from './connection.job';
import { jobLogService } from '../services/job-log.service';
import { settingsService } from '../services/settings/settings.service';
import { errorNotifier } from './error-notifier';
import { logger } from '../utils/logger';
import { cronToHuman } from '../config/schedule-templates';
import { scraperQueue, campaignQueue, leadProcessingQueue } from './queues';
import { realtimeEmitter } from '../services/realtime/event-emitter.service';
import { permitPipelineService } from '../services/permit/permit-pipeline.service';

import type { JobType } from '../services/job-log.service';

interface ScheduledJob {
  name: string;
  cronExpression: string;
  task: cron.ScheduledTask;
  jobType: JobType;
}

export class JobScheduler {
  private jobs: Map<string, ScheduledJob> = new Map();
  private isInitialized: boolean = false;

  /**
   * Initialize all cron jobs from database settings
   */
  async initialize(): Promise<void> {
    logger.info('Initializing job scheduler with database schedules');

    try {
      // Get schedules from database
      const schedules = await settingsService.getCronSchedules();
      
      // Schedule each job
      await this.scheduleJob('shovels', schedules.shovels, 'SHOVELS_SCRAPE', async () => {
        const enabled = await settingsService.isJobEnabled('shovels');
        if (!enabled) {
          logger.info('Shovels job skipped - disabled in settings');
          return { success: true, skipped: true };
        }
        return await shovelsScraperJob.run({ useSettings: true });
      });

      await this.scheduleJob('homeowner', schedules.homeowner || '0 9 * * *', 'HOMEOWNER_SCRAPE', async () => {
        const enabled = await settingsService.isJobEnabled('homeowner');
        if (!enabled) {
          logger.info('Homeowner job skipped - disabled in settings');
          return { success: true, skipped: true };
        }
        return await homeownerScraperJob.run({ useSettings: true });
      });

      await this.scheduleJob('connection', schedules.connection || '30 9 * * *', 'CONNECTION_RESOLVE', async () => {
        const enabled = await settingsService.isJobEnabled('connection');
        if (!enabled) {
          logger.info('Connection job skipped - disabled in settings');
          return { success: true, skipped: true };
        }
        const settings = await settingsService.getSettings();
        return await connectionJob.run({ batchSize: settings.connectionBatchSize ?? 50 });
      });

      await this.scheduleJob('enrich', schedules.enrich, 'ENRICH', async () => {
        const enabled = await settingsService.isJobEnabled('enrich');
        if (!enabled) {
          logger.info('Enrich job skipped - disabled in settings');
          return { success: true, skipped: true };
        }
        return await enrichJob.run({ batchSize: 50, onlyNew: true });
      });

      await this.scheduleJob('merge', schedules.merge, 'MERGE', async () => {
        const enabled = await settingsService.isJobEnabled('merge');
        if (!enabled) {
          logger.info('Merge job skipped - disabled in settings');
          return { success: true, skipped: true };
        }
        return await mergeJob.run({});
      });

      await this.scheduleJob('validate', schedules.validate, 'VALIDATE', async () => {
        const enabled = await settingsService.isJobEnabled('validate');
        if (!enabled) {
          logger.info('Validate job skipped - disabled in settings');
          return { success: true, skipped: true };
        }
        return await validateJob.run({ batchSize: 50 });
      });

      await this.scheduleJob('enroll', schedules.enroll, 'AUTO_ENROLL', async () => {
        const enabled = await settingsService.isJobEnabled('enroll');
        if (!enabled) {
          logger.info('Auto-enroll job skipped - disabled in settings');
          return { success: true, skipped: true };
        }
        return await autoEnrollJob.run({ batchSize: 50 });
      });

      // Recover permit searches stuck in ENRICHING for >30 minutes
      await this.scheduleJob('permit-recovery', '*/15 * * * *', 'PERMIT_RECOVERY', async () => {
        const recovered = await permitPipelineService.recoverStuckSearches();
        return { success: true, totalRecords: recovered, contactsProcessed: recovered };
      });

      this.isInitialized = true;
      this.logScheduleSummary();

    } catch (error) {
      logger.error({ error }, 'Failed to initialize scheduler');
      throw error;
    }
  }

  /**
   * Schedule a single job
   */
  private async scheduleJob(
    name: string,
    cronExpression: string,
    jobType: JobType,
    jobFunction: () => Promise<any>
  ): Promise<void> {
    // Validate cron expression
    if (!cron.validate(cronExpression)) {
      logger.error({ name, cronExpression }, 'Invalid cron expression');
      return;
    }

    const task = cron.schedule(cronExpression, async () => {
      await this.runJobWithLogging(jobType, jobFunction);
    });

    this.jobs.set(name, {
      name,
      cronExpression,
      task,
      jobType,
    });

    logger.debug({ name, cronExpression, humanReadable: cronToHuman(cronExpression) }, 'Job scheduled');
  }

  /**
   * Reload all schedules from database (call after settings change)
   */
  async reloadSchedules(): Promise<void> {
    logger.info('Reloading job schedules from database');
    
    // Stop all existing jobs
    this.stop();
    
    // Re-initialize with new schedules
    await this.initialize();
    
    logger.info('Scheduler reloaded successfully');
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    logger.info('Stopping all scheduled jobs');
    
    for (const [name, job] of this.jobs) {
      job.task.stop();
      logger.debug({ name }, 'Job stopped');
    }
    
    this.jobs.clear();
    this.isInitialized = false;
  }

  /**
   * Get current schedule status
   */
  getStatus(): { isRunning: boolean; jobs: Array<{ name: string; schedule: string; humanReadable: string }> } {
    const jobs = Array.from(this.jobs.values()).map(job => ({
      name: job.name,
      schedule: job.cronExpression,
      humanReadable: cronToHuman(job.cronExpression),
    }));

    return {
      isRunning: this.isInitialized,
      jobs,
    };
  }

  /**
   * Log a summary of all scheduled jobs
   */
  private logScheduleSummary(): void {
    logger.info({ totalJobs: this.jobs.size }, 'Job scheduler initialized');
    logger.info('=== Scheduled Jobs ===');
    
    for (const [name, job] of this.jobs) {
      logger.info(`  ${name.padEnd(10)} | ${job.cronExpression.padEnd(15)} | ${cronToHuman(job.cronExpression)}`);
    }
    
    logger.info('======================');
  }

  /**
   * Run a job with logging and error handling.
   * `extraMetadata` is merged into the ImportJob.metadata column so callers
   * (e.g. chat tools) can stamp `conversationId` for downstream activity
   * hydration on `/api/v1/chat/conversations/:id/activity`.
   */
  private async runJobWithLogging(
    jobType: JobType,
    jobFunction: () => Promise<any>,
    extraMetadata?: Record<string, any>
  ): Promise<void> {
    // Check if scheduler is globally enabled
    const settings = await settingsService.getSettings();
    if (!settings.schedulerEnabled) {
      logger.info({ jobType }, 'Job skipped - scheduler is disabled');
      return;
    }

    const jobId = await jobLogService.startJob(jobType, {
      scheduledRun: !extraMetadata?.manual,
      timestamp: new Date(),
      ...extraMetadata,
    });

    try {
      logger.info({ jobType, jobId }, 'Running scheduled job');

      const result = await jobFunction();

      // Handle skipped jobs
      if (result.skipped) {
        await jobLogService.completeJob(jobId, {
          totalRecords: 0,
          successCount: 0,
          errorCount: 0,
          metadata: { skipped: true, reason: 'Job disabled in settings' },
        });
        return;
      }

      if (result.success) {
        await jobLogService.completeJob(jobId, {
          totalRecords: this.getTotalRecords(result),
          successCount: this.getSuccessCount(result),
          errorCount: result.errors?.length || 0,
          errors: result.errors?.length ? { errors: result.errors } : undefined,
        });

        logger.info(
          {
            jobType,
            jobId,
            duration: result.duration,
            records: this.getTotalRecords(result),
          },
          'Scheduled job completed successfully'
        );
      } else {
        await jobLogService.failJob(jobId, result.errors?.[0] || 'Job failed', {
          errors: result.errors,
        });

        // Send error notification
        await errorNotifier.notifyJobError({
          jobType,
          jobId,
          error: result.errors?.[0] || 'Job failed with unknown error',
          timestamp: new Date(),
        });
      }
    } catch (error: any) {
      logger.error({ jobType, jobId, error: error.message }, 'Scheduled job failed with exception');

      await jobLogService.failJob(jobId, error.message, {
        stack: error.stack,
      });

      // Send error notification
      await errorNotifier.notifyJobError({
        jobType,
        jobId,
        error: error.message,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Manually trigger a job (for testing or manual runs)
   * Can optionally use queue for async processing.
   *
   * `metadata` is stamped onto the ImportJob row so callers (e.g. the
   * `trigger_job` chat tool) can include `conversationId` for chat-activity
   * hydration.
   */
  async triggerJob(
    jobName: 'shovels' | 'homeowner' | 'connection' | 'enrich' | 'merge' | 'validate' | 'enroll',
    options?: { useQueue?: boolean; metadata?: Record<string, any> }
  ): Promise<any> {
    logger.info({ jobName, useQueue: options?.useQueue, metadata: options?.metadata }, 'Manually triggering job');

    // If useQueue is true, add to queue instead of running directly
    if (options?.useQueue) {
      return await this.addJobToQueue(jobName, options?.metadata);
    }

    // Direct execution with logging (wraps in runJobWithLogging for ImportJob tracking)
    const jobTypeMap: Record<string, string> = {
      shovels: 'SHOVELS_SCRAPE',
      homeowner: 'HOMEOWNER_SCRAPE',
      connection: 'CONNECTION_RESOLVE',
      enrich: 'ENRICH',
      merge: 'MERGE',
      validate: 'VALIDATE',
      enroll: 'AUTO_ENROLL',
    };

    const jobType = jobTypeMap[jobName];
    if (!jobType) throw new Error(`Unknown job: ${jobName}`);

    const getJobFn = async () => {
      switch (jobName) {
        case 'shovels':
          return shovelsScraperJob.run({ useSettings: true });
        case 'homeowner':
          return homeownerScraperJob.run({ useSettings: true });
        case 'connection': {
          const settings = await settingsService.getSettings();
          return connectionJob.run({ batchSize: settings.connectionBatchSize ?? 50 });
        }
        case 'enrich':
          return enrichJob.run({ batchSize: 50, onlyNew: true });
        case 'merge':
          return mergeJob.run({});
        case 'validate':
          return validateJob.run({ batchSize: 50 });
        case 'enroll':
          return autoEnrollJob.run({ batchSize: 50 });
        default:
          throw new Error(`Unknown job: ${jobName}`);
      }
    };

    return await this.runJobWithLogging(jobType as any, getJobFn, options?.metadata);
  }

  /**
   * Add a job to the appropriate queue for async processing
   * Returns immediately with job ID. `metadata` is forwarded to the
   * BullMQ payload so the worker can stamp it on the resulting ImportJob.
   */
  async addJobToQueue(
    jobName: 'shovels' | 'homeowner' | 'connection' | 'enrich' | 'merge' | 'validate' | 'enroll',
    metadata?: Record<string, any>
  ): Promise<{ queued: true; jobId: string }> {
    // Create a placeholder ImportJob row up-front so the chat-activity
    // hydration endpoint can find this run by `metadata.conversationId`.
    // The BullMQ worker doesn't currently update this row — it stays
    // PROCESSING and is reaped by retention rules. Acceptable trade-off
    // for now; longer term the workers should call completeJob/failJob.
    const jobTypeMap: Record<string, string> = {
      shovels: 'SHOVELS_SCRAPE',
      homeowner: 'HOMEOWNER_SCRAPE',
      connection: 'CONNECTION_RESOLVE',
      enrich: 'ENRICH',
      merge: 'MERGE',
      validate: 'VALIDATE',
      enroll: 'AUTO_ENROLL',
    };
    let importJobId: string | null = null;
    if (metadata && (metadata.conversationId || metadata.triggeredFrom)) {
      try {
        importJobId = await jobLogService.startJob(jobTypeMap[jobName] as any, {
          queued: true,
          ...metadata,
        });
      } catch (err: any) {
        logger.warn({ err: err.message, jobName }, 'addJobToQueue: ImportJob placeholder creation failed');
      }
    }

    let job;

    switch (jobName) {
      case 'shovels':
        job = await scraperQueue.add('shovels', {
          type: 'shovels',
          config: { useSettings: true },
        });
        break;

      case 'homeowner':
        job = await scraperQueue.add('homeowner', {
          type: 'homeowner',
          config: { useSettings: true },
        });
        break;

      case 'connection':
        job = await leadProcessingQueue.add('connection', {
          type: 'full-pipeline',
          batchSize: 50,
        } as any);
        break;

      case 'enrich':
        job = await leadProcessingQueue.add('enrich', {
          type: 'enrich',
          batchSize: 50,
        });
        break;

      case 'merge':
        job = await leadProcessingQueue.add('deduplicate', {
          type: 'deduplicate',
          batchSize: 100,
        });
        break;

      case 'validate':
        job = await leadProcessingQueue.add('validate', {
          type: 'validate',
          batchSize: 50,
        });
        break;

      case 'enroll':
        job = await campaignQueue.add('enroll', {
          type: 'enroll',
          batchSize: 50,
        });
        break;

      default:
        throw new Error(`Unknown job: ${jobName}`);
    }

    logger.info({ jobName, jobId: job.id }, 'Job added to queue');

    // Emit real-time event
    realtimeEmitter.emitJobEvent({
      jobId: job.id!,
      jobType: jobName,
      status: 'started',
    });

    return { queued: true, jobId: job.id! };
  }

  /**
   * Extract total records from job result
   */
  private getTotalRecords(result: any): number {
    return (
      result.contactsProcessed ||
      result.companiesCreated ||
      result.duplicatesFound ||
      result.totalSearched ||
      result.totalScraped ||
      result.totalImported ||
      0
    );
  }

  /**
   * Extract success count from job result
   */
  private getSuccessCount(result: any): number {
    return (
      result.contactsEnriched ||
      result.emailEnrollments ||
      result.smsEnrollments ||
      result.contactsCreated ||
      result.duplicatesMerged ||
      result.emailsValidated ||
      result.totalEnriched ||
      result.totalImported ||
      0
    );
  }
}

// Singleton instance
let schedulerInstance: JobScheduler | null = null;

export async function initializeScheduler(): Promise<JobScheduler> {
  if (!schedulerInstance) {
    schedulerInstance = new JobScheduler();
    await schedulerInstance.initialize();
  }
  return schedulerInstance;
}

export function getScheduler(): JobScheduler | null {
  return schedulerInstance;
}

export function stopScheduler(): void {
  if (schedulerInstance) {
    schedulerInstance.stop();
    schedulerInstance = null;
  }
}

export async function reloadScheduler(): Promise<void> {
  if (schedulerInstance) {
    await schedulerInstance.reloadSchedules();
  } else {
    await initializeScheduler();
  }
}

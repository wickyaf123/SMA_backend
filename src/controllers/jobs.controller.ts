/**
 * Jobs Controller
 * Manual trigger endpoints for automation jobs
 * Day 8: Daily Automation
 */

import { Request, Response, NextFunction } from 'express';
import { scrapeJob } from '../jobs/scrape.job';
import { enrichJob } from '../jobs/enrich.job';
import { mergeJob } from '../jobs/merge.job';
import { validateJob } from '../jobs/validate.job';
import { autoEnrollJob } from '../jobs/auto-enroll.job';
import { jobLogService } from '../services/job-log.service';
import { getScheduler } from '../jobs/scheduler';
import { sendSuccess } from '../utils/response';
import { logger } from '../utils/logger';

export class JobsController {
  /**
   * Trigger scrape job manually
   * POST /api/v1/jobs/scrape/trigger
   */
  async triggerScrape(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { query, maxResults, location } = req.body;

      logger.info({ query, maxResults, location }, 'Manually triggering scrape job');

      const jobId = await jobLogService.startJob('SCRAPE', { manual: true, ...req.body });

      // Use database settings if no params provided
      const result = await scrapeJob.run(
        query || maxResults || location
          ? {
              query: query || undefined,
              maxResults: maxResults || undefined,
              location: location || undefined,
            }
          : { useSettings: true }
      );

      if (result.success) {
        await jobLogService.completeJob(jobId, {
          totalRecords: result.totalScraped,
          successCount: result.totalImported,
          errorCount: result.errors.length,
          errors: result.errors.length ? { errors: result.errors } : undefined,
        });
      } else {
        await jobLogService.failJob(jobId, result.errors[0] || 'Job failed');
      }

      sendSuccess(res, { jobId, result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Trigger enrich job manually
   * POST /api/v1/jobs/enrich/trigger
   */
  async triggerEnrich(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { batchSize, onlyNew } = req.body;

      logger.info({ batchSize, onlyNew }, 'Manually triggering enrich job');

      const jobId = await jobLogService.startJob('ENRICH', { manual: true, ...req.body });

      const result = await enrichJob.run({
        batchSize: batchSize || 10,
        onlyNew: onlyNew !== false,
      });

      if (result.success) {
        await jobLogService.completeJob(jobId, {
          totalRecords: result.contactsProcessed,
          successCount: result.contactsEnriched,
          errorCount: result.errors.length,
          errors: result.errors.length ? { errors: result.errors } : undefined,
        });
      } else {
        await jobLogService.failJob(jobId, result.errors[0] || 'Job failed');
      }

      sendSuccess(res, { jobId, result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Trigger merge job manually
   * POST /api/v1/jobs/merge/trigger
   */
  async triggerMerge(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      logger.info('Manually triggering merge job');

      const jobId = await jobLogService.startJob('MERGE', { manual: true });

      const result = await mergeJob.run({});

      if (result.success) {
        await jobLogService.completeJob(jobId, {
          totalRecords: result.duplicatesFound,
          successCount: result.duplicatesMerged,
          errorCount: result.errors.length,
          errors: result.errors.length ? { errors: result.errors } : undefined,
        });
      } else {
        await jobLogService.failJob(jobId, result.errors[0] || 'Job failed');
      }

      sendSuccess(res, { jobId, result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Trigger validate job manually
   * POST /api/v1/jobs/validate/trigger
   */
  async triggerValidate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { batchSize } = req.body;

      logger.info({ batchSize }, 'Manually triggering validate job');

      const jobId = await jobLogService.startJob('VALIDATE', { manual: true, ...req.body });

      const result = await validateJob.run({
        batchSize: batchSize || 10,
      });

      if (result.success) {
        await jobLogService.completeJob(jobId, {
          totalRecords: result.contactsProcessed,
          successCount: result.emailsValidated + result.phonesValidated,
          errorCount: result.errors.length,
          errors: result.errors.length ? { errors: result.errors } : undefined,
        });
      } else {
        await jobLogService.failJob(jobId, result.errors[0] || 'Job failed');
      }

      sendSuccess(res, { jobId, result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Trigger auto-enroll job manually
   * POST /api/v1/jobs/enroll/trigger
   */
  async triggerEnroll(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { batchSize } = req.body;

      logger.info({ batchSize }, 'Manually triggering auto-enroll job');

      const jobId = await jobLogService.startJob('AUTO_ENROLL', { manual: true, ...req.body });

      const result = await autoEnrollJob.run({
        batchSize: batchSize || 10,
      });

      if (result.success) {
        await jobLogService.completeJob(jobId, {
          totalRecords: result.contactsProcessed,
          successCount: result.emailEnrollments + result.smsEnrollments,
          errorCount: result.errors.length,
          errors: result.errors.length ? { errors: result.errors } : undefined,
        });
      } else {
        await jobLogService.failJob(jobId, result.errors[0] || 'Job failed');
      }

      sendSuccess(res, { jobId, result });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get job history
   * GET /api/v1/jobs/history
   */
  async getHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { type, limit } = req.query;

      const history = await jobLogService.getJobHistory(
        type as any,
        limit ? parseInt(limit as string) : 50
      );

      sendSuccess(res, { history, total: history.length });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get job statistics
   * GET /api/v1/jobs/stats
   */
  async getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { type, days } = req.query;

      const stats = await jobLogService.getJobStats(
        type as any,
        days ? parseInt(days as string) : 7
      );

      sendSuccess(res, stats);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get currently running jobs
   * GET /api/v1/jobs/status
   */
  async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const running = await jobLogService.getRunningJobs();
      const scheduler = getScheduler();

      sendSuccess(res, {
        runningJobs: running,
        schedulerActive: !!scheduler,
        scheduledJobsCount: scheduler ? 5 : 0,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const jobsController = new JobsController();


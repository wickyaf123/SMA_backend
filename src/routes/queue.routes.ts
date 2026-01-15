/**
 * Queue Management Routes
 * API endpoints for monitoring and managing job queues
 */

import { Router, Request, Response, NextFunction } from 'express';
import {
  getAllQueueStats,
  getQueue,
  pauseAllQueues,
  resumeAllQueues,
  leadProcessingQueue,
  scraperQueue,
  campaignQueue,
} from '../jobs/queues';
import { getWorkerStatus } from '../jobs/worker';
import { realtimeEmitter } from '../services/realtime/event-emitter.service';
import { logger } from '../utils/logger';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/errors';

const router = Router();

/**
 * GET /queues/status
 * Get status of all queues
 */
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [queueStats, workerStatus] = await Promise.all([
      getAllQueueStats(),
      Promise.resolve(getWorkerStatus()),
    ]);

    // Also emit via WebSocket for real-time dashboard
    realtimeEmitter.emitQueueStatus(queueStats);

    sendSuccess(res, {
      queues: queueStats,
      workers: workerStatus,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /queues/:queueName/jobs
 * Get jobs from a specific queue
 */
router.get('/:queueName/jobs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { queueName } = req.params;
    const { status = 'all', limit = '50', offset = '0' } = req.query;

    const queue = getQueue(queueName);
    if (!queue) {
      throw new AppError(`Queue '${queueName}' not found`, 404, 'QUEUE_NOT_FOUND');
    }

    const limitNum = parseInt(limit as string, 10);
    const offsetNum = parseInt(offset as string, 10);

    let jobs: any[] = [];

    switch (status) {
      case 'waiting':
        jobs = await queue.getWaiting(offsetNum, offsetNum + limitNum - 1);
        break;
      case 'active':
        jobs = await queue.getActive(offsetNum, offsetNum + limitNum - 1);
        break;
      case 'completed':
        jobs = await queue.getCompleted(offsetNum, offsetNum + limitNum - 1);
        break;
      case 'failed':
        jobs = await queue.getFailed(offsetNum, offsetNum + limitNum - 1);
        break;
      case 'delayed':
        jobs = await queue.getDelayed(offsetNum, offsetNum + limitNum - 1);
        break;
      default:
        // Get all jobs
        const [waiting, active, completed, failed, delayed] = await Promise.all([
          queue.getWaiting(0, 10),
          queue.getActive(0, 10),
          queue.getCompleted(0, 10),
          queue.getFailed(0, 10),
          queue.getDelayed(0, 10),
        ]);
        jobs = [...waiting, ...active, ...completed, ...failed, ...delayed]
          .slice(offsetNum, offsetNum + limitNum);
    }

    const formattedJobs = jobs.map((job) => ({
      id: job.id,
      name: job.name,
      data: job.data,
      status: job.failedReason ? 'failed' : job.finishedOn ? 'completed' : 'active',
      progress: job.progress,
      attemptsMade: job.attemptsMade,
      createdAt: new Date(job.timestamp).toISOString(),
      processedOn: job.processedOn ? new Date(job.processedOn).toISOString() : null,
      finishedOn: job.finishedOn ? new Date(job.finishedOn).toISOString() : null,
      failedReason: job.failedReason,
    }));

    sendSuccess(res, {
      queue: queueName,
      status,
      jobs: formattedJobs,
      total: jobs.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /queues/:queueName/add
 * Add a job to a queue
 */
router.post('/:queueName/add', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { queueName } = req.params;
    const { name, data, options } = req.body;

    const queue = getQueue(queueName);
    if (!queue) {
      throw new AppError(`Queue '${queueName}' not found`, 404, 'QUEUE_NOT_FOUND');
    }

    const job = await queue.add(name || 'manual-job', data, {
      ...options,
      jobId: options?.jobId || `manual-${Date.now()}`,
    });

    logger.info({ queueName, jobId: job.id, data }, 'Manual job added to queue');

    sendSuccess(res, {
      message: 'Job added successfully',
      job: {
        id: job.id,
        name: job.name,
        data: job.data,
      },
    }, 201);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /queues/pause-all
 * Pause all queues (emergency stop)
 */
router.post('/pause-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await pauseAllQueues();

    logger.warn('All queues paused via API');

    realtimeEmitter.emitSystemAlert({
      level: 'warning',
      title: 'Queues Paused',
      message: 'All job queues have been paused',
    });

    sendSuccess(res, {
      message: 'All queues paused',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /queues/resume-all
 * Resume all queues
 */
router.post('/resume-all', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await resumeAllQueues();

    logger.info('All queues resumed via API');

    realtimeEmitter.emitSystemAlert({
      level: 'info',
      title: 'Queues Resumed',
      message: 'All job queues have been resumed',
    });

    sendSuccess(res, {
      message: 'All queues resumed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /queues/:queueName/jobs/:jobId
 * Remove a specific job
 */
router.delete('/:queueName/jobs/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { queueName, jobId } = req.params;

    const queue = getQueue(queueName);
    if (!queue) {
      throw new AppError(`Queue '${queueName}' not found`, 404, 'QUEUE_NOT_FOUND');
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      throw new AppError(`Job '${jobId}' not found`, 404, 'JOB_NOT_FOUND');
    }

    await job.remove();

    logger.info({ queueName, jobId }, 'Job removed from queue');

    sendSuccess(res, {
      message: 'Job removed',
      jobId,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /queues/:queueName/jobs/:jobId/retry
 * Retry a failed job
 */
router.post('/:queueName/jobs/:jobId/retry', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { queueName, jobId } = req.params;

    const queue = getQueue(queueName);
    if (!queue) {
      throw new AppError(`Queue '${queueName}' not found`, 404, 'QUEUE_NOT_FOUND');
    }

    const job = await queue.getJob(jobId);
    if (!job) {
      throw new AppError(`Job '${jobId}' not found`, 404, 'JOB_NOT_FOUND');
    }

    await job.retry();

    logger.info({ queueName, jobId }, 'Job retried');

    sendSuccess(res, {
      message: 'Job queued for retry',
      jobId,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /queues/:queueName/clean
 * Clean completed/failed jobs from queue
 */
router.post('/:queueName/clean', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { queueName } = req.params;
    const { status = 'completed', age = 86400000 } = req.body; // Default 24 hours

    const queue = getQueue(queueName);
    if (!queue) {
      throw new AppError(`Queue '${queueName}' not found`, 404, 'QUEUE_NOT_FOUND');
    }

    const removed = await queue.clean(age, 1000, status);

    logger.info({ queueName, status, removed: removed.length }, 'Queue cleaned');

    sendSuccess(res, {
      message: 'Queue cleaned',
      removed: removed.length,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Convenience endpoints for adding jobs to specific queues
 */

// Add lead processing job
router.post('/lead-processing/process', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, contactId, contactIds, options } = req.body;

    const job = await leadProcessingQueue.add('process', {
      type: type || 'full-pipeline',
      contactId,
      contactIds,
      options,
    });

    sendSuccess(res, {
      message: 'Lead processing job queued',
      jobId: job.id,
    }, 201);
  } catch (error) {
    next(error);
  }
});

// Add scraper job
router.post('/scraper/run', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { type, config } = req.body;

    const job = await scraperQueue.add('scrape', {
      type: type || 'google-maps',
      config: config || { useSettings: true },
    });

    sendSuccess(res, {
      message: 'Scraper job queued',
      jobId: job.id,
    }, 201);
  } catch (error) {
    next(error);
  }
});

// Add campaign enrollment job
router.post('/campaign/enroll', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { batchSize } = req.body;

    const job = await campaignQueue.add('enroll', {
      type: 'enroll',
      batchSize: batchSize || 50,
    });

    sendSuccess(res, {
      message: 'Campaign enrollment job queued',
      jobId: job.id,
    }, 201);
  } catch (error) {
    next(error);
  }
});

export default router;




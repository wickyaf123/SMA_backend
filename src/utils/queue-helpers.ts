import { Queue, Job } from 'bullmq';
import { logger } from './logger';

/**
 * Add a job to a queue with error handling
 */
export async function addJob<T>(
  queue: Queue<T>,
  name: string,
  data: T,
  options?: any
): Promise<Job<T> | null> {
  try {
    const job = await queue.add(name, data, options);
    logger.debug(
      { queue: queue.name, jobId: job.id, name },
      'Job added to queue'
    );
    return job;
  } catch (error) {
    logger.error(
      { queue: queue.name, name, error },
      'Failed to add job to queue'
    );
    return null;
  }
}

/**
 * Get job counts for a queue
 */
export async function getQueueCounts(queue: Queue) {
  try {
    const counts = await queue.getJobCounts();
    return counts;
  } catch (error) {
    logger.error({ queue: queue.name, error }, 'Failed to get queue counts');
    return null;
  }
}

/**
 * Get failed jobs from a queue
 */
export async function getFailedJobs<T>(queue: Queue<T>, limit: number = 10) {
  try {
    const jobs = await queue.getFailed(0, limit - 1);
    return jobs;
  } catch (error) {
    logger.error({ queue: queue.name, error }, 'Failed to get failed jobs');
    return [];
  }
}

/**
 * Retry a failed job
 */
export async function retryFailedJob<T>(queue: Queue<T>, jobId: string) {
  try {
    const job = await queue.getJob(jobId);
    if (!job) {
      logger.warn({ queue: queue.name, jobId }, 'Job not found');
      return false;
    }

    await job.retry();
    logger.info({ queue: queue.name, jobId }, 'Job retried');
    return true;
  } catch (error) {
    logger.error({ queue: queue.name, jobId, error }, 'Failed to retry job');
    return false;
  }
}

/**
 * Remove a job from a queue
 */
export async function removeJob<T>(queue: Queue<T>, jobId: string) {
  try {
    const job = await queue.getJob(jobId);
    if (!job) {
      logger.warn({ queue: queue.name, jobId }, 'Job not found');
      return false;
    }

    await job.remove();
    logger.info({ queue: queue.name, jobId }, 'Job removed');
    return true;
  } catch (error) {
    logger.error({ queue: queue.name, jobId, error }, 'Failed to remove job');
    return false;
  }
}

/**
 * Clean completed jobs older than specified age
 */
export async function cleanQueue(
  queue: Queue,
  maxAge: number = 24 * 60 * 60 * 1000
) {
  try {
    const cleaned = await queue.clean(maxAge, 1000, 'completed');
    logger.info(
      { queue: queue.name, cleaned: cleaned.length },
      'Queue cleaned'
    );
    return cleaned.length;
  } catch (error) {
    logger.error({ queue: queue.name, error }, 'Failed to clean queue');
    return 0;
  }
}

/**
 * Pause a queue
 */
export async function pauseQueue(queue: Queue) {
  try {
    await queue.pause();
    logger.info({ queue: queue.name }, 'Queue paused');
    return true;
  } catch (error) {
    logger.error({ queue: queue.name, error }, 'Failed to pause queue');
    return false;
  }
}

/**
 * Resume a queue
 */
export async function resumeQueue(queue: Queue) {
  try {
    await queue.resume();
    logger.info({ queue: queue.name }, 'Queue resumed');
    return true;
  } catch (error) {
    logger.error({ queue: queue.name, error }, 'Failed to resume queue');
    return false;
  }
}

/**
 * Get queue stats
 */
export async function getQueueStats(queue: Queue) {
  try {
    const [counts, isPaused, jobCounts] = await Promise.all([
      queue.getJobCounts(),
      queue.isPaused(),
      queue.count(),
    ]);

    return {
      name: queue.name,
      counts,
      isPaused,
      total: jobCounts,
    };
  } catch (error) {
    logger.error({ queue: queue.name, error }, 'Failed to get queue stats');
    return null;
  }
}


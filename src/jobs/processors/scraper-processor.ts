/**
 * Scraper Job Processor
 * Handles Shovels permit scraping jobs
 */

import { Job } from 'bullmq';
import { shovelsScraperService } from '../../services/scraper/shovels.service';
import { realtimeEmitter } from '../../services/realtime/event-emitter.service';
import { dailyMetricsService } from '../../services/metrics/daily-metrics.service';
import { logger } from '../../utils/logger';
import type { ScraperJobData } from '../queues';

export async function processScraperJob(job: Job<ScraperJobData>): Promise<any> {
  const { type, config } = job.data;

  logger.info({ jobId: job.id, type, config }, 'Processing scraper job');

  // Emit job started
  realtimeEmitter.emitJobEvent({
    jobId: job.id!,
    jobType: `scraper:${type}`,
    status: 'started',
  });

  const startTime = Date.now();

  try {
    let result: any;

    switch (type) {
      case 'shovels':
        result = await processShovelsScrape(job);
        break;

      default:
        throw new Error(`Unknown scraper type: ${type}`);
    }

    const duration = Date.now() - startTime;

    // Mark job as ran in daily metrics
    if (type === 'shovels') {
      await dailyMetricsService.markJobExecuted('shovelsJobRan');
    }

    // Emit job completed
    realtimeEmitter.emitJobEvent({
      jobId: job.id!,
      jobType: `scraper:${type}`,
      status: 'completed',
      result: {
        ...result,
        duration,
      },
      duration,
    });

    return { ...result, duration };
  } catch (error: any) {
    const duration = Date.now() - startTime;

    // Emit job failed
    realtimeEmitter.emitJobEvent({
      jobId: job.id!,
      jobType: `scraper:${type}`,
      status: 'failed',
      error: error.message,
      duration,
    });

    throw error;
  }
}

async function processShovelsScrape(job: Job): Promise<any> {
  logger.info('Starting Shovels permit scrape');

  await job.updateProgress(10);
  realtimeEmitter.emitJobEvent({
    jobId: job.id!,
    jobType: 'scraper:shovels',
    status: 'progress',
    progress: { current: 0, total: 100, percentage: 10 },
  });

  const result = await shovelsScraperService.runFromSettings();

  await job.updateProgress(100);

  if (result.totalImported > 0) {
    await dailyMetricsService.incrementMetric('contactsImported', result.totalImported);
  }

  return {
    success: true,
    totalScraped: result.totalScraped,
    totalImported: result.totalImported,
    duplicates: result.duplicates,
    filtered: result.filtered,
    searchesRun: result.searchesRun,
  };
}



/**
 * Scraper Job Processor
 * Handles Google Maps (Apify) and Apollo scraping jobs
 */

import { Job } from 'bullmq';
import { GoogleMapsScraperService } from '../../services/scraper/google-maps.service';
import { leadIngestionService } from '../../services/lead/ingestion.service';
import { settingsService } from '../../services/settings/settings.service';
import { realtimeEmitter } from '../../services/realtime/event-emitter.service';
import { dailyMetricsService } from '../../services/metrics/daily-metrics.service';
import { logger } from '../../utils/logger';
import type { ScraperJobData } from '../queues';

const googleMapsService = new GoogleMapsScraperService();

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
      case 'google-maps':
        result = await processGoogleMapsScrape(job, config);
        break;

      case 'apollo':
        result = await processApolloScrape(job, config);
        break;

      default:
        throw new Error(`Unknown scraper type: ${type}`);
    }

    const duration = Date.now() - startTime;

    // Mark job as ran in daily metrics
    if (type === 'google-maps') {
      await dailyMetricsService.markJobExecuted('scrapeJobRan');
    } else if (type === 'apollo') {
      await dailyMetricsService.markJobExecuted('apolloJobRan');
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

/**
 * Process Google Maps scraping via Apify
 */
async function processGoogleMapsScrape(
  job: Job,
  config: ScraperJobData['config']
): Promise<any> {
  // Get settings from database if useSettings is true
  let finalConfig = config;

  if (config.useSettings) {
    const apifySettings = await settingsService.getApifySettings();
    finalConfig = {
      query: config.query || apifySettings.query,
      location: config.location || apifySettings.location,
      maxResults: config.maxResults || apifySettings.maxResults,
    };
  }

  const query = finalConfig.query || 'HVAC companies';
  const location = finalConfig.location || 'United States';
  const maxResults = finalConfig.maxResults || 50;

  logger.info({ query, location, maxResults }, 'Starting Google Maps scrape');

  // Emit progress - starting
  await job.updateProgress(10);
  realtimeEmitter.emitJobEvent({
    jobId: job.id!,
    jobType: 'scraper:google-maps',
    status: 'progress',
    progress: { current: 0, total: maxResults, percentage: 10 },
  });

  // Run the scraper
  const result = await googleMapsService.scrapeByIndustryAndLocation(
    query,
    location,
    { maxResults }
  );

  // Emit final progress
  await job.updateProgress(100);

  // Update metrics
  if (result.totalImported > 0) {
    await dailyMetricsService.incrementMetric('contactsImported', result.totalImported);
  }

  return {
    success: true,
    totalScraped: result.totalScraped,
    totalImported: result.totalImported,
    query,
    location,
  };
}

/**
 * Process Apollo scraping and enrichment
 */
async function processApolloScrape(
  job: Job,
  config: ScraperJobData['config']
): Promise<any> {
  // Get settings from database
  const apolloSettings = await settingsService.getApolloSettings();

  const industry = config.industry || apolloSettings.industry;
  const enrichLimit = config.enrichLimit || apolloSettings.enrichLimit;

  logger.info({ industry, enrichLimit }, 'Starting Apollo scrape');

  // Emit progress - starting
  await job.updateProgress(10);
  realtimeEmitter.emitJobEvent({
    jobId: job.id!,
    jobType: 'scraper:apollo',
    status: 'progress',
    progress: { current: 0, total: enrichLimit, percentage: 10 },
  });

  // Build search params from settings
  const searchParams = {
    q_organization_industry_tag_ids: [industry],
    person_titles: apolloSettings.personTitles,
    person_locations: apolloSettings.locations,
    per_page: Math.min(enrichLimit, 100),
  };

  // Run Apollo import
  const result = await leadIngestionService.importFromApollo(
    searchParams as any,
    enrichLimit
  );

  // Emit final progress
  await job.updateProgress(100);

  // Update metrics
  if (result.imported > 0) {
    await dailyMetricsService.incrementMetric('contactsImported', result.imported);
  }

  return {
    success: true,
    totalSearched: result.total,
    totalImported: result.imported,
    duplicates: result.duplicates,
    invalid: result.invalid,
    industry,
  };
}




/**
 * Scrape Job (DEPRECATED)
 * Google Maps scraping via Apify has been replaced by Shovels permit intelligence.
 * See: shovels-scrape.job.ts
 */

import { logger } from '../utils/logger';

export interface ScrapeJobConfig {
  useSettings?: boolean;
}

export interface ScrapeJobResult {
  success: boolean;
  totalScraped: number;
  totalImported: number;
  errors: string[];
  duration: number;
}

export class ScrapeJob {
  async run(_config?: ScrapeJobConfig): Promise<ScrapeJobResult> {
    logger.warn('Google Maps scrape job is deprecated. Use Shovels scraper instead.');
    return {
      success: false,
      totalScraped: 0,
      totalImported: 0,
      errors: ['Deprecated: Use Shovels scraper instead.'],
      duration: 0,
    };
  }
}

export const scrapeJob = new ScrapeJob();

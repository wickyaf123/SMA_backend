/**
 * Apollo Scrape Job (DEPRECATED)
 * Apollo.io has been replaced by Shovels permit intelligence.
 * See: shovels-scrape.job.ts
 */

import { logger } from '../utils/logger';

export interface ApolloJobConfig {
  industry?: string;
  enrichLimit?: number;
  skipCreditCheck?: boolean;
}

export interface ApolloJobResult {
  success: boolean;
  industry: string;
  totalSearched: number;
  totalEnriched: number;
  creditsUsed: number;
  creditsRemaining: number;
  errors: string[];
  duration: number;
  skippedDueToLimit: boolean;
}

export class ApolloScrapeJob {
  async run(_config: ApolloJobConfig = {}): Promise<ApolloJobResult> {
    logger.warn('Apollo scrape job is deprecated. Use Shovels scraper instead.');
    return {
      success: false,
      industry: 'none',
      totalSearched: 0,
      totalEnriched: 0,
      creditsUsed: 0,
      creditsRemaining: 0,
      errors: ['Deprecated: Use Shovels scraper instead.'],
      duration: 0,
      skippedDueToLimit: false,
    };
  }
}

export const apolloScrapeJob = new ApolloScrapeJob();

/**
 * Apify Client for Google Maps Scraping
 * Phase 3.5 - Track A Data Source
 */

import { ApifyClient as ApifySDK } from 'apify-client';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { retryWithBackoff } from '../../utils/retry';
import type {
  ApifyGoogleMapsInput,
  ApifyBusinessListing,
  ApifyActorRun,
  ApifyDatasetListResponse,
} from './types';

/**
 * Apify Actor ID for Google Maps Scraper
 * Actor: compass/crawler-google-places
 */
const GOOGLE_MAPS_ACTOR_ID = 'nwua9Gu5YrADL7ZDj';

export class ApifyClient {
  private client: ApifySDK;

  constructor() {
    if (!config.apify.apiKey) {
      throw new Error('APIFY_API_KEY is not configured');
    }

    this.client = new ApifySDK({
      token: config.apify.apiKey,
    });

    logger.info('Apify client initialized');
  }

  /**
   * Scrape Google Maps for business listings
   */
  async scrapeGoogleMaps(input: ApifyGoogleMapsInput): Promise<ApifyActorRun> {
    try {
      logger.info(
        {
          searchStrings: input.searchStringsArray,
          location: input.locationQuery,
          maxResults: input.maxCrawledPlacesPerSearch,
        },
        'Starting Google Maps scrape'
      );

      const run = await retryWithBackoff(
        () => this.client.actor(GOOGLE_MAPS_ACTOR_ID).call(input)
      );

      logger.info(
        {
          runId: run.id,
          status: run.status,
          datasetId: run.defaultDatasetId,
        },
        'Google Maps scrape started'
      );

      return run as any as ApifyActorRun;
    } catch (error) {
      logger.error({ error, input }, 'Failed to start Google Maps scrape');
      throw error;
    }
  }

  /**
   * Get actor run status
   */
  async getRunStatus(runId: string): Promise<ApifyActorRun> {
    try {
      const run = await this.client.run(runId).get();
      return run as any as ApifyActorRun;
    } catch (error) {
      logger.error({ error, runId }, 'Failed to get run status');
      throw error;
    }
  }

  /**
   * Wait for actor run to complete
   */
  async waitForRun(
    runId: string,
    timeoutMs: number = 300000 // 5 minutes
  ): Promise<ApifyActorRun> {
    const startTime = Date.now();
    const pollInterval = 5000; // 5 seconds

    logger.info({ runId, timeoutMs }, 'Waiting for run to complete');

    while (Date.now() - startTime < timeoutMs) {
      const run = await this.getRunStatus(runId);

      if (run.status === 'SUCCEEDED') {
        logger.info({ runId, durationMs: run.stats?.durationMillis }, 'Run completed successfully');
        return run;
      }

      if (run.status === 'FAILED' || run.status === 'ABORTED') {
        throw new Error(`Run ${run.status}: ${run.statusMessage || 'Unknown error'}`);
      }

      // Still running, wait and poll again
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
      logger.debug({ runId, status: run.status }, 'Run still in progress');
    }

    throw new Error(`Run timed out after ${timeoutMs}ms`);
  }

  /**
   * Get results from dataset
   */
  async getDatasetItems(
    datasetId: string,
    options?: {
      offset?: number;
      limit?: number;
      clean?: boolean;
    }
  ): Promise<ApifyDatasetListResponse> {
    try {
      logger.info({ datasetId, options }, 'Fetching dataset items');

      const result = await this.client.dataset(datasetId).listItems({
        offset: options?.offset || 0,
        limit: options?.limit || 1000,
        clean: options?.clean !== false, // default true
      });

      logger.info(
        {
          datasetId,
          count: result.count,
          total: result.total,
        },
        'Dataset items fetched'
      );

      return result as any as ApifyDatasetListResponse;
    } catch (error) {
      logger.error({ error, datasetId }, 'Failed to fetch dataset items');
      throw error;
    }
  }

  /**
   * Scrape and wait for results (convenience method)
   */
  async scrapeAndWait(
    input: ApifyGoogleMapsInput,
    timeoutMs?: number
  ): Promise<ApifyBusinessListing[]> {
    const run = await this.scrapeGoogleMaps(input);
    const completedRun = await this.waitForRun(run.id, timeoutMs);

    if (!completedRun.defaultDatasetId) {
      throw new Error('No dataset ID in completed run');
    }

    const dataset = await this.getDatasetItems(completedRun.defaultDatasetId);
    return dataset.items;
  }

  /**
   * Quick scrape for testing (10 results)
   */
  async quickScrape(
    searchQuery: string,
    location: string
  ): Promise<ApifyBusinessListing[]> {
    const input: ApifyGoogleMapsInput = {
      searchStringsArray: [searchQuery],
      locationQuery: location,
      maxCrawledPlacesPerSearch: 10,
      language: 'en',
      skipClosedPlaces: true,
      website: 'allPlaces',
      scrapePlaceDetailPage: false,
      scrapeContacts: false,
      maxReviews: 0,
      maxImages: 0,
    };

    return this.scrapeAndWait(input, 180000); // 3 minute timeout for quick scrape
  }

  /**
   * Convert numeric rating to Apify's expected string format
   * Apify accepts: "", "two", "twoAndHalf", "three", "threeAndHalf", "four", "fourAndHalf"
   */
  private convertRatingToApifyFormat(rating?: number): string {
    if (!rating || rating <= 0) return '';
    if (rating < 2.5) return 'two';
    if (rating < 3) return 'twoAndHalf';
    if (rating < 3.5) return 'three';
    if (rating < 4) return 'threeAndHalf';
    if (rating < 4.5) return 'four';
    return 'fourAndHalf';
  }

  /**
   * Production scrape (configurable)
   */
  async productionScrape(
    searchQuery: string,
    location: string,
    maxResults: number = 100,
    options?: {
      minRating?: number;
      requireWebsite?: boolean;
      skipClosed?: boolean;
    }
  ): Promise<ApifyBusinessListing[]> {
    // Ensure maxResults is always an integer (Apify requirement)
    const safeMaxResults = Math.max(1, Math.floor(maxResults));
    
    const input: ApifyGoogleMapsInput = {
      searchStringsArray: [searchQuery],
      locationQuery: location,
      maxCrawledPlacesPerSearch: safeMaxResults,
      language: 'en',
      skipClosedPlaces: options?.skipClosed !== false,
      website: options?.requireWebsite ? 'withWebsite' : 'allPlaces',
      placeMinimumStars: this.convertRatingToApifyFormat(options?.minRating),
      scrapePlaceDetailPage: false,
      scrapeContacts: false,
      maxReviews: 0,
      maxImages: 0,
    };

    return this.scrapeAndWait(input, 600000); // 10 minute timeout for production
  }

  /**
   * Batch scrape multiple locations
   */
  async batchScrapeLocations(
    searchQuery: string,
    locations: string[],
    maxPerLocation: number = 100
  ): Promise<{
    allResults: ApifyBusinessListing[];
    byLocation: Record<string, ApifyBusinessListing[]>;
  }> {
    logger.info(
      {
        searchQuery,
        locationCount: locations.length,
        maxPerLocation,
      },
      'Starting batch scrape'
    );

    const allResults: ApifyBusinessListing[] = [];
    const byLocation: Record<string, ApifyBusinessListing[]> = {};

    for (const location of locations) {
      try {
        logger.info({ searchQuery, location }, 'Scraping location');

        const results = await this.productionScrape(searchQuery, location, maxPerLocation);

        allResults.push(...results);
        byLocation[location] = results;

        logger.info(
          {
            location,
            resultCount: results.length,
          },
          'Location scraped successfully'
        );

        // Add delay between locations to be respectful
        if (locations.indexOf(location) < locations.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000)); // 2 second delay
        }
      } catch (error) {
        logger.error(
          { error, searchQuery, location },
          'Failed to scrape location'
        );
        byLocation[location] = [];
      }
    }

    logger.info(
      {
        totalResults: allResults.length,
        locationsSucceeded: Object.values(byLocation).filter((r) => r.length > 0).length,
      },
      'Batch scrape completed'
    );

    return { allResults, byLocation };
  }

  /**
   * Get account usage stats
   */
  async getAccountInfo(): Promise<any> {
    try {
      const user = await this.client.user('me').get();
      logger.info({ userId: user.id, username: user.username }, 'Account info retrieved');
      return user;
    } catch (error) {
      logger.error({ error }, 'Failed to get account info');
      throw error;
    }
  }
}

// Singleton instance
let apifyClientInstance: ApifyClient | null = null;

export function getApifyClient(): ApifyClient {
  if (!apifyClientInstance) {
    apifyClientInstance = new ApifyClient();
  }
  return apifyClientInstance;
}


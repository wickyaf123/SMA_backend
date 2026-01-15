/**
 * Scrape Job
 * Daily Google Maps scraping via Apify
 * Day 8: Daily Automation
 * Updated: Uses scraper settings from database
 */

import { GoogleMapsScraperService } from '../services/scraper/google-maps.service';
import { settingsService } from '../services/settings/settings.service';
import { logger } from '../utils/logger';

const scraperService = new GoogleMapsScraperService();

export interface ScrapeJobConfig {
  query?: string;
  maxResults?: number;
  location?: string;
  minRating?: number;
  requirePhone?: boolean;
  requireWebsite?: boolean;
  skipClosed?: boolean;
  useSettings?: boolean; // If true, fetch config from database
}

export interface ScrapeJobResult {
  success: boolean;
  totalScraped: number;
  totalImported: number;
  errors: string[];
  duration: number;
  configUsed?: ScrapeJobConfig;
}

export class ScrapeJob {
  /**
   * Run the scrape job
   * If config.useSettings is true or no config provided, uses database settings
   */
  async run(config?: ScrapeJobConfig): Promise<ScrapeJobResult> {
    const startTime = Date.now();
    let finalConfig: ScrapeJobConfig;

    try {
      // Fetch settings from database if useSettings is true or no config provided
      if (!config || config.useSettings) {
        const apifySettings = await settingsService.getApifySettings();
        finalConfig = {
          query: config?.query || apifySettings.query,
          maxResults: config?.maxResults || apifySettings.maxResults,
          location: config?.location || apifySettings.location,
          minRating: apifySettings.minRating,
          requirePhone: apifySettings.requirePhone,
          requireWebsite: apifySettings.requireWebsite,
          skipClosed: apifySettings.skipClosed,
        };
        logger.info({ settings: finalConfig }, 'Using scraper settings from database');
      } else {
        finalConfig = {
          query: config.query || 'HVAC companies',
          maxResults: config.maxResults || 10,
          location: config.location || 'United States',
          minRating: config.minRating,
          requirePhone: config.requirePhone,
          requireWebsite: config.requireWebsite,
          skipClosed: config.skipClosed,
        };
      }

      logger.info({ config: finalConfig }, 'Starting scrape job');

      const result = await scraperService.scrapeByIndustryAndLocation(
        finalConfig.query!,
        finalConfig.location || 'United States',
        { 
          maxResults: finalConfig.maxResults,
          minRating: finalConfig.minRating,
          requirePhone: finalConfig.requirePhone,
          requireWebsite: finalConfig.requireWebsite,
          skipClosed: finalConfig.skipClosed,
        }
      );

      const duration = Date.now() - startTime;

      logger.info(
        {
          totalScraped: result.totalScraped,
          totalImported: result.totalImported,
          duration,
        },
        'Scrape job completed successfully'
      );

      return {
        success: true,
        totalScraped: result.totalScraped,
        totalImported: result.totalImported,
        errors: [],
        duration,
        configUsed: finalConfig,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error({ error: error.message, duration }, 'Scrape job failed');

      return {
        success: false,
        totalScraped: 0,
        totalImported: 0,
        errors: [error.message],
        duration,
      };
    }
  }
}

export const scrapeJob = new ScrapeJob();

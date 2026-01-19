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
   * Requires configuration from database settings
   */
  async run(config?: ScrapeJobConfig): Promise<ScrapeJobResult> {
    const startTime = Date.now();

    try {
      // Check if configured
      const isConfigured = await settingsService.isApifyConfigured();
      if (!isConfigured) {
        logger.warn('Google Maps scraper not configured. Skipping job.');
        return {
          success: false,
          totalScraped: 0,
          totalImported: 0,
          errors: ['Google Maps scraper is not configured. Please configure search terms, locations, and industries in Settings.'],
          duration: Date.now() - startTime,
        };
      }

      // Fetch settings from database (no defaults)
      const apifySettings = await settingsService.getApifySettings();
      
      // Use settings (throw error if missing, don't use fallback defaults)
      const finalConfig = {
        searchTerms: apifySettings.searchTerms,
        locations: apifySettings.locations,
        industries: apifySettings.industries,
        maxResults: apifySettings.maxResults,
        minRating: apifySettings.minRating,
        requirePhone: apifySettings.requirePhone,
        requireWebsite: apifySettings.requireWebsite,
        skipClosed: apifySettings.skipClosed,
      };

      logger.info({ config: finalConfig }, 'Starting scrape job with settings from database');

      // Use first search term and location for simple scrape
      const result = await scraperService.scrapeByIndustryAndLocation(
        finalConfig.searchTerms[0],
        finalConfig.locations[0],
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

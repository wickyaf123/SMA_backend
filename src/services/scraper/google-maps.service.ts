/**
 * Google Maps Scraper Service (DEPRECATED)
 * Replaced by Shovels permit intelligence. See: shovels.service.ts
 * Kept as stubs so existing route handlers compile without errors.
 */

import { logger } from '../../utils/logger';

export interface GoogleMapsImportOptions {
  industry: 'SOLAR' | 'HVAC' | 'ROOFING';
  metros?: string[];
  searchTerms?: string[];
  maxPerMetro?: number;
  minReviews?: number;
  minRating?: number;
  skipClosed?: boolean;
  requireWebsite?: boolean;
}

export interface GoogleMapsImportResult {
  jobId: string;
  totalScraped: number;
  totalImported: number;
  duplicates: number;
  excluded: number;
  skippedByPlaceId: number;
  errors: number;
  byMetro: Record<string, {
    scraped: number;
    imported: number;
    excluded: number;
    skippedByPlaceId: number;
  }>;
}

const DEPRECATED_RESULT: GoogleMapsImportResult = {
  jobId: 'deprecated',
  totalScraped: 0,
  totalImported: 0,
  duplicates: 0,
  excluded: 0,
  skippedByPlaceId: 0,
  errors: 0,
  byMetro: {},
};

export class GoogleMapsScraperService {
  async importContractorLeads(_options: GoogleMapsImportOptions): Promise<GoogleMapsImportResult> {
    logger.warn('Google Maps scraper is deprecated. Use Shovels permit scraper instead.');
    return DEPRECATED_RESULT;
  }

  async scrapeByIndustryAndLocation(_query: string, _location: string, _options?: any): Promise<{ totalScraped: number; totalImported: number }> {
    logger.warn('Google Maps scraper is deprecated. Use Shovels permit scraper instead.');
    return { totalScraped: 0, totalImported: 0 };
  }

  async quickTest(_query: string, _location: string): Promise<any[]> {
    logger.warn('Google Maps scraper is deprecated. Use Shovels permit scraper instead.');
    return [];
  }

  async batchImportAllIndustries(_options?: any): Promise<GoogleMapsImportResult[]> {
    logger.warn('Google Maps scraper is deprecated. Use Shovels permit scraper instead.');
    return [];
  }
}

export const googleMapsScraperService = new GoogleMapsScraperService();

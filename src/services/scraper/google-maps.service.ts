/**
 * Google Maps Scraper Service
 * Handles importing contractor leads from Google Maps via Apify
 */

import { getApifyClient } from '../../integrations/apify/client';
import type { ApifyBusinessListing } from '../../integrations/apify/types';
import { normalizeApifyListing } from '../../integrations/apify/normalizer';
import { logger } from '../../utils/logger';
import { importJobService } from '../import/import-job.service';
import { ImportJobType } from '@prisma/client';
import { leadIngestionService } from '../lead/ingestion.service';
import { prisma } from '../../config/database';
import { shouldExcludeCompany } from '../../integrations/contractor-constants';
import { settingsService } from '../settings/settings.service';
import { AppError } from '../../utils/errors';

export interface GoogleMapsImportOptions {
  industry: 'SOLAR' | 'HVAC' | 'ROOFING';
  metros?: string[]; // If not provided, uses TARGET_METROS
  searchTerms?: string[]; // If not provided, uses defaults from constants
  maxPerMetro?: number; // Default: 100
  minReviews?: number; // Default: 10
  minRating?: number; // Default: 3.5
  skipClosed?: boolean; // Default: true
  requireWebsite?: boolean; // Default: false
}

export interface GoogleMapsImportResult {
  jobId: string;
  totalScraped: number;
  totalImported: number;
  duplicates: number;
  excluded: number; // Filtered out by negative keywords
  skippedByPlaceId: number; // Already scraped businesses (by Google Place ID)
  errors: number;
  byMetro: Record<string, {
    scraped: number;
    imported: number;
    excluded: number;
    skippedByPlaceId: number;
  }>;
}

export class GoogleMapsScraperService {
  private apifyClient = getApifyClient();

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string): string | null {
    if (!url) return null;
    try {
      let domain = url.replace(/^https?:\/\//i, '');
      domain = domain.replace(/^www\./i, '');
      domain = domain.split('/')[0];
      domain = domain.split(':')[0];
      return domain.toLowerCase();
    } catch {
      return null;
    }
  }

  /**
   * Get existing Place IDs from the database to prevent re-importing
   * This prevents scraping the same businesses multiple times
   */
  private async getExistingPlaceIds(): Promise<Set<string>> {
    try {
      // Query contacts with google_maps source - use the dedicated googlePlaceId column
      // and fall back to enrichmentData for legacy records
      const contacts = await prisma.contact.findMany({
        where: {
          source: 'google_maps',
        },
      });

      const placeIds = new Set<string>();
      
      for (const contact of contacts) {
        // Prefer the dedicated googlePlaceId column (cast needed due to Prisma type cache)
        const googlePlaceId = (contact as any).googlePlaceId as string | null;
        if (googlePlaceId) {
          placeIds.add(googlePlaceId);
        } else {
          // Fall back to enrichmentData for legacy records without the column populated
          const placeId = (contact.enrichmentData as any)?.placeId;
          if (placeId) {
            placeIds.add(placeId);
          }
        }
      }

      logger.info({ count: placeIds.size }, 'Loaded existing Place IDs for deduplication');
      return placeIds;
    } catch (error) {
      logger.error({ error }, 'Failed to load existing Place IDs, continuing without dedup');
      return new Set<string>();
    }
  }

  /**
   * Filter out already-scraped businesses by Place ID
   * Returns new businesses that haven't been imported before
   */
  private filterNewBusinesses(
    listings: ApifyBusinessListing[],
    existingPlaceIds: Set<string>
  ): { newListings: ApifyBusinessListing[]; skipped: number } {
    const newListings = listings.filter(listing => {
      // Keep listings without placeId (will be deduped by email later)
      if (!listing.placeId) return true;
      // Filter out if placeId already exists
      return !existingPlaceIds.has(listing.placeId);
    });

    const skipped = listings.length - newListings.length;
    
    if (skipped > 0) {
      logger.info({
        total: listings.length,
        new: newListings.length,
        skipped,
      }, 'Filtered out already-scraped businesses by Place ID');
    }

    return { newListings, skipped };
  }

  /**
   * Import contractor leads from Google Maps
   */
  async importContractorLeads(
    options: GoogleMapsImportOptions
  ): Promise<GoogleMapsImportResult> {
    // Get settings - will throw if not configured
    const scraperSettings = await settingsService.getApifySettings();
    
    // Use settings as source of truth (no fallback defaults)
    const {
      industry,
      metros = scraperSettings.locations,
      searchTerms = scraperSettings.searchTerms,
      maxPerMetro = scraperSettings.maxResults,
      minRating = scraperSettings.minRating,
      skipClosed = scraperSettings.skipClosed,
      requireWebsite = scraperSettings.requireWebsite,
    } = options;

    // Validate that industry is one of configured industries
    if (!scraperSettings.industries.includes(industry)) {
      throw new AppError(
        `Industry '${industry}' not configured. Configured industries: ${scraperSettings.industries.join(', ')}`,
        400,
        'INDUSTRY_NOT_CONFIGURED'
      );
    }

    // Create import job (cast needed due to Prisma type cache)
    const jobId = await importJobService.createJob(
      'SCRAPER' as any,
      metros.length * maxPerMetro,
      { industry, metros, searchTerms }
    );

    try {
      await importJobService.startJob(jobId);

      logger.info({
        jobId,
          industry,
        metroCount: metros.length,
        searchTerms,
        maxPerMetro,
      }, 'Starting Google Maps contractor scrape');

      const result: GoogleMapsImportResult = {
        jobId,
        totalScraped: 0,
        totalImported: 0,
        duplicates: 0,
        excluded: 0,
        skippedByPlaceId: 0,
        errors: 0,
        byMetro: {},
      };

      // Load existing Place IDs once before processing to prevent re-importing
      const existingPlaceIds = await this.getExistingPlaceIds();

      const allContacts: any[] = [];

      // Scrape each metro area
      for (const metro of metros) {
        try {
          logger.info({ metro, industry }, 'Scraping metro area');

          const metroResults: ApifyBusinessListing[] = [];

          // Scrape with each search term for this metro
          for (const searchTerm of searchTerms) {
            try {
              // Must be integer - Apify requires whole numbers
              const resultsPerTerm = Math.ceil(maxPerMetro / searchTerms.length);
              
              const businesses = await this.apifyClient.productionScrape(
                searchTerm,
                metro,
                resultsPerTerm,
                {
                  // Basic filters
                  minRating,
                  requireWebsite,
                  skipClosed,
                  
                  // Extended scraping options
                  language: scraperSettings.language,
                  searchMatching: scraperSettings.searchMatching,
                  scrapePlaceDetails: scraperSettings.scrapePlaceDetails,
                  scrapeContacts: scraperSettings.scrapeContacts,
                  scrapeReviews: scraperSettings.scrapeReviews,
                  maxReviews: scraperSettings.maxReviews,
                  scrapeSocialMedia: scraperSettings.scrapeSocialMedia as any,
                }
              );

              metroResults.push(...businesses);

              logger.info({
                metro,
                searchTerm,
                count: businesses.length,
              }, 'Search term scraped');
            } catch (error) {
              logger.error({
                metro,
                searchTerm,
                error,
              }, 'Failed to scrape search term');
            }
          }

          // Filter out already-scraped businesses by Place ID
          const { newListings: newBusinesses, skipped: skippedByPlaceId } = 
            this.filterNewBusinesses(metroResults, existingPlaceIds);

          // Filter by quality criteria (on new businesses only)
          const qualityFiltered = newBusinesses.filter(business => {
            // Check review count (if configured)
            if (scraperSettings.minReviewCount && business.reviewsCount && business.reviewsCount < scraperSettings.minReviewCount) {
              return false;
            }

            // Check rating
            if (business.totalScore && business.totalScore < minRating) {
              return false;
            }

            // Check closed status
            if (skipClosed && (business.permanentlyClosed || business.temporarilyClosed)) {
              return false;
            }

            return true;
          });

          // Filter by company name (exclude wholesalers, manufacturers, etc.)
          const nameFiltered = qualityFiltered.filter(business => {
            if (shouldExcludeCompany(business.title)) {
              logger.debug({
                businessName: business.title,
                reason: 'Excluded company term in name',
              }, 'Excluding business');
              return false;
            }
            return true;
          });

          const excluded = qualityFiltered.length - nameFiltered.length;

          // Normalize to contact format
          const normalizedContacts = nameFiltered
            .map(business => {
              try {
                const normalized = normalizeApifyListing(business);
                if (!normalized) return null;
                
                // Convert to contact format for ingestion
                // Note: email can be null - will be enriched via Hunter.io later
                return {
                  email: normalized.email || null,
                  needsEmailEnrichment: !normalized.email, // Flag for Hunter enrichment
                  firstName: null,
                  lastName: null,
                  fullName: null,
                  title: null,
                  phone: normalized.phone,
                  phoneFormatted: normalized.phoneFormatted,
                  linkedinUrl: null,
                  city: normalized.city,
                  state: normalized.state,
                  country: normalized.country,
                  timezone: null,
                  source: 'google_maps' as const,
                  sourceId: normalized.placeId || `gm-${Date.now()}`,
                  apolloId: null,
                  googlePlaceId: normalized.placeId || null, // For deduplication
                  enrichmentData: {
                    googleMapsUrl: normalized.googleMapsUrl,
                    placeId: normalized.placeId,
                    rating: normalized.rating,
                    reviewCount: normalized.reviewCount,
                    businessStatus: normalized.rawData.businessStatus,
                    socialProfiles: normalized.socialProfiles, // NEW
                    reviews: normalized.reviews, // NEW
                    openingHours: normalized.openingHours, // NEW
                  },
                  company: {
                    name: normalized.businessName,
                    domain: normalized.website ? this.extractDomain(normalized.website) : null,
                    website: normalized.website || null,
                    phone: normalized.phone || null,
                    industry: normalized.category || null,
                    size: null,
                    estimatedEmployees: null,
                    estimatedRevenue: null,
                    estimatedRevenueRange: null,
                    location: null,
                    city: normalized.city || null,
                    state: normalized.state || null,
                    country: normalized.country || null,
                    address: normalized.address || null,
                    linkedinUrl: null,
                    foundedYear: null,
                    description: null,
                    apolloId: null,
                    enrichmentData: {},
                  },
                };
              } catch (error) {
                logger.error({
                  business: business.title,
                  error,
                }, 'Failed to normalize business');
                return null;
              }
            })
            .filter(Boolean) as any[];

          allContacts.push(...normalizedContacts);

          // Track by metro
          result.byMetro[metro] = {
            scraped: metroResults.length,
            imported: normalizedContacts.length,
            excluded,
            skippedByPlaceId,
          };

          result.totalScraped += metroResults.length;
          result.excluded += excluded;
          result.skippedByPlaceId += skippedByPlaceId;

          logger.info({
            metro,
            scraped: metroResults.length,
            newBusinesses: newBusinesses.length,
            skippedByPlaceId,
            qualityFiltered: qualityFiltered.length,
            nameFiltered: nameFiltered.length,
            excluded,
          }, 'Metro area completed');

          // Small delay between metros
          if (metros.indexOf(metro) < metros.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        } catch (error) {
          logger.error({
            metro,
            error,
          }, 'Failed to scrape metro area');
        }
      }

      // Deduplicate contacts (by email or phone)
      const uniqueContacts = this.deduplicateContacts(allContacts);
      result.duplicates = allContacts.length - uniqueContacts.length;

      logger.info({
        jobId,
        totalContacts: allContacts.length,
        uniqueContacts: uniqueContacts.length,
        duplicates: result.duplicates,
      }, 'Deduplication complete');

      // Import contacts using lead ingestion service
      const importResult = await (leadIngestionService as any).processContacts(
        jobId,
        uniqueContacts
      );

      result.totalImported = importResult.imported;
      result.errors = importResult.errors.length;

      await importJobService.completeJob(jobId);

      logger.info({
        jobId,
        result,
      }, 'Google Maps import completed');

      return result;
    } catch (error: any) {
      await importJobService.failJob(jobId, error.message);
      logger.error({
        jobId,
        error,
      }, 'Google Maps import failed');
      throw error;
    }
  }

  /**
   * Scrape by query and location (used by daily scrape job)
   * Simple interface for general-purpose scraping
   */
  async scrapeByIndustryAndLocation(
    query: string,
    location: string,
    options?: {
      maxResults?: number;
      minRating?: number;
      requirePhone?: boolean;
      requireWebsite?: boolean;
      skipClosed?: boolean;
    }
  ): Promise<{
    totalScraped: number;
    totalImported: number;
    skippedByPlaceId: number;
    errors: number;
  }> {
    const maxResults = options?.maxResults || 50;

    logger.info({ query, location, maxResults }, 'Scraping Google Maps by query and location');

    try {
      // Get settings for extended options
      const scraperSettings = await settingsService.getApifySettings();
      
      // Run Apify scrape using production method
      const rawListings = await this.apifyClient.productionScrape(
        query,
        location,
        maxResults,
        {
          minRating: options?.minRating,
          requireWebsite: options?.requireWebsite,
          skipClosed: options?.skipClosed ?? true,
          
          // Extended scraping options from settings
          language: scraperSettings.language,
          searchMatching: scraperSettings.searchMatching,
          scrapePlaceDetails: scraperSettings.scrapePlaceDetails,
          scrapeContacts: scraperSettings.scrapeContacts,
          scrapeReviews: scraperSettings.scrapeReviews,
          maxReviews: scraperSettings.maxReviews,
          scrapeSocialMedia: scraperSettings.scrapeSocialMedia as any,
        }
      );

      logger.info({ count: rawListings.length }, 'Raw listings received from Apify');

      // Filter out already-scraped businesses by Place ID
      const existingPlaceIds = await this.getExistingPlaceIds();
      const { newListings, skipped: skippedByPlaceId } = this.filterNewBusinesses(rawListings, existingPlaceIds);

      logger.info({
        raw: rawListings.length,
        new: newListings.length,
        skippedByPlaceId,
      }, 'Filtered by existing Place IDs');

      // Filter by quality criteria (on new listings only)
      let filteredListings = newListings;

      if (options?.minRating) {
        filteredListings = filteredListings.filter(
          (l) => l.totalScore && l.totalScore >= options.minRating!
        );
      }

      if (options?.requirePhone) {
        filteredListings = filteredListings.filter((l) => l.phone);
      }

      if (options?.requireWebsite) {
        filteredListings = filteredListings.filter((l) => l.website);
      }

      logger.info(
        { filtered: filteredListings.length, original: rawListings.length },
        'Listings after quality filters'
      );

      // Normalize and prepare for import (filter out nulls)
      const normalizedListings = filteredListings
        .map((listing) => normalizeApifyListing(listing))
        .filter((listing): listing is NonNullable<typeof listing> => listing !== null);

      // Convert to contact format for processContacts
      // Note: email can be null - will be enriched via Hunter.io later
      const contacts = normalizedListings.map((listing) => ({
        email: listing.email || null,
        needsEmailEnrichment: !listing.email, // Flag for Hunter enrichment
        firstName: null,
        lastName: null,
        fullName: null,
        title: null,
        phone: listing.phone,
        phoneFormatted: listing.phoneFormatted,
        linkedinUrl: null,
        city: listing.city,
        state: listing.state,
        country: listing.country,
        timezone: null,
        source: 'google_maps' as const,
        sourceId: listing.placeId || `gm-${Date.now()}`,
        apolloId: null,
        googlePlaceId: listing.placeId || null, // For deduplication
        enrichmentData: {
          googleMapsUrl: listing.googleMapsUrl,
          placeId: listing.placeId,
          rating: listing.rating,
          reviewCount: listing.reviewCount,
          socialProfiles: listing.socialProfiles, // NEW
          reviews: listing.reviews, // NEW
          openingHours: listing.openingHours, // NEW
        },
        company: {
          name: listing.businessName,
          domain: listing.website ? this.extractDomain(listing.website) : null,
          website: listing.website || null,
          phone: listing.phone || null,
          industry: listing.category || null,
          size: null,
          estimatedEmployees: null,
          estimatedRevenue: null,
          estimatedRevenueRange: null,
          location: null,
          city: listing.city || null,
          state: listing.state || null,
          country: listing.country || null,
          address: listing.address || null,
          linkedinUrl: null,
          foundedYear: null,
          description: null,
          apolloId: null,
          enrichmentData: {},
        },
      }));

      // Create import job for tracking (cast needed due to Prisma type cache)
      const jobId = await importJobService.createJob(
        'SCRAPER' as any,
        contacts.length,
        { query, location }
      );

      await importJobService.startJob(jobId);

      // Import via lead ingestion service processContacts
      const importResult = await (leadIngestionService as any).processContacts(
        jobId,
        contacts
      );

      await importJobService.completeJob(jobId);

      const importedCount = importResult.imported;
      const errorCount = importResult.errors.length;

      logger.info(
        { totalScraped: rawListings.length, totalImported: importedCount, skippedByPlaceId, errors: errorCount },
        'Scrape by query completed'
      );

      return {
        totalScraped: rawListings.length,
        totalImported: importedCount,
        skippedByPlaceId,
        errors: errorCount,
      };
    } catch (error: any) {
      logger.error({ error: error.message }, 'scrapeByIndustryAndLocation failed');
      throw error;
    }
  }

  /**
   * Quick test scrape (single metro, limited results)
   */
  async quickTest(
    industry: 'SOLAR' | 'HVAC' | 'ROOFING',
    metro?: string
  ): Promise<ApifyBusinessListing[]> {
    // Get settings - will throw if not configured
    const scraperSettings = await settingsService.getApifySettings();
    
    // Validate industry is configured
    if (!scraperSettings.industries.includes(industry)) {
      throw new AppError(
        `Industry '${industry}' not configured. Configured industries: ${scraperSettings.industries.join(', ')}`,
        400,
        'INDUSTRY_NOT_CONFIGURED'
      );
    }

    // Use first search term and first location from settings
    const searchTerm = scraperSettings.searchTerms[0];
    const location = metro || scraperSettings.locations[0];

    logger.info({ industry, location, searchTerm }, 'Running quick test scrape');

    return this.apifyClient.quickScrape(searchTerm, location);
  }

  /**
   * Deduplicate contacts by email (primary) or phone (secondary)
   */
  private deduplicateContacts(contacts: any[]): any[] {
    const seen = new Set<string>();
    const unique: any[] = [];

    for (const contact of contacts) {
      // Create unique key from email or phone
      const key = contact.email || contact.phone || contact.businessName;
      
      if (!key) {
        // Skip contacts with no identifying info
        continue;
      }

      const normalizedKey = key.toLowerCase().trim();

      if (!seen.has(normalizedKey)) {
        seen.add(normalizedKey);
        unique.push(contact);
      }
    }

    return unique;
  }

  /**
   * Batch import for multiple industries
   */
  async batchImportAllIndustries(
    options?: Partial<GoogleMapsImportOptions>
  ): Promise<{
    solar: GoogleMapsImportResult;
    hvac: GoogleMapsImportResult;
    roofing: GoogleMapsImportResult;
  }> {
    logger.info('Starting batch import for all contractor industries');

    const [solar, hvac, roofing] = await Promise.all([
      this.importContractorLeads({ industry: 'SOLAR', ...options }),
      this.importContractorLeads({ industry: 'HVAC', ...options }),
      this.importContractorLeads({ industry: 'ROOFING', ...options }),
    ]);

    return { solar, hvac, roofing };
  }
}

// Singleton instance
export const googleMapsScraperService = new GoogleMapsScraperService();

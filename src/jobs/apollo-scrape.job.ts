/**
 * Apollo Scrape Job (Track B)
 * Automated Apollo.io searches with industry-specific filters
 * Runs weekly with 2,000 credit/month cap
 */

import { leadIngestionService } from '../services/lead/ingestion.service';
import { settingsService } from '../services/settings/settings.service';
import { apolloCreditService } from '../services/apollo/apollo-credit.service';
import { logger } from '../utils/logger';
import { ApolloSearchParams } from '../integrations/apollo/types';

export interface ApolloJobConfig {
  industry?: 'solar' | 'hvac' | 'roofing' | 'all';
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

// INDUSTRY_CONFIGS removed - now using settings from database

export class ApolloScrapeJob {
  /**
   * Run Apollo scrape using settings from database
   */
  async run(config: ApolloJobConfig = {}): Promise<ApolloJobResult> {
    const startTime = Date.now();

    try {
      // Check if configured
      const isConfigured = await settingsService.isApolloConfigured();
      if (!isConfigured) {
        logger.warn('Apollo scraper not configured. Skipping job.');
        return {
          success: false,
          industry: 'none',
          totalSearched: 0,
          totalEnriched: 0,
          creditsUsed: 0,
          creditsRemaining: 0,
          errors: ['Apollo scraper is not configured. Please configure industry, locations, person titles, and search keywords in Settings.'],
          duration: Date.now() - startTime,
          skippedDueToLimit: false,
        };
      }

      // Get Apollo settings from database
      const apolloSettings = await settingsService.getApolloSettings();
      const industry = apolloSettings.industry;

      logger.info({ industry, config }, 'Starting Apollo scrape job with settings from database');

      // Check credit limit (unless explicitly skipped)
      if (!config.skipCreditCheck) {
        const canRun = await apolloCreditService.canRunJob();
        if (!canRun) {
          const usage = await apolloCreditService.getCurrentUsage();
          logger.warn(
            { 
              creditsUsed: usage.creditsUsed, 
              creditsLimit: usage.creditsLimit 
            },
            'Apollo job skipped: monthly credit limit reached'
          );

          return {
            success: false,
            industry,
            totalSearched: 0,
            totalEnriched: 0,
            creditsUsed: 0,
            creditsRemaining: usage.creditsLimit - usage.creditsUsed,
            errors: [`Monthly credit limit reached: ${usage.creditsUsed}/${usage.creditsLimit}`],
            duration: Date.now() - startTime,
            skippedDueToLimit: true,
          };
        }
      }

      const enrichLimit = config.enrichLimit || apolloSettings.enrichLimit;

      let totalEnriched = 0;
      let totalSearched = 0;
      let totalCreditsUsed = 0;
      const errors: string[] = [];

      try {
        const result = await this.runWithSettings(apolloSettings, enrichLimit);
        totalEnriched += result.enriched;
        totalSearched += result.searched;
        totalCreditsUsed += result.creditsUsed;

        logger.info(
          { 
            industry, 
            enriched: result.enriched, 
            searched: result.searched,
            creditsUsed: result.creditsUsed,
          },
          'Apollo scrape completed'
        );
      } catch (error: any) {
        logger.error({ industry, error: error.message }, 'Apollo scrape failed');
        errors.push(`${industry}: ${error.message}`);
      }

      // Update credit usage
      await apolloCreditService.recordUsage(totalCreditsUsed);

      const usage = await apolloCreditService.getCurrentUsage();
      const duration = Date.now() - startTime;

      logger.info(
        {
          industry,
          totalEnriched,
          totalSearched,
          totalCreditsUsed,
          creditsRemaining: usage.creditsLimit - usage.creditsUsed,
          duration,
        },
        'Apollo scrape job completed'
      );

      return {
        success: errors.length === 0,
        industry,
        totalSearched,
        totalEnriched,
        creditsUsed: totalCreditsUsed,
        creditsRemaining: usage.creditsLimit - usage.creditsUsed,
        errors,
        duration,
        skippedDueToLimit: false,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error({ industry, error: error.message, duration }, 'Apollo scrape job failed');

      return {
        success: false,
        industry,
        totalSearched: 0,
        totalEnriched: 0,
        creditsUsed: 0,
        creditsRemaining: 0,
        errors: [error.message],
        duration,
        skippedDueToLimit: false,
      };
    }
  }

  /**
   * Run Apollo search using settings
   */
  private async runWithSettings(
    apolloSettings: any,
    enrichLimit: number
  ): Promise<{ searched: number; enriched: number; creditsUsed: number }> {
    logger.info(
      { 
        industry: apolloSettings.industry, 
        searchKeywords: apolloSettings.searchKeywords,
        organizationKeywordTags: apolloSettings.organizationKeywordTags,
        negativeKeywordTags: apolloSettings.negativeKeywordTags,
        locations: apolloSettings.locations,
        enrichLimit,
        enrichPhones: apolloSettings.enrichPhones,
      },
      'Running Apollo search with settings from database'
    );

    // Build Apollo search parameters from settings
    const searchParams: ApolloSearchParams = {
      // Use configured keywords from settings
      q_organization_keywords: apolloSettings.searchKeywords,
      q_organization_keyword_tags: apolloSettings.organizationKeywordTags,
      q_organization_not_keyword_tags: apolloSettings.negativeKeywordTags,
      
      // Geography from settings
      organization_locations: apolloSettings.locations,
      
      // Company size from settings
      organization_num_employees_ranges: apolloSettings.employeesMin && apolloSettings.employeesMax
        ? [`${apolloSettings.employeesMin},${apolloSettings.employeesMax}`]
        : undefined,
      
      // Revenue from settings
      revenue_range: apolloSettings.revenueMin && apolloSettings.revenueMax
        ? { min: apolloSettings.revenueMin, max: apolloSettings.revenueMax }
        : undefined,
      
      // Decision makers from settings
      person_titles: apolloSettings.personTitles,
      
      // Optional filters from settings
      person_locations: apolloSettings.personLocations,
      person_seniorities: apolloSettings.personSeniorities,
      organization_technologies: apolloSettings.technologies,
      organization_industry_tag_ids: apolloSettings.industryTagIds,
      organization_employee_growth_rate: apolloSettings.employeeGrowthRate,
      
      // Pagination from settings
      per_page: apolloSettings.perPage,
      page: apolloSettings.page,
      
      // Phone enrichment from settings
      reveal_phone_number: apolloSettings.enrichPhones,
    };

    // Import from Apollo (auto-enrichment workflow)
    const result = await leadIngestionService.importFromApollo(
      searchParams,
      enrichLimit
    );

    logger.info(
      {
        industry: apolloSettings.industry,
        jobId: result.jobId,
        total: result.total,
        imported: result.imported,
        duplicates: result.duplicates,
        invalid: result.invalid,
      },
      'Apollo import completed'
    );

    return {
      searched: result.total,
      enriched: result.imported,
      creditsUsed: result.imported, // 1 credit per enrichment
    };
  }
}

export const apolloScrapeJob = new ApolloScrapeJob();


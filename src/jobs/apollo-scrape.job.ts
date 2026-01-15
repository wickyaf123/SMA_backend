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

/**
 * Industry-specific Apollo search configurations
 * 
 * IMPORTANT: Apollo API uses q_organization_keyword_tags for industry-specific filtering
 * These are keyword tags that match company descriptions and industry classifications
 */
const INDUSTRY_CONFIGS = {
  solar: {
    name: 'Solar Contractors',
    // Keyword tags for industry filtering (Apollo's q_organization_keyword_tags)
    keywordTags: [
      'solar',
      'solar energy',
      'solar installation',
      'solar contractor',
      'photovoltaic',
      'renewable energy',
      'solar panel',
    ],
    // Negative keywords to exclude (wholesalers, manufacturers, etc.)
    excludeKeywordTags: [
      'wholesale',
      'distribution',
      'distributor', 
      'manufacturer',
      'manufacturing',
      'supply chain',
    ],
    locations: ['California, United States', 'Texas, United States', 'Florida, United States', 'Arizona, United States', 'North Carolina, United States'],
    employeesMin: 10,
    employeesMax: 100,
    revenueMin: 1000000, // $1M
    revenueMax: 10000000, // $10M
  },
  hvac: {
    name: 'HVAC Contractors',
    keywordTags: [
      'hvac',
      'heating and cooling',
      'air conditioning',
      'hvac contractor',
      'hvac services',
      'heating ventilation',
      'ac repair',
      'furnace',
    ],
    excludeKeywordTags: [
      'wholesale',
      'supply',
      'distributor',
      'manufacturer',
      'manufacturing',
    ],
    locations: ['Texas, United States', 'Arizona, United States', 'Florida, United States', 'California, United States', 'North Carolina, United States', 'Georgia, United States'],
    employeesMin: 10,
    employeesMax: 100,
    revenueMin: 1000000,
    revenueMax: 10000000,
  },
  roofing: {
    name: 'Roofing Contractors',
    keywordTags: [
      'roofing',
      'roofing contractor',
      'roof repair',
      'roof installation',
      'residential roofing',
      'commercial roofing',
      'roofer',
    ],
    excludeKeywordTags: [
      'supply',
      'wholesale', 
      'distributor',
      'manufacturer',
      'manufacturing',
    ],
    locations: ['Texas, United States', 'Florida, United States', 'California, United States', 'North Carolina, United States', 'Georgia, United States', 'Arizona, United States'],
    employeesMin: 10,
    employeesMax: 100,
    revenueMin: 1000000,
    revenueMax: 10000000,
  },
};

export class ApolloScrapeJob {
  /**
   * Run Apollo scrape for one or all industries
   */
  async run(config: ApolloJobConfig = {}): Promise<ApolloJobResult> {
    const startTime = Date.now();
    const industry = config.industry || 'all';

    logger.info({ industry, config }, 'Starting Apollo scrape job');

    try {
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

      // Get Apollo settings from database
      const settings = await settingsService.getSettings();
      const enrichLimit = config.enrichLimit || settings.apolloEnrichLimit || 100;

      // Run for specific industry or all industries
      const industriesToRun = industry === 'all' 
        ? ['solar', 'hvac', 'roofing'] as const
        : [industry] as const;

      let totalEnriched = 0;
      let totalSearched = 0;
      let totalCreditsUsed = 0;
      const errors: string[] = [];

      for (const ind of industriesToRun) {
        try {
          const result = await this.runIndustry(ind, enrichLimit);
          totalEnriched += result.enriched;
          totalSearched += result.searched;
          totalCreditsUsed += result.creditsUsed;

          logger.info(
            { 
              industry: ind, 
              enriched: result.enriched, 
              searched: result.searched,
              creditsUsed: result.creditsUsed,
            },
            'Industry scrape completed'
          );
        } catch (error: any) {
          logger.error({ industry: ind, error: error.message }, 'Industry scrape failed');
          errors.push(`${ind}: ${error.message}`);
        }

        // Small delay between industries to respect rate limits
        if (industriesToRun.length > 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
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
   * Run Apollo search for a specific industry
   */
  private async runIndustry(
    industry: 'solar' | 'hvac' | 'roofing',
    enrichLimit: number
  ): Promise<{ searched: number; enriched: number; creditsUsed: number }> {
    const config = INDUSTRY_CONFIGS[industry];

    logger.info(
      { 
        industry: config.name, 
        keywordTags: config.keywordTags,
        excludeKeywordTags: config.excludeKeywordTags,
        locations: config.locations,
        enrichLimit,
      },
      'Running Apollo search for industry'
    );

    // Build Apollo search parameters using CORRECT Apollo API fields
    const searchParams: ApolloSearchParams = {
      // INDUSTRY TARGETING: Use q_organization_keyword_tags for contractor-specific filtering
      // This searches company descriptions and industry classifications
      q_organization_keyword_tags: config.keywordTags,
      
      // NEGATIVE FILTERING: Exclude wholesalers, distributors, manufacturers
      q_organization_not_keyword_tags: config.excludeKeywordTags,
      
      // GEOGRAPHY: Filter by company/person location
      organization_locations: config.locations,
      
      // COMPANY SIZE: 10-100 employees (small to mid-size contractors)
      organization_num_employees_ranges: [`${config.employeesMin},${config.employeesMax}`],
      
      // REVENUE: $1M - $10M (established but not enterprise)
      revenue_range: {
        min: config.revenueMin,
        max: config.revenueMax,
      },
      
      // DECISION MAKERS: Owners, executives, and managers
      person_titles: [
        'Owner',
        'CEO',
        'President',
        'COO',
        'General Manager',
        'Vice President Operations',
        'VP Operations',
        'Operations Manager',
      ],
      
      // Pagination
      per_page: 100,
    };

    // Import from Apollo (auto-enrichment workflow)
    const result = await leadIngestionService.importFromApollo(
      searchParams,
      enrichLimit
    );

    logger.info(
      {
        industry: config.name,
        jobId: result.jobId,
        total: result.total,
        imported: result.imported,
        duplicates: result.duplicates,
        invalid: result.invalid,
      },
      'Apollo import completed for industry'
    );

    return {
      searched: result.total,
      enriched: result.imported,
      creditsUsed: result.imported, // 1 credit per enrichment
    };
  }
}

export const apolloScrapeJob = new ApolloScrapeJob();


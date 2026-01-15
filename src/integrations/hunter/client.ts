/**
 * Hunter.io Client
 * Phase 3.5 - Email Enrichment Service
 */

import axios, { AxiosInstance } from 'axios';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { retryWithBackoff } from '../../utils/retry';
import type {
  HunterDomainSearchRequest,
  HunterDomainSearchResponse,
  HunterEmailFinderRequest,
  HunterEmailFinderResponse,
  HunterEmailVerifierRequest,
  HunterEmailVerifierResponse,
  HunterAccountInfoResponse,
  HunterEmail,
} from './types';

export class HunterClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor() {
    if (!config.hunter.apiKey) {
      throw new Error('HUNTER_API_KEY is not configured');
    }

    this.apiKey = config.hunter.apiKey;
    this.client = axios.create({
      baseURL: config.hunter.baseUrl,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    logger.info('Hunter.io client initialized');
  }

  /**
   * Search for emails by domain
   */
  async domainSearch(
    request: HunterDomainSearchRequest
  ): Promise<HunterDomainSearchResponse> {
    try {
      logger.info({ domain: request.domain }, 'Searching domain for emails');

      const response = await retryWithBackoff(
        () =>
          this.client.get<HunterDomainSearchResponse>('/domain-search', {
            params: {
              domain: request.domain,
              api_key: this.apiKey,
              limit: request.limit || 10,
              offset: request.offset || 0,
              type: request.type,
              seniority: request.seniority?.join(','),
              department: request.department?.join(','),
            },
          })
      );

      logger.info(
        {
          domain: request.domain,
          emailsFound: response.data.data.emails.length,
        },
        'Domain search completed'
      );

      return response.data;
    } catch (error) {
      logger.error({ error, domain: request.domain }, 'Domain search failed');
      throw error;
    }
  }

  /**
   * Find email for a specific person
   */
  async findEmail(
    request: HunterEmailFinderRequest
  ): Promise<HunterEmailFinderResponse> {
    try {
      logger.info(
        {
          domain: request.domain,
          firstName: request.first_name,
          lastName: request.last_name,
        },
        'Finding email for person'
      );

      const response = await retryWithBackoff(
        () =>
          this.client.get<HunterEmailFinderResponse>('/email-finder', {
            params: {
              domain: request.domain,
              first_name: request.first_name,
              last_name: request.last_name,
              full_name: request.full_name,
              api_key: this.apiKey,
              max_duration: request.max_duration || 10,
            },
          })
      );

      logger.info(
        {
          domain: request.domain,
          email: response.data.data.email,
          score: response.data.data.score,
        },
        'Email found successfully'
      );

      return response.data;
    } catch (error) {
      logger.error(
        {
          error,
          domain: request.domain,
          firstName: request.first_name,
        },
        'Email finder failed'
      );
      throw error;
    }
  }

  /**
   * Verify email address
   */
  async verifyEmail(
    request: HunterEmailVerifierRequest
  ): Promise<HunterEmailVerifierResponse> {
    try {
      logger.info({ email: request.email }, 'Verifying email');

      const response = await retryWithBackoff(
        () =>
          this.client.get<HunterEmailVerifierResponse>('/email-verifier', {
            params: {
              email: request.email,
              api_key: this.apiKey,
            },
          })
      );

      logger.info(
        {
          email: request.email,
          status: response.data.data.status,
          score: response.data.data.score,
        },
        'Email verified'
      );

      return response.data;
    } catch (error) {
      logger.error({ error, email: request.email }, 'Email verification failed');
      throw error;
    }
  }

  /**
   * Get account information and usage
   */
  async getAccountInfo(): Promise<HunterAccountInfoResponse> {
    try {
      const response = await this.client.get<HunterAccountInfoResponse>(
        '/account',
        {
          params: {
            api_key: this.apiKey,
          },
        }
      );

      logger.info(
        {
          plan: response.data.data.plan_name,
          callsUsed: response.data.data.calls.used,
          callsAvailable: response.data.data.calls.available,
        },
        'Account info retrieved'
      );

      return response.data;
    } catch (error) {
      logger.error({ error }, 'Failed to get account info');
      throw error;
    }
  }

  /**
   * Get best emails from domain search
   */
  async getBestEmails(
    domain: string,
    options?: {
      limit?: number;
      minConfidence?: number;
      preferPersonal?: boolean;
    }
  ): Promise<HunterEmail[]> {
    try {
      const searchResult = await this.domainSearch({
        domain,
        limit: options?.limit || 10,
        type: options?.preferPersonal ? 'personal' : undefined,
      });

      let emails = searchResult.data.emails;

      // Filter by confidence
      if (options?.minConfidence) {
        emails = emails.filter((e) => e.confidence >= options.minConfidence!);
      }

      // Sort by confidence (highest first)
      emails.sort((a, b) => b.confidence - a.confidence);

      logger.info(
        {
          domain,
          totalFound: searchResult.data.emails.length,
          filtered: emails.length,
        },
        'Best emails retrieved'
      );

      return emails;
    } catch (error) {
      logger.error({ error, domain }, 'Failed to get best emails');
      throw error;
    }
  }

  /**
   * Quick search - get just the top email
   */
  async getTopEmail(
    domain: string,
    options?: {
      minConfidence?: number;
    }
  ): Promise<HunterEmail | null> {
    try {
      const emails = await this.getBestEmails(domain, {
        limit: 5,
        minConfidence: options?.minConfidence || 70,
        preferPersonal: true,
      });

      if (emails.length === 0) {
        logger.info({ domain }, 'No emails found');
        return null;
      }

      return emails[0];
    } catch (error) {
      logger.error({ error, domain }, 'Failed to get top email');
      throw error;
    }
  }

  /**
   * Batch domain search with rate limiting
   */
  async batchDomainSearch(
    domains: string[],
    delayMs: number = 1000
  ): Promise<Map<string, HunterEmail[]>> {
    logger.info({ count: domains.length }, 'Starting batch domain search');

    const results = new Map<string, HunterEmail[]>();

    for (const domain of domains) {
      try {
        const emails = await this.getBestEmails(domain, { limit: 5 });
        results.set(domain, emails);

        logger.info(
          {
            domain,
            emailsFound: emails.length,
            progress: `${results.size}/${domains.length}`,
          },
          'Domain processed'
        );

        // Add delay between requests
        if (domains.indexOf(domain) < domains.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      } catch (error) {
        logger.error({ error, domain }, 'Failed to search domain');
        results.set(domain, []);
      }
    }

    logger.info(
      {
        total: domains.length,
        successful: Array.from(results.values()).filter((e) => e.length > 0).length,
      },
      'Batch domain search completed'
    );

    return results;
  }
}

// Singleton instance
let hunterClientInstance: HunterClient | null = null;

export function getHunterClient(): HunterClient {
  if (!hunterClientInstance) {
    hunterClientInstance = new HunterClient();
  }
  return hunterClientInstance;
}


import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { retryWithBackoff } from '../../utils/retry';
import {
  ApolloSearchParams,
  ApolloSearchResponse,
  ApolloSearchPreviewResponse,
  ApolloEnrichPersonRequest,
  ApolloEnrichPersonResponse,
  ApolloBulkMatchRequest,
  ApolloBulkMatchResponse,
  ApolloMobilePhoneRequest,
  ApolloError,
  ApolloRateLimitInfo,
} from './types';

/**
 * Apollo.io API Client
 * Documentation: https://apolloio.github.io/apollo-api-docs/
 */
export class ApolloClient {
  private client: AxiosInstance;
  private rateLimitInfo: ApolloRateLimitInfo | null = null;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.apollo.io/api/v1',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
      },
      timeout: 30000, // 30 seconds
    });

    // Request interceptor to add API key
    this.client.interceptors.request.use((config) => {
      config.headers['X-Api-Key'] = this.getApiKey();
      return config;
    });

    // Response interceptor to track rate limits
    this.client.interceptors.response.use(
      (response) => {
        this.updateRateLimitInfo(response.headers);
        return response;
      },
      (error: AxiosError) => {
        if (error.response) {
          this.updateRateLimitInfo(error.response.headers);
        }
        throw error;
      }
    );
  }

  private getApiKey(): string {
    if (!config.apollo.apiKey) {
      throw new Error('Apollo API key is not configured');
    }
    return config.apollo.apiKey;
  }

  private updateRateLimitInfo(headers: any): void {
    if (headers['x-rate-limit-limit']) {
      this.rateLimitInfo = {
        limit: parseInt(headers['x-rate-limit-limit'], 10),
        remaining: parseInt(headers['x-rate-limit-remaining'] || '0', 10),
        reset: parseInt(headers['x-rate-limit-reset'] || '0', 10),
      };
      
      logger.debug({
        rateLimit: this.rateLimitInfo,
      }, 'Apollo API rate limit info');
    }
  }

  /**
   * Get current rate limit info
   */
  public getRateLimitInfo(): ApolloRateLimitInfo | null {
    return this.rateLimitInfo;
  }

  /**
   * Search for people with filters (returns obfuscated preview - FREE, no credits)
   * This is the recommended endpoint for searching. Use enrichPeopleBulk() to get full data.
   * Documentation: https://docs.apollo.io/reference/people-api-search
   */
  public async searchPeoplePreview(
    params: ApolloSearchParams
  ): Promise<ApolloSearchPreviewResponse> {
    return retryWithBackoff(
      async () => {
        try {
          logger.info({ params }, 'Searching Apollo for people (preview)');

          const response = await this.client.post<ApolloSearchPreviewResponse>(
            '/mixed_people/api_search',
            params
          );

          logger.info({
            totalResults: response.data.total_entries,
            resultsInPage: response.data.people.length,
          }, 'Apollo search preview successful (no credits consumed)');

          return response.data;
        } catch (error) {
          this.handleError(error, 'searchPeoplePreview');
          throw error;
        }
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        shouldRetry: (error) => this.shouldRetry(error),
      }
    );
  }

  /**
   * Search for people with filters (DEPRECATED - use searchPeoplePreview + enrichPeopleBulk)
   * This endpoint may return obfuscated data.
   */
  public async searchPeople(
    params: ApolloSearchParams
  ): Promise<ApolloSearchResponse> {
    return retryWithBackoff(
      async () => {
        try {
          logger.info({ params }, 'Searching Apollo for people');

          const response = await this.client.post<ApolloSearchResponse>(
            '/mixed_people/api_search',
            params
          );

          logger.info({
            totalResults: response.data.pagination?.total_entries || response.data.people?.length || 0,
            resultsInPage: response.data.people?.length || 0,
          }, 'Apollo search successful');

          return response.data;
        } catch (error) {
          this.handleError(error, 'searchPeople');
          throw error;
        }
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        shouldRetry: (error) => this.shouldRetry(error),
      }
    );
  }

  /**
   * Enrich people in bulk by ID (COSTS CREDITS - max 10 per request)
   * Use this after searchPeoplePreview() to get full contact details.
   * Documentation: https://docs.apollo.io/reference/people-bulk_match
   * 
   * @param personIds - Array of Apollo person IDs (max 10)
   * @param revealEmails - Whether to reveal personal emails (default: true)
   * @returns Full person details with emails, phones, etc.
   */
  public async enrichPeopleBulk(
    personIds: string[],
    revealEmails: boolean = true
  ): Promise<ApolloBulkMatchResponse> {
    return retryWithBackoff(
      async () => {
        try {
          if (personIds.length > 10) {
            logger.warn({
              requestedCount: personIds.length,
              maxAllowed: 10,
            }, 'Bulk enrich request exceeds max of 10 - truncating');
            personIds = personIds.slice(0, 10);
          }

          logger.info({ 
            count: personIds.length,
            personIds: personIds,
          }, 'Bulk enriching people via Apollo');

          const response = await this.client.post<any>(
            '/people/bulk_match',
            {
              details: personIds.map(id => ({ id })),
              reveal_personal_emails: revealEmails,
            }
          );

          // Log raw response for debugging
          logger.debug({
            responseType: Array.isArray(response.data) ? 'array' : 'object',
            responseKeys: Object.keys(response.data || {}),
            dataLength: Array.isArray(response.data) ? response.data.length : 'N/A',
            hasMatches: !!response.data.matches,
            matchesLength: response.data.matches?.length || 0,
          }, 'Apollo bulk_match raw response');

          // Apollo bulk_match returns contacts in the "matches" field
          // It may also return an array directly in some cases
          const people = Array.isArray(response.data) 
            ? response.data 
            : (response.data.matches || response.data.people || []);

          const creditsConsumed = response.data.credits_consumed 
            || response.data.num_requests_made 
            || people.length;

          logger.info({
            matchedCount: people.length,
            creditsConsumed: creditsConsumed,
            samplePerson: people[0] ? { 
              id: people[0].id, 
              email: people[0].email,
              hasPhoneNumbers: !!people[0].phone_numbers,
              phoneNumbersCount: people[0].phone_numbers?.length || 0,
              firstPhone: people[0].phone_numbers?.[0] || null,
            } : null,
          }, 'Apollo bulk enrichment successful');

          // Return normalized format
          return {
            people: people,
            matches: people.length,
            credits_consumed: creditsConsumed,
          };
        } catch (error) {
          this.handleError(error, 'enrichPeopleBulk');
          throw error;
        }
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        shouldRetry: (error) => this.shouldRetry(error),
      }
    );
  }

  /**
   * Enrich a single person by email or name (COSTS CREDITS)
   * For bulk operations, use enrichPeopleBulk() instead.
   */
  public async enrichPerson(
    request: ApolloEnrichPersonRequest
  ): Promise<ApolloEnrichPersonResponse> {
    return retryWithBackoff(
      async () => {
        try {
          logger.info({ request }, 'Enriching person via Apollo');

          const response = await this.client.post<ApolloEnrichPersonResponse>(
            '/people/match',
            request
          );

          logger.info({
            personId: response.data.person.id,
            email: response.data.person.email,
          }, 'Apollo enrichment successful');

          return response.data;
        } catch (error) {
          this.handleError(error, 'enrichPerson');
          throw error;
        }
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        shouldRetry: (error) => this.shouldRetry(error),
      }
    );
  }

  /**
   * Request mobile phone numbers for contacts (ASYNC via webhook)
   * Mobile phone numbers are delivered asynchronously via webhook callback.
   * 
   * @param contacts - Array of contacts with Apollo ID or email
   * @param webhookUrl - Your public webhook URL to receive the phone numbers
   */
  public async requestMobilePhones(
    contacts: Array<{ id?: string; email?: string; first_name?: string; last_name?: string }>,
    webhookUrl: string
  ): Promise<void> {
    logger.info({
      count: contacts.length,
      webhookUrl,
    }, 'Requesting mobile phones from Apollo (async via webhook)');

    for (const contact of contacts) {
      try {
        await retryWithBackoff(
          async () => {
            await this.client.post('/people/match', {
              ...contact,
              reveal_phone_number: true,
              webhook_url: webhookUrl,
            } as ApolloMobilePhoneRequest);

            logger.debug({
              contactId: contact.id,
              email: contact.email,
            }, 'Mobile phone request sent to Apollo');
          },
          {
            maxRetries: 3,
            baseDelay: 1000,
            maxDelay: 10000,
            shouldRetry: (error) => this.shouldRetry(error),
          }
        );

        // Add delay between requests to avoid rate limits (500ms between each request)
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        logger.error({
          contact,
          error,
        }, 'Failed to request mobile phone for contact');
        // Continue with next contact even if one fails
      }
    }

    logger.info({
      count: contacts.length,
    }, 'All mobile phone requests sent to Apollo');
  }

  /**
   * Get organization by ID
   */
  public async getOrganization(organizationId: string): Promise<any> {
    return retryWithBackoff(
      async () => {
        try {
          logger.info({ organizationId }, 'Fetching organization from Apollo');

          const response = await this.client.get(
            `/organizations/${organizationId}`
          );

          return response.data;
        } catch (error) {
          this.handleError(error, 'getOrganization');
          throw error;
        }
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        shouldRetry: (error) => this.shouldRetry(error),
      }
    );
  }

  /**
   * Determine if error should trigger a retry
   */
  private shouldRetry(error: any): boolean {
    if (!error.response) {
      // Network errors should retry
      return true;
    }

    const status = error.response.status;

    // Retry on rate limit (429) and server errors (5xx)
    if (status === 429 || status >= 500) {
      return true;
    }

    // Don't retry on client errors (4xx except 429)
    return false;
  }

  /**
   * Handle and log API errors
   */
  private handleError(error: any, operation: string): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<ApolloError>;
      
      if (axiosError.response) {
        const status = axiosError.response.status;
        const data = axiosError.response.data;

        logger.error({
          operation,
          status,
          error: data,
          rateLimitInfo: this.rateLimitInfo,
        }, `Apollo API error: ${operation}`);

        // Special handling for rate limits
        if (status === 429) {
          logger.warn({
            rateLimitInfo: this.rateLimitInfo,
            resetTime: this.rateLimitInfo?.reset
              ? new Date(this.rateLimitInfo.reset * 1000).toISOString()
              : 'unknown',
          }, 'Apollo API rate limit exceeded');
        }
      } else if (axiosError.request) {
        logger.error({
          operation,
          error: 'No response received from Apollo API',
        }, `Apollo API network error: ${operation}`);
      } else {
        logger.error({
          operation,
          error: axiosError.message,
        }, `Apollo API request error: ${operation}`);
      }
    } else {
      logger.error({
        operation,
        error,
      }, `Unexpected error in Apollo client: ${operation}`);
    }
  }
}

// Export singleton instance
export const apolloClient = new ApolloClient();


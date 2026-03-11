import axios, { AxiosInstance, AxiosError } from 'axios';
import { logger } from '../../utils/logger';
import { retryWithBackoff } from '../../utils/retry';
import type {
  InstantlyAddLeadRequest,
  InstantlyAddLeadResponse,
  InstantlyGetCampaignEmailsRequest,
  InstantlyGetCampaignEmailsResponse,
  InstantlyConfig,
  InstantlyCampaign,
  InstantlyListCampaignsResponse,
} from './types';

export class InstantlyClient {
  private client: AxiosInstance;
  private apiKey: string;

  constructor(config: InstantlyConfig) {
    this.apiKey = config.apiKey;
    this.client = axios.create({
      baseURL: config.baseUrl || 'https://api.instantly.ai/api/v1',
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(
          {
            method: config.method,
            url: config.url,
            // Don't log full request body to avoid logging API keys
          },
          'Instantly API request'
        );
        return config;
      },
      (error) => {
        logger.error({ error }, 'Instantly API request error');
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(
          {
            status: response.status,
            url: response.config.url,
          },
          'Instantly API response'
        );
        return response;
      },
      (error) => {
        this.handleError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Add a lead to an Instantly campaign (v2 API)
   */
  async addLead(data: Omit<InstantlyAddLeadRequest, 'api_key'>): Promise<InstantlyAddLeadResponse> {
    return retryWithBackoff(
      async () => {
        try {
          logger.info(
            {
              campaignId: data.campaign_id,
              email: data.email,
            },
            'Adding lead to Instantly campaign (v2 API)'
          );

          // Use v2 API with Bearer token
          // NOTE: The field is "campaign" NOT "campaign_id" for v2 API!
          const response = await axios.post<InstantlyAddLeadResponse>(
            'https://api.instantly.ai/api/v2/leads',
            {
              campaign: data.campaign_id,  // v2 uses "campaign" not "campaign_id"
              email: data.email,
              first_name: data.first_name,
              last_name: data.last_name,
              company_name: data.company_name,
              phone: data.phone_number,
              website: data.website,
              custom_variables: data.custom_variables,
              skip_if_in_workspace: data.skip_if_in_workspace ?? true,
              skip_if_in_campaign: data.skip_if_in_campaign ?? true,
            },
            {
              headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
              },
              timeout: 30000,
            }
          );

          // v2 API returns different response format
          const result: InstantlyAddLeadResponse = {
            status: 'success',
            id: (response.data as any).id || (response.data as any).lead_id,
            email: data.email,
          };

          logger.info(
            {
              campaignId: data.campaign_id,
              email: data.email,
              leadId: result.id,
            },
            'Lead added to Instantly successfully'
          );

          return result;
        } catch (error) {
          this.handleError(error, 'addLead');
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
   * Get emails from a campaign
   */
  async getCampaignEmails(
    data: Omit<InstantlyGetCampaignEmailsRequest, 'api_key'>
  ): Promise<InstantlyGetCampaignEmailsResponse> {
    return retryWithBackoff(
      async () => {
        try {
          logger.info(
            {
              campaignId: data.campaign_id,
              limit: data.limit,
            },
            'Getting campaign emails from Instantly'
          );

          const response = await this.client.post<InstantlyGetCampaignEmailsResponse>(
            '/campaign/get/emails',
            {
              ...data,
              api_key: this.apiKey,
            }
          );

          logger.info(
            {
              campaignId: data.campaign_id,
              count: response.data.emails?.length || 0,
            },
            'Campaign emails retrieved successfully'
          );

          return response.data;
        } catch (error) {
          this.handleError(error, 'getCampaignEmails');
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
   * List all campaigns from Instantly (v2 API)
   */
  async listCampaigns(): Promise<InstantlyCampaign[]> {
    return retryWithBackoff(
      async () => {
        try {
          logger.info('Listing campaigns from Instantly (v2 API)');

          // Try v2 API with Bearer token
          const response = await axios.get<InstantlyListCampaignsResponse>(
            'https://api.instantly.ai/api/v2/campaigns',
            {
              headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
              },
              params: {
                limit: 100,
              },
              timeout: 30000,
            }
          );

          // v2 response might be in different format
          const campaigns = response.data.items || (response.data as any) || [];
          
          logger.info(
            { count: Array.isArray(campaigns) ? campaigns.length : 0 },
            'Campaigns retrieved from Instantly'
          );

          return Array.isArray(campaigns) ? campaigns : [];
        } catch (error) {
          this.handleError(error, 'listCampaigns');
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
   * Handle API errors
   */
  private handleError(error: unknown, context?: string): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      logger.error(
        {
          context,
          status: axiosError.response?.status,
          statusText: axiosError.response?.statusText,
          data: axiosError.response?.data,
          message: axiosError.message,
        },
        'Instantly API error'
      );

      // Enhance error message based on status code
      if (axiosError.response?.status === 401) {
        throw new Error('Instantly API authentication failed - check API key');
      } else if (axiosError.response?.status === 429) {
        throw new Error('Instantly API rate limit exceeded');
      } else if (axiosError.response?.status === 402) {
        throw new Error('Instantly API insufficient credits');
      }
    } else {
      logger.error({ error, context }, 'Instantly API unexpected error');
    }
  }

  /**
   * Determine if request should be retried
   */
  private shouldRetry(error: any): boolean {
    // Retry on network errors
    if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT') {
      return true;
    }

    // Retry on 5xx errors
    if (error.response?.status >= 500) {
      return true;
    }

    // Retry on rate limit (429)
    if (error.response?.status === 429) {
      return true;
    }

    // Don't retry on 4xx errors (except 429)
    if (error.response?.status >= 400 && error.response?.status < 500) {
      return false;
    }

    return false;
  }

  // ==================== PERMIT INTELLIGENCE EXTENSIONS ====================

  async addLeadWithPersonalization(
    email: string,
    campaignId: string,
    variables: Record<string, any>
  ): Promise<void> {
    await retryWithBackoff(async () => {
      await this.client.post('/lead/add', {
        api_key: this.apiKey,
        campaign_id: campaignId,
        email,
        ...Object.fromEntries(
          Object.entries(variables).map(([k, v]) => [`custom_${k}`, String(v)])
        ),
      });
    }, { maxRetries: 2, baseDelay: 1000 });
  }

  async pauseCampaign(campaignId: string): Promise<void> {
    await this.client.post('/campaign/update/status', {
      api_key: this.apiKey,
      campaign_id: campaignId,
      status: false,
    });
  }

  async resumeCampaign(campaignId: string): Promise<void> {
    await this.client.post('/campaign/update/status', {
      api_key: this.apiKey,
      campaign_id: campaignId,
      status: true,
    });
  }

  async getReplyCount(campaignId: string): Promise<number> {
    const response = await this.client.get('/analytics/campaign/summary', {
      params: { api_key: this.apiKey, campaign_id: campaignId },
    });
    return response.data?.total_replies || 0;
  }
}

// Export singleton instance (will be initialized with config at runtime)
let instantlyClient: InstantlyClient | null = null;

export function getInstantlyClient(config: InstantlyConfig): InstantlyClient {
  if (!instantlyClient) {
    instantlyClient = new InstantlyClient(config);
  }
  return instantlyClient;
}


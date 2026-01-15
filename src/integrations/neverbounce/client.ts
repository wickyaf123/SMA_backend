import axios, { AxiosInstance, AxiosError } from 'axios';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { retryWithBackoff, isRetryableHttpError } from '../../utils/retry';
import {
  NeverBounceVerifyRequest,
  NeverBounceVerifyResponse,
  NeverBounceBulkRequest,
  NeverBounceBulkResponse,
  NeverBounceJobStatus,
  NeverBounceError,
  EmailValidationResult,
  NEVERBOUNCE_TO_DB_STATUS,
} from './types';

/**
 * NeverBounce API Client
 * Documentation: https://developers.neverbounce.com/docs
 */
export class NeverBounceClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.neverbounce.com/v4',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'OutboundAutomation/1.0',
      },
      timeout: 30000, // 30 seconds
    });
  }

  private getApiKey(): string {
    if (!config.neverBounce.apiKey) {
      throw new Error('NeverBounce API key is not configured');
    }
    return config.neverBounce.apiKey;
  }

  /**
   * Verify a single email address
   */
  public async verifyEmail(
    email: string,
    options: Partial<NeverBounceVerifyRequest> = {}
  ): Promise<EmailValidationResult> {
    return retryWithBackoff(
      async () => {
        try {
          logger.debug({ email }, 'Verifying email with NeverBounce');

          const response = await this.client.get<NeverBounceVerifyResponse>(
            '/single/check',
            {
              params: {
                key: this.getApiKey(),
                email,
                address_info: options.address_info !== false ? 1 : 0,
                credits_info: options.credits_info ? 1 : 0,
                timeout: options.timeout || 10,
              },
            }
          );

          const data = response.data;

          if (data.status !== 'success') {
            throw new Error(`NeverBounce verification failed: ${data.status}`);
          }

          const result: EmailValidationResult = {
            email,
            isValid: data.result === 'valid',
            result: data.result,
            flags: data.flags,
            suggestedCorrection: data.suggested_correction,
            normalizedEmail: data.addr_info?.normalized_email,
            executionTime: data.execution_time,
            validatedAt: new Date(),
          };

          logger.info({
            email,
            result: data.result,
            isValid: result.isValid,
            executionTime: data.execution_time,
          }, 'Email validation complete');

          // Log credits if available
          if (data.credits_info) {
            logger.debug({
              creditsUsed: data.credits_info.paid_credits_used + data.credits_info.free_credits_used,
              creditsRemaining: data.credits_info.paid_credits_remaining + data.credits_info.free_credits_remaining,
            }, 'NeverBounce credits info');
          }

          return result;
        } catch (error) {
          this.handleError(error, 'verifyEmail');
          throw error;
        }
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        shouldRetry: (error) => isRetryableHttpError(error),
      }
    );
  }

  /**
   * Verify multiple emails in bulk
   */
  public async verifyBulk(
    emails: Array<{ id: string; email: string }>
  ): Promise<NeverBounceBulkResponse> {
    return retryWithBackoff(
      async () => {
        try {
          logger.info({ count: emails.length }, 'Starting bulk email validation');

          const response = await this.client.post<NeverBounceBulkResponse>(
            '/jobs/create',
            {
              key: this.getApiKey(),
              input: emails,
              auto_parse: 1,
              auto_start: 1,
            }
          );

          const data = response.data;

          if (data.status !== 'success') {
            throw new Error(`NeverBounce bulk job creation failed: ${data.message || data.status}`);
          }

          logger.info({
            jobId: data.job_id,
            emailCount: emails.length,
          }, 'Bulk validation job created');

          return data;
        } catch (error) {
          this.handleError(error, 'verifyBulk');
          throw error;
        }
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        shouldRetry: (error) => isRetryableHttpError(error),
      }
    );
  }

  /**
   * Check status of a bulk validation job
   */
  public async checkJobStatus(jobId: string): Promise<NeverBounceJobStatus> {
    return retryWithBackoff(
      async () => {
        try {
          const response = await this.client.get<NeverBounceJobStatus>(
            '/jobs/status',
            {
              params: {
                key: this.getApiKey(),
                job_id: jobId,
              },
            }
          );

          const data = response.data;

          if (data.status !== 'success') {
            throw new Error(`Failed to get job status for ${jobId}`);
          }

          logger.debug({
            jobId,
            jobStatus: data.job_status,
            percentComplete: data.percent_complete,
          }, 'Bulk job status checked');

          return data;
        } catch (error) {
          this.handleError(error, 'checkJobStatus');
          throw error;
        }
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        shouldRetry: (error) => isRetryableHttpError(error),
      }
    );
  }

  /**
   * Download results from a completed bulk job
   */
  public async downloadJobResults(jobId: string): Promise<any> {
    return retryWithBackoff(
      async () => {
        try {
          const response = await this.client.get(
            '/jobs/download',
            {
              params: {
                key: this.getApiKey(),
                job_id: jobId,
              },
            }
          );

          return response.data;
        } catch (error) {
          this.handleError(error, 'downloadJobResults');
          throw error;
        }
      },
      {
        maxRetries: 3,
        baseDelay: 1000,
        maxDelay: 10000,
        shouldRetry: (error) => isRetryableHttpError(error),
      }
    );
  }

  /**
   * Map NeverBounce result to database validation status
   */
  public static mapToDbStatus(result: string): string {
    return NEVERBOUNCE_TO_DB_STATUS[result as keyof typeof NEVERBOUNCE_TO_DB_STATUS] || 'UNKNOWN';
  }

  /**
   * Handle and log API errors
   */
  private handleError(error: any, operation: string): void {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<NeverBounceError>;
      
      if (axiosError.response) {
        const status = axiosError.response.status;
        const data = axiosError.response.data;

        logger.error({
          operation,
          status,
          error: data,
        }, `NeverBounce API error: ${operation}`);

        // Special handling for authentication errors
        if (status === 401 || status === 403) {
          logger.error('NeverBounce API authentication failed - check API key');
        }

        // Special handling for rate limits
        if (status === 429) {
          logger.warn('NeverBounce API rate limit exceeded');
        }
      } else if (axiosError.request) {
        logger.error({
          operation,
          error: 'No response received from NeverBounce API',
        }, `NeverBounce API network error: ${operation}`);
      } else {
        logger.error({
          operation,
          error: axiosError.message,
        }, `NeverBounce API request error: ${operation}`);
      }
    } else {
      logger.error({
        operation,
        error,
      }, `Unexpected error in NeverBounce client: ${operation}`);
    }
  }
}

// Export singleton instance
export const neverBounceClient = new NeverBounceClient();


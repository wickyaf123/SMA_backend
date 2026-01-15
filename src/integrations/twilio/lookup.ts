import twilio from 'twilio';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { retryWithBackoff, isRetryableHttpError } from '../../utils/retry';
import {
  TwilioLookupResponse,
  PhoneValidationResult,
  CarrierType,
} from './types';

/**
 * Twilio Lookup API Client
 * Documentation: https://www.twilio.com/docs/lookup/api
 */
export class TwilioLookupClient {
  private client: ReturnType<typeof twilio>;

  constructor() {
    this.client = twilio(
      config.twilio.accountSid,
      config.twilio.authToken
    );
  }

  /**
   * Lookup and validate a phone number
   */
  public async lookupPhone(phoneNumber: string): Promise<PhoneValidationResult> {
    return retryWithBackoff(
      async () => {
        try {
          logger.debug({ phoneNumber }, 'Looking up phone number with Twilio');

          // Use Twilio Lookup V2 API with carrier data
          const response = await this.client.lookups.v2
            .phoneNumbers(phoneNumber)
            .fetch({
              fields: 'line_type_intelligence',
            });

          const lineType = (response as any).lineTypeIntelligence;
          
          // Determine carrier type and validation
          const carrierType: CarrierType | null = this.parseCarrierType(lineType?.type);
          const isValid = !!carrierType;
          const isMobile = carrierType === 'mobile';
          const isLandline = carrierType === 'landline' || carrierType === 'voip';

          const result: PhoneValidationResult = {
            phoneNumber: response.phoneNumber,
            isValid,
            isMobile,
            isLandline,
            carrierType,
            carrierName: lineType?.carrierName || null,
            countryCode: response.countryCode || '',
            nationalFormat: response.nationalFormat || phoneNumber,
            e164Format: response.phoneNumber,
            validatedAt: new Date(),
          };

          logger.info({
            phoneNumber,
            e164Format: result.e164Format,
            carrierType: result.carrierType,
            isMobile: result.isMobile,
            isValid: result.isValid,
          }, 'Phone lookup complete');

          return result;
        } catch (error: any) {
          // Handle Twilio-specific errors
          if (error.code === 20404) {
            // Phone number not found - treat as invalid
            logger.warn({ phoneNumber }, 'Phone number not found');
            
            return {
              phoneNumber,
              isValid: false,
              isMobile: false,
              isLandline: false,
              carrierType: null,
              carrierName: null,
              countryCode: '',
              nationalFormat: phoneNumber,
              e164Format: phoneNumber,
              validatedAt: new Date(),
            };
          }

          this.handleError(error, 'lookupPhone');
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
   * Format phone number to E.164 format without validation
   */
  public formatPhoneNumber(phoneNumber: string, countryCode: string = 'US'): string {
    try {
      // Remove all non-digit characters
      const digits = phoneNumber.replace(/\D/g, '');

      // If already has country code (starts with 1 for US), return with +
      if (digits.startsWith('1') && digits.length === 11) {
        return `+${digits}`;
      }

      // Add country code
      if (countryCode === 'US' || countryCode === 'CA') {
        return `+1${digits}`;
      }

      // For other countries, assume digits already include country code
      return `+${digits}`;
    } catch (error) {
      logger.warn({ phoneNumber, error }, 'Failed to format phone number');
      return phoneNumber;
    }
  }

  /**
   * Parse carrier type from Twilio response
   */
  private parseCarrierType(type: string | undefined | null): CarrierType | null {
    if (!type) return null;

    const normalized = type.toLowerCase();
    
    if (normalized.includes('mobile') || normalized.includes('wireless')) {
      return 'mobile';
    }
    
    if (normalized.includes('landline') || normalized.includes('fixedline')) {
      return 'landline';
    }
    
    if (normalized.includes('voip')) {
      return 'voip';
    }

    return null;
  }

  /**
   * Determine if error should trigger a retry
   */
  private shouldRetry(error: any): boolean {
    // Don't retry on invalid phone number (20404)
    if (error.code === 20404) {
      return false;
    }

    // Retry on rate limit (20429) and server errors (20500+)
    if (error.code === 20429 || error.status >= 500) {
      return true;
    }

    // Default retry logic for network errors
    return isRetryableHttpError(error);
  }

  /**
   * Handle and log API errors
   */
  private handleError(error: any, operation: string): void {
    if (error.code && error.message) {
      // Twilio error
      logger.error({
        operation,
        code: error.code,
        message: error.message,
        status: error.status,
      }, `Twilio Lookup error: ${operation}`);

      // Special handling for rate limits
      if (error.code === 20429) {
        logger.warn('Twilio Lookup API rate limit exceeded');
      }

      // Special handling for authentication
      if (error.code === 20003) {
        logger.error('Twilio authentication failed - check credentials');
      }
    } else {
      logger.error({
        operation,
        error,
      }, `Unexpected error in Twilio Lookup client: ${operation}`);
    }
  }
}

// Export singleton instance
export const twilioLookupClient = new TwilioLookupClient();


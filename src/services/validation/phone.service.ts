import { prisma } from '../../config/database';
import { twilioLookupClient } from '../../integrations/twilio/lookup';
import { PhoneValidationResult } from '../../integrations/twilio/types';
import { logger } from '../../utils/logger';
import { PhoneValidationStatus } from '@prisma/client';

/**
 * Phone Validation Service
 * Validates phone numbers using Twilio Lookup and updates contact records
 */
export class PhoneValidationService {
  /**
   * Validate a single phone number and update contact
   */
  public async validateContactPhone(contactId: string): Promise<PhoneValidationStatus> {
    try {
      // Get contact
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { id: true, phone: true },
      });

      if (!contact) {
        throw new Error(`Contact ${contactId} not found`);
      }

      if (!contact.phone) {
        logger.warn({ contactId }, 'Contact has no phone number to validate');
        return PhoneValidationStatus.UNKNOWN;
      }

      logger.info({ contactId, phone: contact.phone }, 'Validating contact phone');

      // Validate phone
      const result = await twilioLookupClient.lookupPhone(contact.phone);

      // Map result to database status
      const status = this.mapResultToStatus(result);

      // Update contact
      await prisma.contact.update({
        where: { id: contactId },
        data: {
          phoneValidationStatus: status,
          phoneValidatedAt: new Date(),
          phoneFormatted: result.e164Format,
          // Flag if landline (keep but mark for review)
          ...(result.isLandline && {
            tags: {
              push: 'landline',
            },
          }),
          // Update status if invalid
          ...(status === 'INVALID' && contact.phone === result.phoneNumber && {
            status: 'INVALID',
          }),
        },
      });

      logger.info({
        contactId,
        phone: contact.phone,
        validationStatus: status,
        isMobile: result.isMobile,
        isLandline: result.isLandline,
        isValid: result.isValid,
      }, 'Contact phone validation complete');

      return status;
    } catch (error) {
      logger.error({
        contactId,
        error,
      }, 'Failed to validate contact phone');
      throw error;
    }
  }

  /**
   * Validate a phone number without updating contact
   */
  public async validatePhone(phoneNumber: string): Promise<PhoneValidationResult> {
    try {
      logger.debug({ phoneNumber }, 'Validating phone number');

      const result = await twilioLookupClient.lookupPhone(phoneNumber);

      return result;
    } catch (error) {
      logger.error({
        phoneNumber,
        error,
      }, 'Failed to validate phone');
      throw error;
    }
  }

  /**
   * Format phone number to E.164 format
   */
  public formatPhone(phoneNumber: string, countryCode: string = 'US'): string {
    return twilioLookupClient.formatPhoneNumber(phoneNumber, countryCode);
  }

  /**
   * Map Twilio result to database status
   */
  private mapResultToStatus(result: PhoneValidationResult): PhoneValidationStatus {
    if (!result.isValid) {
      return PhoneValidationStatus.INVALID;
    }

    if (result.isMobile) {
      return PhoneValidationStatus.VALID_MOBILE;
    }

    if (result.isLandline) {
      return PhoneValidationStatus.VALID_LANDLINE;
    }

    return PhoneValidationStatus.UNKNOWN;
  }

  /**
   * Check if phone validation is needed
   */
  public async needsValidation(contactId: string): Promise<boolean> {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        phone: true,
        phoneValidationStatus: true,
        phoneValidatedAt: true,
      },
    });

    if (!contact || !contact.phone) {
      return false;
    }

    // Need validation if never validated
    if (contact.phoneValidationStatus === 'PENDING' || !contact.phoneValidatedAt) {
      return true;
    }

    // Re-validate if it's been more than 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    return contact.phoneValidatedAt < ninetyDaysAgo;
  }
}

// Export singleton instance
export const phoneValidationService = new PhoneValidationService();


import { prisma } from '../../config/database';
import { neverBounceClient } from '../../integrations/neverbounce/client';
import { EmailValidationResult } from '../../integrations/neverbounce/types';
import { logger } from '../../utils/logger';
import { EmailValidationStatus } from '@prisma/client';

/**
 * Email Validation Service
 * Validates email addresses using NeverBounce and updates contact records
 */
export class EmailValidationService {
  /**
   * Validate a single email address and update contact
   */
  public async validateContactEmail(contactId: string): Promise<EmailValidationStatus> {
    try {
      // Get contact with current attempt count
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { 
          id: true, 
          email: true, 
          emailValidationAttempts: true 
        },
      });

      if (!contact) {
        throw new Error(`Contact ${contactId} not found`);
      }

      // Increment attempts counter
      const attempts = (contact.emailValidationAttempts || 0) + 1;

      logger.info({ 
        contactId, 
        email: contact.email, 
        attempt: attempts 
      }, 'Validating contact email');

      try {
        // Validate email
        const result = await neverBounceClient.verifyEmail(contact.email, {
          address_info: true,
          credits_info: false,
        });

        // Map result to database status
        const status = this.mapResultToStatus(result);

        // Update contact with successful validation
        await prisma.contact.update({
          where: { id: contactId },
          data: {
            emailValidationStatus: status,
            emailValidationAttempts: attempts,
            emailValidatedAt: new Date(),
            // Update email to normalized version if available
            ...(result.normalizedEmail && { email: result.normalizedEmail }),
            // Note: We do NOT set status: 'INVALID' to allow SMS enrollment
          },
        });

        logger.info({
          contactId,
          email: contact.email,
          validationStatus: status,
          isValid: result.isValid,
          attempts,
        }, 'Contact email validation complete');

        return status;
      } catch (validationError: any) {
        // If we've exhausted retries (3 attempts), mark email as INVALID
        if (attempts >= 3) {
          await prisma.contact.update({
            where: { id: contactId },
            data: {
              emailValidationStatus: 'INVALID',
              emailValidationAttempts: attempts,
              emailValidatedAt: new Date(),
              // Note: We do NOT set status: 'INVALID' so contact can still be enrolled in SMS campaigns
            },
          });
          
          logger.error({
            contactId,
            email: contact.email,
            attempts,
            error: validationError.message,
          }, 'Email validation failed after max attempts - marked email as INVALID');

          return EmailValidationStatus.INVALID;
        }

        // Update attempt count but keep PENDING status for retry
        await prisma.contact.update({
          where: { id: contactId },
          data: {
            emailValidationAttempts: attempts,
          },
        });

        logger.warn({
          contactId,
          email: contact.email,
          attempts,
          error: validationError.message,
        }, `Email validation attempt ${attempts} failed, will retry`);

        throw validationError;
      }
    } catch (error) {
      logger.error({
        contactId,
        error,
      }, 'Failed to validate contact email');
      throw error;
    }
  }

  /**
   * Validate an email address without updating contact
   */
  public async validateEmail(email: string): Promise<EmailValidationResult> {
    try {
      logger.debug({ email }, 'Validating email address');

      const result = await neverBounceClient.verifyEmail(email, {
        address_info: true,
      });

      return result;
    } catch (error) {
      logger.error({
        email,
        error,
      }, 'Failed to validate email');
      throw error;
    }
  }

  /**
   * Validate multiple emails in bulk
   */
  public async validateBulk(
    emails: Array<{ id: string; email: string }>
  ): Promise<string> {
    try {
      logger.info({ count: emails.length }, 'Starting bulk email validation');

      const result = await neverBounceClient.verifyBulk(emails);

      logger.info({
        jobId: result.job_id,
        emailCount: emails.length,
      }, 'Bulk email validation job created');

      return result.job_id;
    } catch (error) {
      logger.error({
        emailCount: emails.length,
        error,
      }, 'Failed to start bulk email validation');
      throw error;
    }
  }

  /**
   * Map NeverBounce result to database status
   */
  private mapResultToStatus(result: EmailValidationResult): EmailValidationStatus {
    switch (result.result) {
      case 'valid':
        return EmailValidationStatus.VALID;
      case 'invalid':
        return EmailValidationStatus.INVALID;
      case 'catchall':
        return EmailValidationStatus.CATCH_ALL;
      case 'disposable':
        return EmailValidationStatus.DISPOSABLE;
      case 'unknown':
      default:
        return EmailValidationStatus.UNKNOWN;
    }
  }

  /**
   * Check if email validation is needed
   */
  public async needsValidation(contactId: string): Promise<boolean> {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        emailValidationStatus: true,
        emailValidatedAt: true,
      },
    });

    if (!contact) {
      return false;
    }

    // Need validation if never validated
    if (contact.emailValidationStatus === 'PENDING' || !contact.emailValidatedAt) {
      return true;
    }

    // Re-validate if it's been more than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    return contact.emailValidatedAt < thirtyDaysAgo;
  }
}

// Export singleton instance
export const emailValidationService = new EmailValidationService();


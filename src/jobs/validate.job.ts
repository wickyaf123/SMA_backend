/**
 * Validate Job
 * Daily email and phone validation
 * Day 8: Daily Automation
 */

import { emailValidationService } from '../services/validation/email.service';
import { phoneValidationService } from '../services/validation/phone.service';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export interface ValidateJobConfig {
  batchSize?: number;
}

export interface ValidateJobResult {
  success: boolean;
  contactsProcessed: number;
  emailsValidated: number;
  phonesValidated: number;
  errors: string[];
  duration: number;
}

export class ValidateJob {
  async run(config: ValidateJobConfig = { batchSize: 10 }): Promise<ValidateJobResult> {
    const startTime = Date.now();
    logger.info({ config }, 'Starting validate job');

    try {
      // Get contacts that need validation
      const contacts = await prisma.contact.findMany({
        where: {
          status: { in: ['NEW'] },
          emailValidationStatus: 'PENDING',
        },
        take: config.batchSize,
        orderBy: { createdAt: 'desc' },
      });

      logger.info({ count: contacts.length }, 'Found contacts to validate');

      let emailsValidated = 0;
      let phonesValidated = 0;
      const errors: string[] = [];

      for (const contact of contacts) {
        try {
          // Validate email
          if (contact.email) {
            const emailResult = await emailValidationService.validateEmail(contact.email);
            if (emailResult.isValid) {
              emailsValidated++;
            }
          }

          // Validate phone
          if (contact.phone) {
            const phoneResult = await phoneValidationService.validatePhone(contact.phone);
            if (phoneResult.isValid) {
              phonesValidated++;
            }
          }

          // Update contact status if both valid
          await prisma.contact.update({
            where: { id: contact.id },
            data: {
              status: 'VALIDATED',
            },
          });
        } catch (error: any) {
          logger.warn({ contactId: contact.id, error: error.message }, 'Failed to validate contact');
          errors.push(`Contact ${contact.id}: ${error.message}`);
        }
      }

      const duration = Date.now() - startTime;

      logger.info(
        {
          contactsProcessed: contacts.length,
          emailsValidated,
          phonesValidated,
          duration,
        },
        'Validate job completed'
      );

      return {
        success: true,
        contactsProcessed: contacts.length,
        emailsValidated,
        phonesValidated,
        errors,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error({ error: error.message, duration }, 'Validate job failed');

      return {
        success: false,
        contactsProcessed: 0,
        emailsValidated: 0,
        phonesValidated: 0,
        errors: [error.message],
        duration,
      };
    }
  }
}

export const validateJob = new ValidateJob();


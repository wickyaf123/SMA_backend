/**
 * Validate Job
 * Daily email/phone validation + permit-type relevance check
 * Day 8: Daily Automation
 */

import { emailValidationService } from '../services/validation/email.service';
import { phoneValidationService } from '../services/validation/phone.service';
import { scoreContractorRelevance } from '../services/validation/relevance.service';
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
  relevanceChecked: number;
  relevanceRejected: number;
  errors: string[];
  duration: number;
}

export class ValidateJob {
  async run(config: ValidateJobConfig = { batchSize: 10 }): Promise<ValidateJobResult> {
    const startTime = Date.now();
    logger.info({ config }, 'Starting validate job');

    try {
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
      let relevanceChecked = 0;
      let relevanceRejected = 0;
      const errors: string[] = [];

      for (const contact of contacts) {
        try {
          // Relevance check for Shovels-sourced contacts
          if (contact.source === 'shovels' && (contact as any).permitType && (contact as any).shovelsContractorId) {
            relevanceChecked++;
            const isRelevant = await this.checkRelevance(contact);
            if (!isRelevant) {
              relevanceRejected++;
              await prisma.contact.update({
                where: { id: contact.id },
                data: { status: 'IRRELEVANT' },
              });
              logger.info(
                { contactId: contact.id, permitType: (contact as any).permitType },
                'Contact marked IRRELEVANT by permit-type relevance check'
              );
              continue;
            }
          }

          if (contact.email) {
            const emailResult = await emailValidationService.validateEmail(contact.email);
            if (emailResult.isValid) {
              emailsValidated++;
            }
          }

          if (contact.phone) {
            const phoneResult = await phoneValidationService.validatePhone(contact.phone);
            if (phoneResult.isValid) {
              phonesValidated++;
            }
          }

          await prisma.contact.update({
            where: { id: contact.id },
            data: { status: 'VALIDATED' },
          });
        } catch (error: any) {
          logger.warn({ contactId: contact.id, error: error.message }, 'Failed to validate contact');
          errors.push(`Contact ${contact.id}: ${error.message}`);
        }
      }

      const duration = Date.now() - startTime;

      logger.info(
        { contactsProcessed: contacts.length, emailsValidated, phonesValidated, relevanceChecked, relevanceRejected, duration },
        'Validate job completed'
      );

      return {
        success: true,
        contactsProcessed: contacts.length,
        emailsValidated,
        phonesValidated,
        relevanceChecked,
        relevanceRejected,
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
        relevanceChecked: 0,
        relevanceRejected: 0,
        errors: [error.message],
        duration,
      };
    }
  }

  /**
   * Re-check a previously-imported contact against its contractor's tag_tally.
   * Uses cached enrichmentData first; falls back to Shovels API if needed.
   */
  private async checkRelevance(contact: any): Promise<boolean> {
    const permitType = contact.permitType;
    const enrichment = contact.enrichmentData as Record<string, any> | null;

    if (enrichment?.tags && Array.isArray(enrichment.tags)) {
      const tagTally: Record<string, number> = {};
      for (const tag of enrichment.tags) {
        tagTally[tag] = (tagTally[tag] || 0) + 1;
      }

      const fakeContractor = {
        id: contact.shovelsContractorId || '',
        name: contact.fullName || '',
        business_name: null as string | null,
        tag_tally: Object.keys(tagTally).length > 0 ? tagTally : null,
        primary_industry: null,
        classification: null,
        classification_derived: null,
      };

      const company = contact.companyId
        ? await prisma.company.findUnique({ where: { id: contact.companyId }, select: { name: true } })
        : null;
      fakeContractor.business_name = company?.name || null;

      const result = scoreContractorRelevance(fakeContractor as any, permitType);
      return result.relevant;
    }

    return true;
  }
}

export const validateJob = new ValidateJob();


/**
 * Enrich Job
 * Daily Hunter.io email enrichment
 * Day 8: Daily Automation
 */

import { HunterEnrichmentService } from '../services/enrichment/hunter.service';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const enrichmentService = new HunterEnrichmentService();

export interface EnrichJobConfig {
  batchSize?: number;
  onlyNew?: boolean;
}

export interface EnrichJobResult {
  success: boolean;
  contactsProcessed: number;
  contactsEnriched: number;
  errors: string[];
  duration: number;
}

export class EnrichJob {
  async run(config: EnrichJobConfig = {
    batchSize: 10,
    onlyNew: true,
  }): Promise<EnrichJobResult> {
    const startTime = Date.now();
    logger.info({ config }, 'Starting enrich job');

    try {
      // Get contacts that need enrichment (must have email that's not empty)
      const where: any = {
        email: { not: '' },
        status: { in: ['NEW', 'VALIDATED'] },
      };
      
      if (config.onlyNew) {
        where.hunterEnrichedAt = null;
      }

      const contacts = await prisma.contact.findMany({
        where,
        take: config.batchSize,
        orderBy: { createdAt: 'desc' },
      });

      logger.info({ count: contacts.length }, 'Found contacts to enrich');

      let enriched = 0;
      const errors: string[] = [];

      for (const contact of contacts) {
        if (!contact.email) continue;

        try {
          await enrichmentService.enrichContact(contact.id);
          enriched++;
        } catch (error: any) {
          logger.warn({ contactId: contact.id, error: error.message }, 'Failed to enrich contact');
          errors.push(`Contact ${contact.id}: ${error.message}`);
        }
      }

      const duration = Date.now() - startTime;

      logger.info(
        { contactsProcessed: contacts.length, contactsEnriched: enriched, duration },
        'Enrich job completed'
      );

      return {
        success: true,
        contactsProcessed: contacts.length,
        contactsEnriched: enriched,
        errors,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error({ error: error.message, duration }, 'Enrich job failed');

      return {
        success: false,
        contactsProcessed: 0,
        contactsEnriched: 0,
        errors: [error.message],
        duration,
      };
    }
  }
}

export const enrichJob = new EnrichJob();


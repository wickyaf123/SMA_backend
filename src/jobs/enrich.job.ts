/**
 * Enrich Job
 * Daily Clay enrichment for contacts missing email/phone data
 */

import { ClayEnrichmentService } from '../services/enrichment/clay.service';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

const clayService = new ClayEnrichmentService();

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
    batchSize: 50,
    onlyNew: true,
  }): Promise<EnrichJobResult> {
    const startTime = Date.now();
    logger.info({ config }, 'Starting Clay enrich job');

    try {
      const errors: string[] = [];
      let enriched = 0;

      const contacts = await prisma.contact.findMany({
        where: {
          clayEnrichedAt: config.onlyNew ? null : undefined,
          status: { in: ['NEW', 'VALIDATED'] },
        },
        take: config.batchSize || 50,
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      logger.info({ count: contacts.length }, 'Found contacts to enrich via Clay');

      for (const contact of contacts) {
        try {
          const result = await clayService.enrichContact(contact.id);
          if (result.success) enriched++;
          else if (result.error) errors.push(`Contact ${contact.id}: ${result.error}`);
        } catch (error: any) {
          logger.warn({ contactId: contact.id, error: error.message }, 'Failed to enrich contact via Clay');
          errors.push(`Contact ${contact.id}: ${error.message}`);
        }
      }

      const duration = Date.now() - startTime;
      logger.info({ contactsProcessed: contacts.length, contactsEnriched: enriched, duration }, 'Clay enrich job completed');

      return {
        success: true,
        contactsProcessed: contacts.length,
        contactsEnriched: enriched,
        errors,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error({ error: error.message, duration }, 'Clay enrich job failed');

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

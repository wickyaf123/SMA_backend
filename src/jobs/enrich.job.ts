/**
 * Enrich Job
 * Daily Hunter.io email enrichment
 * Day 8: Daily Automation
 * 
 * Prioritizes:
 * 1. Google Maps contacts without email (need Hunter to find email)
 * 2. Contacts with email that haven't been enriched yet
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
  googleMapsEnriched: number;
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
      let enriched = 0;
      let googleMapsEnriched = 0;
      const errors: string[] = [];
      const allContacts: any[] = [];

      // PRIORITY 1: Google Maps contacts without email (need Hunter to find email)
      const googleMapsNoEmail = await prisma.contact.findMany({
        where: {
          email: '', // Empty string means no email
          source: 'google_maps',
          hunterEnrichedAt: null,
          company: {
            domain: { not: null },
          },
        },
        include: { company: true },
        take: Math.floor(config.batchSize! / 2), // Half the batch for Google Maps
        orderBy: { createdAt: 'desc' },
      });

      logger.info({ count: googleMapsNoEmail.length }, 'Found Google Maps contacts without email');

      // Enrich Google Maps contacts
      for (const contact of googleMapsNoEmail) {
        try {
          const result = await enrichmentService.enrichContact(contact.id);
          if (result.success) {
            enriched++;
            googleMapsEnriched++;
            logger.info({
              contactId: contact.id,
              company: contact.company?.name,
              email: result.email,
            }, 'Google Maps contact enriched with email');
          } else {
            // Mark as enrichment attempted even if failed
            await prisma.contact.update({
              where: { id: contact.id },
              data: { hunterEnrichedAt: new Date() },
            });
            errors.push(`Contact ${contact.id}: ${result.error}`);
          }
        } catch (error: any) {
          logger.warn({ contactId: contact.id, error: error.message }, 'Failed to enrich Google Maps contact');
          errors.push(`Contact ${contact.id}: ${error.message}`);
        }
      }

      // PRIORITY 2: Contacts with email that need enrichment
      const remainingBatch = config.batchSize! - googleMapsNoEmail.length;
      if (remainingBatch > 0) {
        const contactsWithEmail = await prisma.contact.findMany({
          where: {
            email: { not: '' },
            status: { in: ['NEW', 'VALIDATED'] },
            hunterEnrichedAt: config.onlyNew ? null : undefined,
          },
          take: remainingBatch,
          orderBy: { createdAt: 'desc' },
        });

        logger.info({ count: contactsWithEmail.length }, 'Found contacts with email to enrich');

        for (const contact of contactsWithEmail) {
          if (!contact.email) continue;

          try {
            await enrichmentService.enrichContact(contact.id);
            enriched++;
          } catch (error: any) {
            logger.warn({ contactId: contact.id, error: error.message }, 'Failed to enrich contact');
            errors.push(`Contact ${contact.id}: ${error.message}`);
          }
        }

        allContacts.push(...contactsWithEmail);
      }

      allContacts.push(...googleMapsNoEmail);

      const duration = Date.now() - startTime;

      logger.info(
        { 
          contactsProcessed: allContacts.length, 
          contactsEnriched: enriched,
          googleMapsEnriched,
          duration,
        },
        'Enrich job completed'
      );

      return {
        success: true,
        contactsProcessed: allContacts.length,
        contactsEnriched: enriched,
        googleMapsEnriched,
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
        googleMapsEnriched: 0,
        errors: [error.message],
        duration,
      };
    }
  }
}

export const enrichJob = new EnrichJob();


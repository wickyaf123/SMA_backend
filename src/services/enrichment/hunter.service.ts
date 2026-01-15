/**
 * Hunter.io Enrichment Service
 * Phase 3.5 - Email Enrichment for Track A Contacts
 */

import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { getHunterClient } from '../../integrations/hunter/client';
import type {
  BulkEnrichmentResult,
  EnrichmentJobStatus,
  NormalizedHunterResult,
} from '../../integrations/hunter/types';

export class HunterEnrichmentService {
  private hunterClient = getHunterClient();

  /**
   * Enrich a single contact with email from Hunter.io
   */
  async enrichContact(contactId: string): Promise<{
    success: boolean;
    email?: string;
    confidence?: number;
    error?: string;
  }> {
    try {
      logger.info({ contactId }, 'Enriching contact with Hunter.io');

      // Get contact with company
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        include: { company: true },
      });

      if (!contact) {
        throw new Error(`Contact ${contactId} not found`);
      }

      // Check if contact already has email
      if (contact.email) {
        logger.info({ contactId, email: contact.email }, 'Contact already has email');
        return {
          success: false,
          error: 'Contact already has email',
        };
      }

      // Need company domain for Hunter.io
      if (!contact.company?.domain) {
        logger.warn({ contactId }, 'No company domain for enrichment');
        return {
          success: false,
          error: 'No company domain available',
        };
      }

      // If we have first/last name, use email finder
      if (contact.firstName && contact.lastName) {
        try {
          const result = await this.hunterClient.findEmail({
            domain: contact.company.domain,
            first_name: contact.firstName,
            last_name: contact.lastName,
          });

          if (result.data.email && result.data.score >= 50) {
            await this.updateContactWithEmail(contactId, {
              email: result.data.email,
              confidence: result.data.score,
              firstName: result.data.first_name,
              lastName: result.data.last_name,
              position: result.data.position,
              linkedinUrl: result.data.linkedin_url,
              phoneNumber: result.data.phone_number,
              verificationStatus: result.data.verification?.status,
              sources: result.data.sources.length,
              foundAt: new Date(),
            });

            return {
              success: true,
              email: result.data.email,
              confidence: result.data.score,
            };
          }
        } catch (error) {
          logger.warn(
            { error, contactId },
            'Email finder failed, falling back to domain search'
          );
        }
      }

      // Fall back to domain search - get best email
      const topEmail = await this.hunterClient.getTopEmail(
        contact.company.domain,
        { minConfidence: 50 }
      );

      if (!topEmail) {
        logger.info({ contactId, domain: contact.company.domain }, 'No email found');
        return {
          success: false,
          error: 'No email found for domain',
        };
      }

      await this.updateContactWithEmail(contactId, {
        email: topEmail.value,
        confidence: topEmail.confidence,
        firstName: topEmail.firstName,
        lastName: topEmail.lastName,
        position: topEmail.position,
        linkedinUrl: topEmail.linkedin,
        phoneNumber: topEmail.phoneNumber,
        verificationStatus: topEmail.verification?.status,
        sources: topEmail.sources?.length || 0,
        foundAt: new Date(),
      });

      return {
        success: true,
        email: topEmail.value,
        confidence: topEmail.confidence,
      };
    } catch (error) {
      logger.error({ error, contactId }, 'Contact enrichment failed');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Bulk enrich contacts
   */
  async bulkEnrichContacts(
    contactIds: string[],
    options?: {
      delayMs?: number;
      minConfidence?: number;
    }
  ): Promise<BulkEnrichmentResult> {
    logger.info({ count: contactIds.length }, 'Starting bulk enrichment');

    const result: BulkEnrichmentResult = {
      total: contactIds.length,
      enriched: 0,
      failed: 0,
      skipped: 0,
      results: [],
    };

    for (const contactId of contactIds) {
      const enrichResult = await this.enrichContact(contactId);

      result.results.push({
        contactId,
        email: enrichResult.email,
        confidence: enrichResult.confidence,
        error: enrichResult.error,
      });

      if (enrichResult.success) {
        result.enriched++;
      } else if (enrichResult.error?.includes('already has email')) {
        result.skipped++;
      } else {
        result.failed++;
      }

      // Log progress
      if (result.results.length % 10 === 0) {
        logger.info(
          {
            progress: `${result.results.length}/${contactIds.length}`,
            enriched: result.enriched,
            failed: result.failed,
          },
          'Enrichment progress'
        );
      }

      // Add delay between requests
      if (
        options?.delayMs &&
        contactIds.indexOf(contactId) < contactIds.length - 1
      ) {
        await new Promise((resolve) => setTimeout(resolve, options.delayMs));
      }
    }

    logger.info(result, 'Bulk enrichment completed');

    return result;
  }

  /**
   * Enrich contacts without emails from Google Maps
   */
  async enrichGoogleMapsContacts(
    options?: {
      limit?: number;
      minDataQuality?: number;
    }
  ): Promise<BulkEnrichmentResult> {
    logger.info(options, 'Enriching Google Maps contacts');

    // Find contacts without emails that have company domain
    const contacts = await prisma.contact.findMany({
      where: {
        OR: [
          { email: '' },
          { email: { equals: null as any } },
        ],
        dataSources: {
          has: 'GOOGLE_MAPS',
        },
        company: {
          domain: {
            not: null,
          },
        },
        dataQuality: {
          gte: options?.minDataQuality || 50,
        },
        hunterEnrichedAt: {
          equals: null as any,
        },
      },
      take: options?.limit || 100,
      select: {
        id: true,
      },
    });

    logger.info(
      { count: contacts.length },
      'Found contacts to enrich'
    );

    if (contacts.length === 0) {
      return {
        total: 0,
        enriched: 0,
        failed: 0,
        skipped: 0,
        results: [],
      };
    }

    return this.bulkEnrichContacts(
      contacts.map((c) => c.id),
      { delayMs: 1000 } // 1 second delay between requests
    );
  }

  /**
   * Get enrichment job status
   */
  async getEnrichmentStatus(): Promise<EnrichmentJobStatus> {
    const totalContacts = await prisma.contact.count({
      where: {
        dataSources: {
          has: 'GOOGLE_MAPS',
        },
        company: {
          domain: {
            not: null,
          },
        },
      },
    });

    const enrichedContacts = await prisma.contact.count({
      where: {
        dataSources: {
          has: 'GOOGLE_MAPS',
        },
        hunterEnrichedAt: {
          not: null,
        },
      },
    });

    const failedContacts = await prisma.contact.count({
      where: {
        dataSources: {
          has: 'GOOGLE_MAPS',
        },
        hunterEnrichedAt: {
          equals: null,
        },
        company: {
          domain: {
            not: null,
          },
        },
      },
    });

    return {
      jobId: 'enrichment',
      status: enrichedContacts < totalContacts ? 'running' : 'completed',
      progress: {
        total: totalContacts,
        processed: enrichedContacts + failedContacts,
        enriched: enrichedContacts,
        failed: failedContacts,
      },
      startedAt: new Date(),
    };
  }

  /**
   * Update contact with Hunter.io email
   */
  private async updateContactWithEmail(
    contactId: string,
    data: NormalizedHunterResult
  ): Promise<void> {
    try {
      // Calculate new data quality score
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { dataQuality: true },
      });

      const currentQuality = contact?.dataQuality || 0;
      const emailBonus = 25; // Email adds 25 points
      const newQuality = Math.min(currentQuality + emailBonus, 100);

      await prisma.contact.update({
        where: { id: contactId },
        data: {
          email: data.email,
          firstName: data.firstName || undefined,
          lastName: data.lastName || undefined,
          title: data.position || undefined,
          linkedinUrl: data.linkedinUrl || undefined,
          phone: data.phoneNumber || undefined,
          hunterEnrichedAt: data.foundAt,
          hunterScore: data.confidence,
          dataQuality: newQuality,
          emailValidationStatus:
            data.verificationStatus === 'valid' ? 'VALID' : 'PENDING',
        },
      });

      logger.info(
        {
          contactId,
          email: data.email,
          confidence: data.confidence,
          newQuality,
        },
        'Contact updated with Hunter.io email'
      );
    } catch (error) {
      logger.error({ error, contactId }, 'Failed to update contact with email');
      throw error;
    }
  }
}


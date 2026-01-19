/**
 * Contact Merger Service
 * Phase 3.5 - Merge Track A (Google Maps + Hunter) with Track B (Apollo)
 */

import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import type { Contact, Company } from '@prisma/client';

/**
 * Data source quality ranking (highest to lowest)
 */
export const DATA_SOURCE_QUALITY = {
  APOLLO: 100,
  HUNTER: 75,
  GOOGLE_MAPS: 50,
  CSV_IMPORT: 25,
  MANUAL: 10,
} as const;

/**
 * Merge result for contacts
 */
export interface ContactMergeResult {
  action: 'created' | 'updated' | 'skipped' | 'merged';
  contactId: string;
  duplicateOf?: string;
  reason?: string;
}

/**
 * Deduplication match
 */
export interface DeduplicationMatch {
  matchType: 'email' | 'phone' | 'company_address' | 'website';
  confidence: number;
  existingContact: Contact;
}

/**
 * Merge statistics
 */
export interface MergeStatistics {
  total: number;
  created: number;
  updated: number;
  merged: number;
  skipped: number;
  errors: number;
  results: ContactMergeResult[];
}

export class ContactMergerService {
  /**
   * Find duplicate contacts using multiple matching strategies
   */
  async findDuplicates(
    contact: {
      email?: string | null;
      phone?: string | null;
      phoneFormatted?: string | null;
      company?: {
        name: string;
        domain?: string | null;
        address?: string | null;
      } | null;
    }
  ): Promise<DeduplicationMatch[]> {
    const matches: DeduplicationMatch[] = [];

    // Strategy 1: Email match (highest priority - 100% confidence)
    if (contact.email) {
      const emailMatch = await prisma.contact.findFirst({
        where: {
          email: contact.email,
        },
      });

      if (emailMatch) {
        matches.push({
          matchType: 'email',
          confidence: 100,
          existingContact: emailMatch,
        });
        return matches; // Email match is definitive, return immediately
      }
    }

    // Strategy 2: Phone match (high confidence - 90%)
    if (contact.phoneFormatted) {
      const phoneMatch = await prisma.contact.findFirst({
        where: {
          phoneFormatted: contact.phoneFormatted,
        },
        include: {
          company: true,
        },
      });

      if (phoneMatch) {
        // If same company, very high confidence
        if (
          contact.company?.name &&
          phoneMatch.company?.name &&
          this.normalizeCompanyName(contact.company.name) ===
            this.normalizeCompanyName(phoneMatch.company.name)
        ) {
          matches.push({
            matchType: 'phone',
            confidence: 95,
            existingContact: phoneMatch,
          });
        } else {
          matches.push({
            matchType: 'phone',
            confidence: 80,
            existingContact: phoneMatch,
          });
        }
      }
    }

    // Strategy 3: Website/Domain match (medium confidence - 70%)
    if (contact.company?.domain) {
      const domainMatches = await prisma.contact.findMany({
        where: {
          company: {
            domain: contact.company.domain,
          },
        },
        include: {
          company: true,
        },
        take: 5,
      });

      for (const domainMatch of domainMatches) {
        // Check if it's the same person (first/last name match)
        matches.push({
          matchType: 'website',
          confidence: 70,
          existingContact: domainMatch,
        });
      }
    }

    // Strategy 4: Company Name + Address match (medium confidence - 75%)
    if (contact.company?.name && contact.company?.address) {
      const companyMatches = await prisma.contact.findMany({
        where: {
          company: {
            name: {
              contains: this.normalizeCompanyName(contact.company.name),
              mode: 'insensitive',
            },
            location: {
              contains: this.normalizeAddress(contact.company.address),
              mode: 'insensitive',
            },
          },
        },
        include: {
          company: true,
        },
        take: 5,
      });

      for (const companyMatch of companyMatches) {
        const existingMatch = matches.find(
          (m) => m.existingContact.id === companyMatch.id
        );
        if (!existingMatch) {
          matches.push({
            matchType: 'company_address',
            confidence: 75,
            existingContact: companyMatch,
          });
        }
      }
    }

    // Sort by confidence (highest first)
    matches.sort((a, b) => b.confidence - a.confidence);

    logger.debug(
      {
        email: contact.email,
        phone: contact.phoneFormatted,
        matchCount: matches.length,
      },
      'Duplicate search completed'
    );

    return matches;
  }

  /**
   * Merge two contacts - keep the higher quality data
   */
  async mergeContacts(
    targetId: string,
    sourceId: string
  ): Promise<Contact> {
    logger.info({ targetId, sourceId }, 'Merging contacts');

    const target = await prisma.contact.findUnique({
      where: { id: targetId },
      include: { company: true },
    });

    const source = await prisma.contact.findUnique({
      where: { id: sourceId },
      include: { company: true },
    });

    if (!target || !source) {
      throw new Error('Target or source contact not found');
    }

    // Determine which data to keep based on quality
    const targetQuality = this.getDataSourceQuality(target.dataSources);
    const sourceQuality = this.getDataSourceQuality(source.dataSources);

    logger.debug(
      {
        targetQuality,
        sourceQuality,
        targetSources: target.dataSources,
        sourceSources: source.dataSources,
      },
      'Data quality comparison'
    );

    // Merge data - prefer higher quality source
    const mergedData = this.selectBestData(target, source);

    // Combine data sources
    const combinedSources = Array.from(
      new Set([...target.dataSources, ...source.dataSources])
    );

    // Update target contact with merged data
    const updated = await prisma.contact.update({
      where: { id: targetId },
      data: {
        email: mergedData.email,
        firstName: mergedData.firstName,
        lastName: mergedData.lastName,
        fullName: mergedData.fullName,
        phone: mergedData.phone,
        phoneFormatted: mergedData.phoneFormatted,
        title: mergedData.title,
        linkedinUrl: mergedData.linkedinUrl,
        linkedinId: mergedData.linkedinId,
        city: mergedData.city,
        state: mergedData.state,
        country: mergedData.country,
        timezone: mergedData.timezone,
        emailValidationStatus: mergedData.emailValidationStatus,
        phoneValidationStatus: mergedData.phoneValidationStatus,
        hunterEnrichedAt: mergedData.hunterEnrichedAt,
        hunterScore: mergedData.hunterScore,
        apolloId: mergedData.apolloId,
        sourceId: mergedData.sourceId,
        customFields: mergedData.customFields as any,
        enrichmentData: mergedData.enrichmentData as any,
        dataSources: combinedSources,
        dataQuality: Math.max(target.dataQuality ?? 0, source.dataQuality ?? 0),
      },
    });

    // Delete source contact
    await prisma.contact.delete({
      where: { id: sourceId },
    });

    logger.info(
      {
        mergedId: updated.id,
        deletedId: sourceId,
        sources: combinedSources,
      },
      'Contacts merged successfully'
    );

    return updated;
  }

  /**
   * Merge and deduplicate a batch of contacts
   */
  async mergeAndDeduplicate(
    contactIds: string[]
  ): Promise<MergeStatistics> {
    logger.info({ count: contactIds.length }, 'Starting merge and deduplication');

    const stats: MergeStatistics = {
      total: contactIds.length,
      created: 0,
      updated: 0,
      merged: 0,
      skipped: 0,
      errors: 0,
      results: [],
    };

    for (const contactId of contactIds) {
      try {
        const contact = await prisma.contact.findUnique({
          where: { id: contactId },
          include: { company: true },
        });

        if (!contact) {
          stats.skipped++;
          stats.results.push({
            action: 'skipped',
            contactId,
            reason: 'Contact not found',
          });
          continue;
        }

        // Find duplicates
        const matches = await this.findDuplicates({
          email: contact.email,
          phone: contact.phone,
          phoneFormatted: contact.phoneFormatted,
          company: contact.company
            ? {
                name: contact.company.name,
                domain: contact.company.domain,
                address: contact.company.location,
              }
            : null,
        });

        // If high-confidence match found, merge
        if (matches.length > 0 && matches[0].confidence >= 90) {
          const existingContact = matches[0].existingContact;
          
          // Merge into the one with better data quality
          const contactQuality = this.getDataSourceQuality(contact.dataSources);
          const existingQuality = this.getDataSourceQuality(existingContact.dataSources);

          if (contactQuality > existingQuality) {
            // Merge existing into current
            await this.mergeContacts(contact.id, existingContact.id);
            stats.merged++;
            stats.results.push({
              action: 'merged',
              contactId: contact.id,
              duplicateOf: existingContact.id,
              reason: `${matches[0].matchType} match (${matches[0].confidence}%)`,
            });
          } else {
            // Merge current into existing
            await this.mergeContacts(existingContact.id, contact.id);
            stats.merged++;
            stats.results.push({
              action: 'merged',
              contactId: existingContact.id,
              duplicateOf: contact.id,
              reason: `${matches[0].matchType} match (${matches[0].confidence}%)`,
            });
          }
        } else {
          // No merge needed
          stats.skipped++;
          stats.results.push({
            action: 'skipped',
            contactId: contact.id,
            reason: matches.length > 0 
              ? `Low confidence match (${matches[0].confidence}%)`
              : 'No duplicates found',
          });
        }

        // Log progress
        if (stats.results.length % 10 === 0) {
          logger.info(
            {
              progress: `${stats.results.length}/${contactIds.length}`,
              merged: stats.merged,
              skipped: stats.skipped,
            },
            'Merge progress'
          );
        }
      } catch (error) {
        logger.error({ error, contactId }, 'Failed to process contact');
        stats.errors++;
        stats.results.push({
          action: 'skipped',
          contactId,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logger.info(stats, 'Merge and deduplication completed');

    return stats;
  }

  /**
   * Merge daily imports (run as cron job)
   */
  async mergeDailyImports(): Promise<MergeStatistics> {
    logger.info('Starting daily merge job');

    // Get all contacts from last 24 hours
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const recentContacts = await prisma.contact.findMany({
      where: {
        createdAt: {
          gte: oneDayAgo,
        },
      },
      select: {
        id: true,
      },
    });

    logger.info(
      { count: recentContacts.length },
      'Found recent contacts to merge'
    );

    if (recentContacts.length === 0) {
      return {
        total: 0,
        created: 0,
        updated: 0,
        merged: 0,
        skipped: 0,
        errors: 0,
        results: [],
      };
    }

    return this.mergeAndDeduplicate(recentContacts.map((c) => c.id));
  }

  /**
   * Get data source quality score
   */
  private getDataSourceQuality(sources: string[]): number {
    if (sources.length === 0) return 0;

    // Return highest quality score from sources
    return Math.max(
      ...sources.map(
        (s) => DATA_SOURCE_QUALITY[s as keyof typeof DATA_SOURCE_QUALITY] || 0
      )
    );
  }

  /**
   * Select best data from two contacts based on quality
   */
  private selectBestData(
    contact1: Contact,
    contact2: Contact
  ): Partial<Contact> {
    const quality1 = this.getDataSourceQuality(contact1.dataSources);
    const quality2 = this.getDataSourceQuality(contact2.dataSources);

    const higher = quality1 >= quality2 ? contact1 : contact2;
    const lower = quality1 >= quality2 ? contact2 : contact1;

    return {
      // Always prefer non-null values from higher quality source
      email: higher.email || lower.email,
      firstName: higher.firstName || lower.firstName,
      lastName: higher.lastName || lower.lastName,
      fullName: higher.fullName || lower.fullName,
      phone: higher.phone || lower.phone,
      phoneFormatted: higher.phoneFormatted || lower.phoneFormatted,
      title: higher.title || lower.title,
      linkedinUrl: higher.linkedinUrl || lower.linkedinUrl,
      linkedinId: higher.linkedinId || lower.linkedinId,
      
      // Location
      city: higher.city || lower.city,
      state: higher.state || lower.state,
      country: higher.country || lower.country,
      timezone: higher.timezone || lower.timezone,
      
      // Validation (prefer validated)
      emailValidationStatus: 
        higher.emailValidationStatus === 'VALID' 
          ? higher.emailValidationStatus 
          : lower.emailValidationStatus,
      phoneValidationStatus:
        higher.phoneValidationStatus === 'VALID_MOBILE'
          ? higher.phoneValidationStatus
          : lower.phoneValidationStatus,
      
      // Hunter data (prefer newer)
      hunterEnrichedAt: 
        higher.hunterEnrichedAt && lower.hunterEnrichedAt
          ? (higher.hunterEnrichedAt > lower.hunterEnrichedAt ? higher.hunterEnrichedAt : lower.hunterEnrichedAt)
          : higher.hunterEnrichedAt || lower.hunterEnrichedAt,
      hunterScore: Math.max(higher.hunterScore || 0, lower.hunterScore || 0) || undefined,
      
      // Source IDs (keep both if different)
      apolloId: higher.apolloId || lower.apolloId,
      sourceId: higher.sourceId || lower.sourceId,
      
      // Merge custom fields and enrichment data
      customFields: {
        ...(typeof lower.customFields === 'object' ? lower.customFields : {}),
        ...(typeof higher.customFields === 'object' ? higher.customFields : {}),
      },
      enrichmentData: {
        ...(typeof lower.enrichmentData === 'object' ? lower.enrichmentData : {}),
        ...(typeof higher.enrichmentData === 'object' ? higher.enrichmentData : {}),
      },
    };
  }

  /**
   * Normalize company name for matching
   */
  private normalizeCompanyName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\b(inc|llc|ltd|corp|corporation|company|co)\b\.?/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Normalize address for matching
   */
  private normalizeAddress(address: string): string {
    return address
      .toLowerCase()
      .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|suite|ste|floor|fl)\b\.?/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }
}


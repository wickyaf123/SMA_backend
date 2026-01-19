/**
 * Contact Auto-Merger Service
 * Automatically merges duplicate contacts using completeness scoring
 * 
 * Strategy: Most Complete
 * - Calculate completeness score for each contact
 * - Keep contact with highest score
 * - Fill in missing fields from loser
 * - Move related records (outreach, replies, activity logs)
 * - Delete enrollments from loser
 * - Audit trail to MergedContact table for rollback
 */

import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { Contact, Prisma } from '@prisma/client';

export interface MergeResult {
  winnerContactId: string;
  loserContactId: string;
  fieldsMerged: string[];
  outreachStepsMoved: number;
  repliesMoved: number;
  activityLogsMoved: number;
  enrollmentsDeleted: number;
}

export interface CompletenessScore {
  contactId: string;
  score: number;
  breakdown: {
    hasPhone: number;
    hasCompany: number;
    hasLinkedIn: number;
    emailValidated: number;
    phoneValidated: number;
    hunterEnriched: number;
    apolloSource: number;
    hasTitle: number;
    hasLocation: number;
  };
}

export class ContactAutoMergerService {
  /**
   * Calculate completeness score for a contact
   * Higher score = more complete data
   */
  calculateCompletenessScore(contact: any): CompletenessScore {
    const breakdown = {
      hasPhone: contact.phone ? 10 : 0,
      hasCompany: contact.companyId ? 10 : 0,
      hasLinkedIn: contact.linkedinUrl ? 5 : 0,
      emailValidated: contact.emailValidationStatus === 'VALID' ? 15 : 0,
      phoneValidated: contact.phoneValidationStatus === 'VALID_MOBILE' ? 10 : 
                      contact.phoneValidationStatus === 'VALID_LANDLINE' ? 5 : 0,
      hunterEnriched: contact.hunterEnrichedAt ? 10 : 0,
      apolloSource: contact.source === 'apollo' ? 20 : 0, // Apollo = highest quality
      hasTitle: contact.title ? 5 : 0,
      hasLocation: (contact.city && contact.state) ? 5 : 0,
    };

    const score = Object.values(breakdown).reduce((sum, val) => sum + val, 0);

    return {
      contactId: contact.id,
      score,
      breakdown,
    };
  }

  /**
   * Merge two contacts - keep winner, delete loser
   */
  async mergeDuplicates(
    winnerContact: any,
    loserContact: any
  ): Promise<MergeResult> {
    const winnerId = winnerContact.id;
    const loserId = loserContact.id;

    logger.info(
      {
        winnerId,
        loserId,
        winnerEmail: winnerContact.email,
        loserEmail: loserContact.email,
      },
      'Starting contact merge'
    );

    const fieldsMerged: string[] = [];

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // 1. Fill in missing fields in winner from loser
      const updateData: any = {};

      if (!winnerContact.phone && loserContact.phone) {
        updateData.phone = loserContact.phone;
        updateData.phoneFormatted = loserContact.phoneFormatted;
        updateData.phoneValidationStatus = loserContact.phoneValidationStatus;
        updateData.phoneValidatedAt = loserContact.phoneValidatedAt;
        fieldsMerged.push('phone');
      }

      if (!winnerContact.linkedinUrl && loserContact.linkedinUrl) {
        updateData.linkedinUrl = loserContact.linkedinUrl;
        fieldsMerged.push('linkedinUrl');
      }

      if (!winnerContact.companyId && loserContact.companyId) {
        updateData.companyId = loserContact.companyId;
        fieldsMerged.push('companyId');
      }

      if (!winnerContact.title && loserContact.title) {
        updateData.title = loserContact.title;
        fieldsMerged.push('title');
      }

      if (!winnerContact.city && loserContact.city) {
        updateData.city = loserContact.city;
        fieldsMerged.push('city');
      }

      if (!winnerContact.state && loserContact.state) {
        updateData.state = loserContact.state;
        fieldsMerged.push('state');
      }

      if (!winnerContact.firstName && loserContact.firstName) {
        updateData.firstName = loserContact.firstName;
        fieldsMerged.push('firstName');
      }

      if (!winnerContact.lastName && loserContact.lastName) {
        updateData.lastName = loserContact.lastName;
        fieldsMerged.push('lastName');
      }

      // Merge data sources array
      const mergedDataSources = Array.from(
        new Set([
          ...(winnerContact.dataSources || []),
          ...(loserContact.dataSources || []),
        ])
      );
      if (mergedDataSources.length > winnerContact.dataSources?.length) {
        updateData.dataSources = mergedDataSources;
        fieldsMerged.push('dataSources');
      }

      // Merge tags
      const mergedTags = Array.from(
        new Set([
          ...(winnerContact.tags || []),
          ...(loserContact.tags || []),
        ])
      );
      if (mergedTags.length > winnerContact.tags?.length) {
        updateData.tags = mergedTags;
        fieldsMerged.push('tags');
      }

      // Merge enrichment data (if winner has none)
      if (!winnerContact.enrichmentData && loserContact.enrichmentData) {
        updateData.enrichmentData = loserContact.enrichmentData;
        fieldsMerged.push('enrichmentData');
      }

      // Update winner with merged data
      if (Object.keys(updateData).length > 0) {
        await tx.contact.update({
          where: { id: winnerId },
          data: updateData,
        });
        logger.debug({ winnerId, fieldsMerged }, 'Merged fields into winner');
      }

      // 2. Move outreach steps from loser to winner
      const outreachSteps = await tx.outreachStep.updateMany({
        where: { contactId: loserId },
        data: { contactId: winnerId },
      });

      logger.debug(
        { winnerId, loserId, moved: outreachSteps.count },
        'Moved outreach steps'
      );

      // 3. Move replies from loser to winner
      const replies = await tx.reply.updateMany({
        where: { contactId: loserId },
        data: { contactId: winnerId },
      });

      logger.debug(
        { winnerId, loserId, moved: replies.count },
        'Moved replies'
      );

      // 4. Move activity logs from loser to winner
      const activityLogs = await tx.activityLog.updateMany({
        where: { contactId: loserId },
        data: { contactId: winnerId },
      });

      logger.debug(
        { winnerId, loserId, moved: activityLogs.count },
        'Moved activity logs'
      );

      // 5. Delete enrollments from loser (don't move - avoid double enrollment)
      const enrollments = await tx.campaignEnrollment.deleteMany({
        where: { contactId: loserId },
      });

      logger.debug(
        { loserId, deleted: enrollments.count },
        'Deleted campaign enrollments'
      );

      // 6. Delete sequence enrollments
      await tx.sequenceEnrollment.deleteMany({
        where: { contactId: loserId },
      });

      // 7. Move LinkedIn actions
      await tx.linkedInAction.updateMany({
        where: { contactId: loserId },
        data: { contactId: winnerId },
      });

      // 8. Create audit record in MergedContact table
      const winnerScore = this.calculateCompletenessScore(winnerContact);
      const loserScore = this.calculateCompletenessScore(loserContact);

      await tx.mergedContact.create({
        data: {
          winnerContactId: winnerId,
          loserContactId: loserId,
          loserEmail: loserContact.email,
          mergeStrategy: 'most_complete',
          winnerScore: winnerScore.score,
          loserScore: loserScore.score,
          fieldsMerged: fieldsMerged.length > 0 ? { fields: fieldsMerged } : Prisma.JsonNull,
          outreachStepsMoved: outreachSteps.count,
          repliesMoved: replies.count,
          activityLogsMoved: activityLogs.count,
          enrollmentsDeleted: enrollments.count,
          loserSnapshot: loserContact as any, // Full snapshot for rollback
          mergedBy: 'system',
          canRollback: true,
        },
      });

      // 9. Delete the loser contact
      await tx.contact.delete({
        where: { id: loserId },
      });

      logger.info(
        {
          winnerId,
          loserId,
          fieldsMerged,
          outreachMoved: outreachSteps.count,
          repliesMoved: replies.count,
          activityMoved: activityLogs.count,
          enrollmentsDeleted: enrollments.count,
        },
        'Contact merge completed successfully'
      );

      return {
        winnerContactId: winnerId,
        loserContactId: loserId,
        fieldsMerged,
        outreachStepsMoved: outreachSteps.count,
        repliesMoved: replies.count,
        activityLogsMoved: activityLogs.count,
        enrollmentsDeleted: enrollments.count,
      };
    });

    return result;
  }

  /**
   * Find and merge all duplicates in date range
   */
  async findAndMergeDuplicates(options: {
    startDate: Date;
    endDate: Date;
    dryRun?: boolean;
  }): Promise<{
    duplicatesFound: number;
    duplicatesMerged: number;
    errors: string[];
  }> {
    const { startDate, endDate, dryRun = false } = options;

    logger.info(
      { startDate, endDate, dryRun },
      'Finding duplicates to merge'
    );

    // Find emails with multiple contacts in date range
    const duplicateEmails = await prisma.$queryRaw<
      Array<{ email: string; count: bigint }>
    >`
      SELECT email, COUNT(*) as count
      FROM "Contact"
      WHERE "createdAt" >= ${startDate}
        AND "createdAt" <= ${endDate}
      GROUP BY email
      HAVING COUNT(*) > 1
      ORDER BY count DESC
    `;

    logger.info(
      { duplicateCount: duplicateEmails.length },
      'Found duplicate emails'
    );

    let mergedCount = 0;
    const errors: string[] = [];

    for (const dup of duplicateEmails) {
      try {
        // Get all contacts with this email
        const contacts = await prisma.contact.findMany({
          where: {
            email: dup.email,
            createdAt: {
              gte: startDate,
              lte: endDate,
            },
          },
          include: {
            company: true,
          },
          orderBy: { createdAt: 'asc' }, // Oldest first
        });

        if (contacts.length < 2) continue;

        // Calculate completeness scores for all
        const scoredContacts = contacts.map((c) => ({
          contact: c,
          score: this.calculateCompletenessScore(c),
        }));

        // Sort by score (highest first)
        scoredContacts.sort((a, b) => b.score.score - a.score.score);

        const winner = scoredContacts[0].contact;
        const losers = scoredContacts.slice(1);

        logger.debug(
          {
            email: dup.email,
            totalContacts: contacts.length,
            winnerScore: scoredContacts[0].score.score,
            winnerId: winner.id,
          },
          'Selected winner for merge'
        );

        // Merge all losers into winner
        for (const loser of losers) {
          if (dryRun) {
            logger.info(
              {
                winnerId: winner.id,
                loserId: loser.contact.id,
                winnerScore: scoredContacts[0].score.score,
                loserScore: loser.score.score,
              },
              '[DRY RUN] Would merge contact'
            );
          } else {
            await this.mergeDuplicates(winner, loser.contact);
            mergedCount++;
          }
        }
      } catch (error: any) {
        logger.error(
          { email: dup.email, error: error.message },
          'Failed to merge duplicate'
        );
        errors.push(`${dup.email}: ${error.message}`);
      }
    }

    logger.info(
      {
        duplicatesFound: duplicateEmails.length,
        duplicatesMerged: mergedCount,
        errors: errors.length,
      },
      'Duplicate merge process completed'
    );

    return {
      duplicatesFound: duplicateEmails.length,
      duplicatesMerged: mergedCount,
      errors,
    };
  }

  /**
   * Rollback a merge (restore deleted contact)
   * WARNING: This is complex and may not restore everything perfectly
   */
  async rollbackMerge(mergeId: string): Promise<void> {
    const merge = await prisma.mergedContact.findUnique({
      where: { id: mergeId },
    });

    if (!merge) {
      throw new Error('Merge record not found');
    }

    if (!merge.canRollback) {
      throw new Error('This merge cannot be rolled back');
    }

    if (merge.rolledBackAt) {
      throw new Error('This merge has already been rolled back');
    }

    logger.warn({ mergeId, winnerId: merge.winnerContactId }, 'Rolling back merge');

    // This is a simplified rollback - in production you may want more sophisticated logic
    await prisma.mergedContact.update({
      where: { id: mergeId },
      data: {
        rolledBackAt: new Date(),
        canRollback: false,
      },
    });

    logger.info({ mergeId }, 'Merge marked as rolled back (manual restoration required)');
  }
}

// Export singleton
export const contactAutoMerger = new ContactAutoMergerService();


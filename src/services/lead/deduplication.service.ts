import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

/**
 * Deduplication result
 */
export interface DeduplicationResult {
  isDuplicate: boolean;
  existingContactId?: string;
  existingContact?: {
    id: string;
    email: string | null;
    fullName: string | null;
    status: string;
    createdAt: Date;
  };
}

/**
 * Deduplication Service
 * Checks for duplicate contacts based on email address
 */
export class DeduplicationService {
  /**
   * Check if email already exists in database
   * Strategy: email-only (strict)
   */
  public async checkDuplicate(email: string): Promise<DeduplicationResult> {
    try {
      const normalizedEmail = email.toLowerCase().trim();

      logger.debug({ email: normalizedEmail }, 'Checking for duplicate contact');

      // Find existing contact with this email
      const existingContact = await prisma.contact.findUnique({
        where: { email: normalizedEmail },
        select: {
          id: true,
          email: true,
          fullName: true,
          status: true,
          createdAt: true,
        },
      });

      if (existingContact) {
        logger.info({
          email: normalizedEmail,
          existingContactId: existingContact.id,
        }, 'Duplicate contact found');

        return {
          isDuplicate: true,
          existingContactId: existingContact.id,
          existingContact,
        };
      }

      logger.debug({ email: normalizedEmail }, 'No duplicate found');

      return {
        isDuplicate: false,
      };
    } catch (error) {
      logger.error({
        email,
        error,
      }, 'Error checking for duplicate');
      throw error;
    }
  }

  /**
   * Check multiple emails for duplicates
   * Returns map of email -> duplicate result
   */
  public async checkBulkDuplicates(
    emails: string[]
  ): Promise<Map<string, DeduplicationResult>> {
    try {
      const normalizedEmails = emails.map((e) => e.toLowerCase().trim());

      logger.debug({
        count: normalizedEmails.length,
      }, 'Checking bulk duplicates');

      // Find all existing contacts with these emails
      const existingContacts = await prisma.contact.findMany({
        where: {
          email: {
            in: normalizedEmails,
          },
        },
        select: {
          id: true,
          email: true,
          fullName: true,
          status: true,
          createdAt: true,
        },
      });

      // Build map of email -> contact
      const contactMap = new Map(
        existingContacts.map((c) => [c.email, c])
      );

      // Build results map
      const results = new Map<string, DeduplicationResult>();

      for (const email of normalizedEmails) {
        const existingContact = contactMap.get(email);

        if (existingContact) {
          results.set(email, {
            isDuplicate: true,
            existingContactId: existingContact.id,
            existingContact,
          });
        } else {
          results.set(email, {
            isDuplicate: false,
          });
        }
      }

      logger.info({
        total: normalizedEmails.length,
        duplicates: existingContacts.length,
        unique: normalizedEmails.length - existingContacts.length,
      }, 'Bulk duplicate check complete');

      return results;
    } catch (error) {
      logger.error({
        emailCount: emails.length,
        error,
      }, 'Error checking bulk duplicates');
      throw error;
    }
  }

  /**
   * Get duplicate contacts within a time range
   * Useful for reporting and cleanup
   */
  public async findDuplicatesCreatedInRange(
    startDate: Date,
    endDate: Date
  ): Promise<Array<{ email: string; count: number; contactIds: string[] }>> {
    try {
      logger.debug({
        startDate,
        endDate,
      }, 'Finding duplicates in date range');

      // Group contacts by email and count
      const duplicates = await prisma.$queryRaw<
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

      // Get contact IDs for each duplicate email
      const results = await Promise.all(
        duplicates.map(async (dup) => {
          const contacts = await prisma.contact.findMany({
            where: {
              email: dup.email,
              createdAt: {
                gte: startDate,
                lte: endDate,
              },
            },
            select: { id: true },
            orderBy: { createdAt: 'asc' },
          });

          return {
            email: dup.email,
            count: Number(dup.count),
            contactIds: contacts.map((c) => c.id),
          };
        })
      );

      logger.info({
        duplicateCount: results.length,
      }, 'Found duplicates in date range');

      return results;
    } catch (error) {
      logger.error({
        startDate,
        endDate,
        error,
      }, 'Error finding duplicates in range');
      throw error;
    }
  }

  /**
   * Normalize email for comparison
   */
  public normalizeEmail(email: string): string {
    return email.toLowerCase().trim();
  }
}

// Export singleton instance
export const deduplicationService = new DeduplicationService();


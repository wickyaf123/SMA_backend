import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { ContactStatus, Prisma } from '@prisma/client';
import { leadProcessingQueue } from '../../jobs/queues';
import { deduplicationService } from '../lead/deduplication.service';

/**
 * Paginated response
 */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Search filters
 */
export interface ContactSearchFilters {
  search?: string;
  status?: ContactStatus[];
  emailValidationStatus?: string[];
  phoneValidationStatus?: string[];
  tags?: string[];
  companyId?: string;
  hasReplied?: boolean;
  createdFrom?: Date;
  createdTo?: Date;
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

/**
 * Contact Service
 * Handles contact CRUD operations and search
 */
export class ContactService {
  /**
   * Create a new contact with background validation
   * 
   * Flow:
   * 1. Check for duplicates (fast, synchronous)
   * 2. Save contact immediately with status NEW, validation PENDING
   * 3. Queue background job for email/phone validation
   * 4. Create activity log
   * 5. Return contact with validation job ID for tracking
   */
  public async createContact(data: any, userId?: string): Promise<any> {
    try {
      logger.info({ email: data.email, userId }, 'Creating contact with background validation');

      // 1. Quick duplicate check (synchronous)
      if (data.email) {
        const dupCheck = await deduplicationService.checkDuplicate(data.email);
        if (dupCheck.isDuplicate) {
          throw new Error(`Contact with email ${data.email} already exists`);
        }
      }

      // 2. Build fullName if not provided
      const fullName = data.fullName ||
        [data.firstName, data.lastName].filter(Boolean).join(' ') ||
        null;

      // 3. Create contact immediately with PENDING validation status
      const contact = await prisma.contact.create({
        data: {
          email: data.email,
          firstName: data.firstName,
          lastName: data.lastName,
          fullName,
          title: data.title,
          phone: data.phone,
          phoneFormatted: data.phone,
          linkedinUrl: data.linkedinUrl,
          city: data.city,
          state: data.state,
          country: data.country,
          companyId: data.companyId,
          status: ContactStatus.NEW,
          emailValidationStatus: data.email ? 'PENDING' : 'PENDING',
          phoneValidationStatus: data.phone ? 'PENDING' : 'PENDING',
          source: 'manual',
          tags: data.tags || [],
          customFields: data.customFields || {},
          ...(userId && { userId }),
        },
        include: {
          company: true,
        },
      });

      logger.info({
        contactId: contact.id,
        email: contact.email,
      }, 'Contact created, queuing validation job');

      // 4. Queue background validation job
      let validationJobId: string | null = null;
      if (data.email || data.phone) {
        const job = await leadProcessingQueue.add(
          'validate-manual-contact',
          {
            type: 'full-pipeline',
            contactId: contact.id,
            options: {
              validateEmail: !!data.email,
              validatePhone: !!data.phone,
              enrichWithClay: true,
              checkDuplicates: false, // Already checked above
            },
          },
          {
            priority: 1, // High priority for user-initiated actions
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          }
        );
        validationJobId = job.id || null;

        logger.info({
          contactId: contact.id,
          jobId: validationJobId,
        }, 'Validation job queued');
      }

      // 5. Create activity log
      await prisma.activityLog.create({
        data: {
          contactId: contact.id,
          action: 'CONTACT_CREATED',
          description: 'Contact added manually - validation in progress',
          actorType: 'USER',
          metadata: {
            source: 'manual',
            validationJobId,
            hasEmail: !!data.email,
            hasPhone: !!data.phone,
          },
          ...(userId && { userId }),
        },
      });

      // Return contact with validation job info
      return {
        ...contact,
        _validationJobId: validationJobId,
        _validationStatus: 'processing',
      };
    } catch (error: any) {
      if (error.code === 'P2002' && error.meta?.target?.includes('email')) {
        throw new Error(`Contact with email ${data.email} already exists`);
      }
      logger.error({
        email: data.email,
        error,
      }, 'Failed to create contact');
      throw error;
    }
  }

  /**
   * Get contact by ID
   */
  public async getContactById(id: string, userId?: string): Promise<any> {
    try {
      const contact = await prisma.contact.findUnique({
        where: { id },
        include: {
          company: true,
          sequenceEnrollments: {
            include: {
              sequence: true,
            },
          },
        },
      });

      if (!contact || (userId && contact.userId && contact.userId !== userId)) {
        throw new Error(`Contact ${id} not found`);
      }

      return contact;
    } catch (error) {
      logger.error({
        contactId: id,
        error,
      }, 'Failed to get contact');
      throw error;
    }
  }

  /**
   * Update contact
   */
  public async updateContact(id: string, data: any, userId?: string): Promise<any> {
    try {
      logger.info({ contactId: id, userId }, 'Updating contact');

      const where: any = { id };
      if (userId) where.userId = userId;

      const contact = await prisma.contact.update({
        where,
        data,
        include: {
          company: true,
        },
      });

      logger.info({
        contactId: id,
        email: contact.email,
      }, 'Contact updated');

      return contact;
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new Error(`Contact ${id} not found`);
      }
      logger.error({
        contactId: id,
        error,
      }, 'Failed to update contact');
      throw error;
    }
  }

  /**
   * Delete contact
   */
  public async deleteContact(id: string, userId?: string): Promise<void> {
    try {
      logger.info({ contactId: id, userId }, 'Deleting contact');

      const where: any = { id };
      if (userId) where.userId = userId;

      await prisma.contact.delete({
        where,
      });

      logger.info({ contactId: id }, 'Contact deleted');
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new Error(`Contact ${id} not found`);
      }
      logger.error({
        contactId: id,
        error,
      }, 'Failed to delete contact');
      throw error;
    }
  }

  /**
   * Search and filter contacts with pagination
   */
  public async searchContacts(
    filters: ContactSearchFilters,
    userId?: string
  ): Promise<PaginatedResponse<any>> {
    try {
      const {
        search,
        status,
        emailValidationStatus,
        phoneValidationStatus,
        tags,
        companyId,
        hasReplied,
        createdFrom,
        createdTo,
        page = 1,
        limit = 50,
        sort = 'createdAt',
        order = 'desc',
      } = filters;

      // Build where clause
      const where: Prisma.ContactWhereInput = {};

      // Multi-tenant data isolation
      if (userId) {
        where.userId = userId;
      }

      // Search by email, name, or company name
      if (search) {
        where.OR = [
          { email: { contains: search, mode: 'insensitive' } },
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { fullName: { contains: search, mode: 'insensitive' } },
          { company: { name: { contains: search, mode: 'insensitive' } } },
        ];
      }

      // Status filter
      if (status && status.length > 0) {
        where.status = { in: status };
      }

      // Email validation status
      if (emailValidationStatus && emailValidationStatus.length > 0) {
        where.emailValidationStatus = { in: emailValidationStatus as any };
      }

      // Phone validation status
      if (phoneValidationStatus && phoneValidationStatus.length > 0) {
        where.phoneValidationStatus = { in: phoneValidationStatus as any };
      }

      // Tags filter
      if (tags && tags.length > 0) {
        where.tags = { hasSome: tags };
      }

      // Company filter
      if (companyId) {
        where.companyId = companyId;
      }

      // Has replied filter
      if (hasReplied !== undefined) {
        where.hasReplied = hasReplied;
      }

      // Date range filter
      if (createdFrom || createdTo) {
        where.createdAt = {};
        if (createdFrom) {
          where.createdAt.gte = createdFrom;
        }
        if (createdTo) {
          where.createdAt.lte = createdTo;
        }
      }

      // Get total count
      const total = await prisma.contact.count({ where });

      // Calculate pagination
      const totalPages = Math.ceil(total / limit);
      const skip = (page - 1) * limit;

      // Get contacts
      const contacts = await prisma.contact.findMany({
        where,
        include: {
          company: true,
          campaignEnrollments: {
            include: {
              campaign: {
                select: {
                  id: true,
                  name: true,
                  channel: true,
                  status: true,
                },
              },
            },
            orderBy: {
              enrolledAt: 'desc',
            },
          },
          _count: {
            select: {
              replies: true,
            },
          },
        },
        orderBy: {
          [sort]: order,
        },
        skip,
        take: limit,
      });

      logger.info({
        filters,
        total,
        returned: contacts.length,
      }, 'Contact search completed');

      return {
        data: contacts,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      logger.error({
        filters,
        error,
      }, 'Contact search failed');
      throw error;
    }
  }

  /**
   * Get contacts by IDs
   */
  public async getContactsByIds(ids: string[], userId?: string): Promise<any[]> {
    try {
      const where: any = { id: { in: ids } };
      if (userId) where.userId = userId;

      const contacts = await prisma.contact.findMany({
        where,
        include: {
          company: true,
        },
      });

      return contacts;
    } catch (error) {
      logger.error({
        contactIds: ids,
        error,
      }, 'Failed to get contacts by IDs');
      throw error;
    }
  }

  /**
   * Get contact statistics
   */
  public async getStatistics(userId?: string): Promise<any> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Build optional userId filter for raw queries
      const userFilter = userId
        ? Prisma.sql`AND "userId" = ${userId}`
        : Prisma.empty;

      const counts = await prisma.$queryRaw<Array<{
        total: bigint;
        replied: bigint;
        imported_today: bigint;
      }>>`
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (WHERE "hasReplied" = true)::bigint AS replied,
          COUNT(*) FILTER (WHERE "createdAt" >= ${today})::bigint AS imported_today
        FROM "Contact"
        WHERE 1=1 ${userFilter}
      `;

      const byStatusRows = await prisma.$queryRaw<Array<{ status: string; cnt: bigint }>>`
        SELECT status::text, COUNT(*)::bigint AS cnt
        FROM "Contact"
        WHERE 1=1 ${userFilter}
        GROUP BY status
      `;

      const byEmailRows = await prisma.$queryRaw<Array<{ status: string; cnt: bigint }>>`
        SELECT "emailValidationStatus" AS status, COUNT(*)::bigint AS cnt
        FROM "Contact"
        WHERE 1=1 ${userFilter}
        GROUP BY "emailValidationStatus"
      `;

      const c = counts[0];
      const total = Number(c.total);
      const replied = Number(c.replied);

      const statusCounts: Record<string, number> = {};
      byStatusRows.forEach((r) => { statusCounts[r.status] = Number(r.cnt); });

      const emailValidationCounts: Record<string, number> = {};
      byEmailRows.forEach((r) => { emailValidationCounts[r.status] = Number(r.cnt); });

      return {
        total,
        replied,
        importedToday: Number(c.imported_today),
        byStatus: statusCounts,
        byEmailValidation: emailValidationCounts,
        conversionRate: total > 0 ? (replied / total) * 100 : 0,
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get contact statistics');
      throw error;
    }
  }

  /**
   * Get replies for a contact
   */
  public async getContactReplies(contactId: string): Promise<any[]> {
    try {
      // Verify contact exists
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { id: true },
      });

      if (!contact) {
        throw new Error('Contact not found');
      }

      const replies = await prisma.reply.findMany({
        where: { contactId },
        orderBy: { receivedAt: 'desc' },
        select: {
          id: true,
          channel: true,
          content: true,
          subject: true,
          fromAddress: true,
          receivedAt: true,
          messageId: true,
          threadId: true,
        },
      });

      return replies;
    } catch (error) {
      logger.error({ contactId, error }, 'Failed to get contact replies');
      throw error;
    }
  }

  /**
   * Get activity logs for a contact
   */
  public async getContactActivity(contactId: string, limit: number = 50): Promise<any[]> {
    try {
      // Verify contact exists
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: { id: true },
      });

      if (!contact) {
        throw new Error('Contact not found');
      }

      const activity = await prisma.activityLog.findMany({
        where: { contactId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          action: true,
          channel: true,
          description: true,
          metadata: true,
          actorType: true,
          createdAt: true,
        },
      });

      return activity;
    } catch (error) {
      logger.error({ contactId, error }, 'Failed to get contact activity');
      throw error;
    }
  }

  /**
   * Get GHL conversation messages for a contact
   * Fetches live data from GHL API
   */
  public async getContactMessages(contactId: string): Promise<any> {
    try {
      // Get contact with GHL IDs
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: {
          id: true,
          ghlContactId: true,
          ghlConversationId: true,
          email: true,
          phone: true,
          fullName: true,
        },
      });

      if (!contact) {
        throw new Error('Contact not found');
      }

      // If no GHL contact, return empty
      if (!contact.ghlContactId) {
        return {
          synced: false,
          ghlContactId: null,
          messages: [],
          note: 'Contact not synced to GoHighLevel',
        };
      }

      // Import GHL client dynamically to avoid circular deps
      const { ghlClient } = await import('../../integrations/ghl/client');

      try {
        // Fetch conversation messages from GHL
        const messages = await ghlClient.getConversationMessages(contact.ghlContactId);

        return {
          synced: true,
          ghlContactId: contact.ghlContactId,
          ghlConversationId: contact.ghlConversationId,
          messages: messages || [],
        };
      } catch (ghlError: any) {
        logger.warn({ contactId, ghlContactId: contact.ghlContactId, error: ghlError.message }, 
          'Failed to fetch GHL messages (non-critical)');
        
        return {
          synced: true,
          ghlContactId: contact.ghlContactId,
          ghlConversationId: contact.ghlConversationId,
          messages: [],
          error: 'Failed to fetch messages from GoHighLevel',
        };
      }
    } catch (error) {
      logger.error({ contactId, error }, 'Failed to get contact messages');
      throw error;
    }
  }
}

// Export singleton instance
export const contactService = new ContactService();


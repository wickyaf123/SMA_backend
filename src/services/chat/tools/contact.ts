import { ToolDefinition, ToolHandler, ToolRegistry, ToolErrorCode } from './types';
import { prisma } from '../../../config/database';
import { ghlClient } from '../../../integrations/ghl/client';

const definitions: ToolDefinition[] = [
  {
    name: 'list_contacts',
    description:
      'List contacts from the database with optional filters. Returns contractors/leads.',
    input_schema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Search by name, email, or company',
        },
        status: {
          type: 'string',
          description:
            'Filter by status (NEW, VALIDATED, IN_SEQUENCE, REPLIED, etc.)',
        },
        city: { type: 'string', description: 'Filter by city' },
        state: { type: 'string', description: 'Filter by state' },
        hasReplied: {
          type: 'boolean',
          description: 'Filter by whether contact has replied',
        },
        hasEmail: {
          type: 'boolean',
          description: 'Filter by whether contact has an email address',
        },
        hasPhone: {
          type: 'boolean',
          description: 'Filter by whether contact has a phone number',
        },
        emailValidationStatus: {
          type: 'string',
          description: 'Filter by email validation status (PENDING, VALID, INVALID, CATCH_ALL, UNKNOWN, DISPOSABLE)',
        },
        phoneValidationStatus: {
          type: 'string',
          description: 'Filter by phone validation status (PENDING, VALID_MOBILE, VALID_LANDLINE, INVALID, UNKNOWN)',
        },
        filter: {
          type: 'string',
          enum: ['missing_email', 'invalid_phone', 'duplicates', 'no_engagement'],
          description: 'Apply a predefined data quality filter. missing_email: contacts with no/empty email. invalid_phone: contacts with no/empty/invalid phone. duplicates: contacts sharing the same email. no_engagement: contacts enrolled 14+ days with zero replies.',
        },
        page: { type: 'number', description: 'Page number (default 1)' },
        limit: {
          type: 'number',
          description: 'Results per page (default 20)',
        },
      },
    },
  },
  {
    name: 'get_contact',
    description: 'Get detailed information about a specific contact by ID',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
      },
      required: ['contactId'],
    },
  },
  {
    name: 'create_contact',
    description:
      'Create a new contact/lead in the database with the provided information.',
    input_schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string', description: 'First name of the contact' },
        lastName: { type: 'string', description: 'Last name of the contact' },
        email: { type: 'string', description: 'Email address' },
        phone: { type: 'string', description: 'Phone number' },
        city: { type: 'string', description: 'City' },
        state: { type: 'string', description: 'State' },
        source: { type: 'string', description: 'Lead source (e.g., manual, csv, apollo)' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to assign to the contact',
        },
      },
      required: ['firstName', 'lastName'],
    },
  },
  {
    name: 'update_contact',
    description:
      'Update an existing contact by ID. Only provided fields will be updated.',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID to update' },
        firstName: { type: 'string', description: 'First name' },
        lastName: { type: 'string', description: 'Last name' },
        email: { type: 'string', description: 'Email address' },
        phone: { type: 'string', description: 'Phone number' },
        city: { type: 'string', description: 'City' },
        state: { type: 'string', description: 'State' },
        title: { type: 'string', description: 'Job title' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to assign',
        },
        status: {
          type: 'string',
          description: 'Contact status (NEW, VALIDATED, IN_SEQUENCE, REPLIED, etc.)',
        },
      },
      required: ['contactId'],
    },
  },
  {
    name: 'delete_contact',
    description: 'Delete a contact from the database by ID.',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID to delete' },
      },
      required: ['contactId'],
    },
  },
  {
    name: 'get_contact_stats',
    description:
      'Get aggregate statistics about contacts (total, by status, validation rates, etc.)',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_contact_replies',
    description:
      'Get replies received from a contact, or all recent replies when contactId is omitted.',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID. When omitted, returns all recent replies across all contacts.' },
        limit: { type: 'number', description: 'Max replies to return (default 20)' },
      },
    },
  },
  {
    name: 'get_contact_activity',
    description:
      'Get activity log entries for a specific contact showing all interactions and events.',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
        limit: { type: 'number', description: 'Max activities to return (default 50)' },
      },
      required: ['contactId'],
    },
  },
  {
    name: 'add_contact_label',
    description: 'Add a structured label to a contact',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
        name: { type: 'string', description: 'Label name (e.g., "Hot", "Warm", "Cold", "Customer", "DNC")' },
        color: { type: 'string', description: 'Optional hex or tailwind color name (e.g., "#22c55e")' },
      },
      required: ['contactId', 'name'],
    },
  },
  {
    name: 'remove_contact_label',
    description: 'Remove a label from a contact',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
        name: { type: 'string', description: 'Label name to remove' },
      },
      required: ['contactId', 'name'],
    },
  },
  {
    name: 'list_contact_labels',
    description: 'List all labels on a contact',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
      },
      required: ['contactId'],
    },
  },
  {
    name: 'add_contact_note',
    description: 'Add a note to a contact',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
        note: { type: 'string', description: 'The note content to add' },
      },
      required: ['contactId', 'note'],
    },
  },
  {
    name: 'add_contact_tag',
    description: 'Add a tag to a contact',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
        tag: { type: 'string', description: 'The tag to add' },
      },
      required: ['contactId', 'tag'],
    },
  },
  {
    name: 'remove_contact_tag',
    description: 'Remove a tag from a contact',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
        tag: { type: 'string', description: 'The tag to remove' },
      },
      required: ['contactId', 'tag'],
    },
  },
  {
    name: 'batch_create_contacts',
    description: 'Create multiple contacts at once. Accepts an array of contact objects (max 100). Returns created count, skipped (duplicate email), and errors.',
    input_schema: {
      type: 'object',
      properties: {
        contacts: {
          type: 'array',
          description: 'Array of contact objects to create',
          items: {
            type: 'object',
            properties: {
              email: { type: 'string', description: 'Contact email (required)' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              phone: { type: 'string' },
              company: { type: 'string' },
              title: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['email'],
          },
        },
      },
      required: ['contacts'],
    },
  },
  {
    name: 'get_contractor_brief',
    description: 'Get a comprehensive pre-call brief for a contractor',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
      },
      required: ['contactId'],
    },
  },
  {
    name: 'mark_as_customer',
    description: 'Mark a contact as a customer - stops all enrollments and adds Customer label',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
      },
      required: ['contactId'],
    },
  },
  {
    name: 'lookup_homeowner_by_address',
    description: 'Look up homeowners by address',
    input_schema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Street address to search for' },
        city: { type: 'string', description: 'City to narrow search' },
        state: { type: 'string', description: 'State to narrow search' },
      },
      required: ['address'],
    },
  },
];

const handlers: Record<string, ToolHandler> = {
  list_contacts: async (input) => {
    const page = input.page || 1;
    const limit = input.limit || 20;
    const skip = (page - 1) * limit;
    const where: Record<string, any> = {};

    const andConditions: Record<string, any>[] = [];

    if (input.search) {
      andConditions.push({
        OR: [
          { firstName: { contains: input.search, mode: 'insensitive' } },
          { lastName: { contains: input.search, mode: 'insensitive' } },
          { email: { contains: input.search, mode: 'insensitive' } },
          {
            company: {
              name: { contains: input.search, mode: 'insensitive' },
            },
          },
        ],
      });
    }
    if (input.status) where.status = input.status;
    if (input.city) where.city = input.city;
    if (input.state) where.state = input.state;
    if (input.hasReplied !== undefined) where.hasReplied = input.hasReplied;
    if (input.hasEmail === true) where.email = { not: null };
    if (input.hasEmail === false) where.email = null;
    if (input.hasPhone === true) where.phone = { not: null };
    if (input.hasPhone === false) where.phone = null;
    if (input.emailValidationStatus) where.emailValidationStatus = input.emailValidationStatus;
    if (input.phoneValidationStatus) where.phoneValidationStatus = input.phoneValidationStatus;

    // Data quality filter handling — uses andConditions to avoid overwriting search
    if (input.filter === 'missing_email') {
      andConditions.push({
        OR: [
          { email: null },
          { email: '' },
        ],
      });
    } else if (input.filter === 'invalid_phone') {
      andConditions.push({
        OR: [
          { phone: null },
          { phone: '' },
          { phoneValidationStatus: 'INVALID' },
        ],
      });
    } else if (input.filter === 'duplicates') {
      const duplicateEmails = await prisma.$queryRaw<{ email: string }[]>`
        SELECT email FROM "Contact"
        WHERE email IS NOT NULL AND email != ''
        GROUP BY email
        HAVING COUNT(*) > 1
      `;

      const emails = duplicateEmails.map(d => d.email);

      if (emails.length === 0) {
        return {
          success: true,
          data: {
            contacts: [],
            pagination: { page: 1, limit, total: 0, totalPages: 0 },
            duplicateGroups: 0,
          },
        };
      }

      where.email = { in: emails };
    } else if (input.filter === 'no_engagement') {
      const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      const noEngagementIds = await prisma.$queryRaw<{ id: string }[]>`
        SELECT c.id FROM "Contact" c
        INNER JOIN "CampaignEnrollment" ce ON ce."contactId" = c.id
        LEFT JOIN "Reply" r ON r."contactId" = c.id
        WHERE ce."enrolledAt" <= ${fourteenDaysAgo}
          AND r.id IS NULL
        GROUP BY c.id
      `;

      const ids = noEngagementIds.map(r => r.id);

      if (ids.length === 0) {
        return {
          success: true,
          data: {
            contacts: [],
            pagination: { page: 1, limit, total: 0, totalPages: 0 },
          },
        };
      }

      where.id = { in: ids };
    }

    if (andConditions.length > 0) {
      where.AND = andConditions;
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: { company: true },
      }),
      prisma.contact.count({ where }),
    ]);

    return {
      success: true,
      data: {
        contacts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    };
  },

  get_contact: async (input) => {
    const contact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      include: {
        company: true,
        activityLogs: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
    if (!contact) {
      return {
        success: false,
        error: `Contact not found with ID: ${input.contactId}`,
        code: 'PRECONDITION' as ToolErrorCode,
      };
    }
    return { success: true, data: contact };
  },

  create_contact: async (input) => {
    const contactData: Record<string, any> = {
      firstName: input.firstName,
      lastName: input.lastName,
      fullName: `${input.firstName} ${input.lastName}`.trim(),
      status: 'NEW',
    };
    if (input.email) contactData.email = input.email;
    if (input.phone) contactData.phone = input.phone;
    if (input.city) contactData.city = input.city;
    if (input.state) contactData.state = input.state;
    if (input.source) contactData.source = input.source;
    if (input.tags) contactData.tags = input.tags;

    const newContact = await prisma.contact.create({
      data: contactData,
    });

    // Log the creation
    await prisma.activityLog.create({
      data: {
        contactId: newContact.id,
        action: 'CONTACT_CREATED',
        description: `Contact ${newContact.fullName} created via Jerry AI`,
        actorType: 'ai',
      },
    });

    return {
      success: true,
      data: {
        contact: newContact,
        message: `Contact ${newContact.fullName} created successfully.`,
      },
    };
  },

  update_contact: async (input) => {
    const existing = await prisma.contact.findUnique({
      where: { id: input.contactId },
    });
    if (!existing) {
      return { success: false, error: `Contact not found with ID: ${input.contactId}`, code: 'PRECONDITION' as ToolErrorCode };
    }

    const updateFields: Record<string, any> = {};
    const allowedContactFields = [
      'firstName', 'lastName', 'email', 'phone', 'city', 'state', 'title', 'tags', 'status',
    ];
    for (const field of allowedContactFields) {
      if (input[field] !== undefined) {
        updateFields[field] = input[field];
      }
    }
    // Update fullName if first or last name changed
    if (input.firstName || input.lastName) {
      updateFields.fullName = `${input.firstName ?? existing.firstName ?? ''} ${input.lastName ?? existing.lastName ?? ''}`.trim();
    }

    if (Object.keys(updateFields).length === 0) {
      return { success: false, error: 'No valid fields provided to update', code: 'VALIDATION' as ToolErrorCode };
    }

    const updatedContact = await prisma.contact.update({
      where: { id: input.contactId },
      data: updateFields,
    });

    await prisma.activityLog.create({
      data: {
        contactId: input.contactId,
        action: 'CONTACT_UPDATED',
        description: `Contact updated fields: ${Object.keys(updateFields).join(', ')}`,
        actorType: 'ai',
        metadata: updateFields,
      },
    });

    return {
      success: true,
      data: {
        contact: updatedContact,
        message: `Contact updated: ${Object.keys(updateFields).join(', ')}`,
      },
    };
  },

  delete_contact: async (input) => {
    const toDelete = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: { id: true, fullName: true, email: true },
    });
    if (!toDelete) {
      return { success: false, error: `Contact not found with ID: ${input.contactId}`, code: 'PRECONDITION' as ToolErrorCode };
    }

    await prisma.contact.delete({ where: { id: input.contactId } });

    return {
      success: true,
      data: {
        message: `Contact ${toDelete.fullName || toDelete.email || input.contactId} deleted successfully.`,
      },
    };
  },

  get_contact_stats: async () => {
    const [total, byStatus, repliedCount, validatedCount] =
      await Promise.all([
        prisma.contact.count(),
        prisma.contact.groupBy({
          by: ['status'],
          _count: { status: true },
        }),
        prisma.contact.count({ where: { hasReplied: true } }),
        prisma.contact.count({
          where: { status: 'VALIDATED' },
        }),
      ]);

    return {
      success: true,
      data: {
        total,
        byStatus: byStatus.map((s) => ({
          status: s.status,
          count: s._count.status,
        })),
        repliedCount,
        validatedCount,
        replyRate: total > 0 ? ((repliedCount / total) * 100).toFixed(1) + '%' : '0%',
        validationRate:
          total > 0 ? ((validatedCount / total) * 100).toFixed(1) + '%' : '0%',
      },
    };
  },

  get_contact_replies: async (input) => {
    const replyWhere: Record<string, any> = {};
    if (input.contactId) {
      replyWhere.contactId = input.contactId;
    }

    const replies = await prisma.reply.findMany({
      where: replyWhere,
      orderBy: { receivedAt: 'desc' },
      take: input.limit || 20,
    });

    return {
      success: true,
      data: {
        replies,
        total: replies.length,
        ...(input.contactId ? { contactId: input.contactId } : {}),
      },
    };
  },

  get_contact_activity: async (input) => {
    const contactActivities = await prisma.activityLog.findMany({
      where: { contactId: input.contactId },
      orderBy: { createdAt: 'desc' },
      take: input.limit || 50,
    });

    return {
      success: true,
      data: {
        activities: contactActivities,
        total: contactActivities.length,
        contactId: input.contactId,
      },
    };
  },

  add_contact_label: async (input) => {
    try {
      const label = await prisma.contactLabel.create({
        data: {
          contactId: input.contactId,
          name: input.name,
          ...(input.color && { color: input.color }),
        },
      });

      return {
        success: true,
        data: {
          label,
          message: `Label "${input.name}" added to contact ${input.contactId}.`,
        },
      };
    } catch (err: any) {
      // Handle unique constraint violation (label already exists)
      if (err.code === 'P2002') {
        return {
          success: true,
          data: {
            message: `Label "${input.name}" already exists on contact ${input.contactId}.`,
            alreadyExists: true,
          },
        };
      }
      throw err;
    }
  },

  remove_contact_label: async (input) => {
    await prisma.contactLabel.deleteMany({
      where: {
        contactId: input.contactId,
        name: input.name,
      },
    });

    return {
      success: true,
      data: {
        message: `Label "${input.name}" removed from contact ${input.contactId}.`,
      },
    };
  },

  list_contact_labels: async (input) => {
    const labels = await prisma.contactLabel.findMany({
      where: { contactId: input.contactId },
    });

    return {
      success: true,
      data: {
        labels,
        total: labels.length,
        contactId: input.contactId,
      },
    };
  },

  add_contact_note: async (input) => {
    const noteContact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: { id: true, ghlContactId: true, fullName: true },
    });

    if (!noteContact) {
      return { success: false, error: `Contact not found with ID: ${input.contactId}`, code: 'PRECONDITION' as ToolErrorCode };
    }

    // Sync note to GHL if contact is linked and GHL is configured
    if (noteContact.ghlContactId && ghlClient.isConfigured()) {
      try {
        await ghlClient.addContactNote(noteContact.ghlContactId, input.note);
      } catch (ghlErr: any) {
        // Import logger inline to avoid unused import in most paths
        const { logger } = await import('../../../utils/logger');
        logger.warn(
          { contactId: input.contactId, ghlContactId: noteContact.ghlContactId, error: ghlErr.message },
          'Failed to sync note to GHL, continuing with local log'
        );
      }
    }

    // Log to ActivityLog
    await prisma.activityLog.create({
      data: {
        contactId: input.contactId,
        action: 'NOTE_ADDED',
        description: input.note,
        actorType: 'ai',
      },
    });

    return {
      success: true,
      data: {
        message: `Note added to contact ${noteContact.fullName || input.contactId}.${noteContact.ghlContactId ? ' Also synced to GHL.' : ''}`,
        syncedToGhl: !!noteContact.ghlContactId,
      },
    };
  },

  add_contact_tag: async (input) => {
    const tagContact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: { id: true, tags: true },
    });

    if (!tagContact) {
      return { success: false, error: `Contact not found with ID: ${input.contactId}`, code: 'PRECONDITION' as ToolErrorCode };
    }

    // Check if tag already exists to avoid duplicates
    if (tagContact.tags.includes(input.tag)) {
      return {
        success: true,
        data: {
          message: `Tag "${input.tag}" already exists on contact ${input.contactId}.`,
          alreadyExists: true,
        },
      };
    }

    const tagUpdated = await prisma.contact.update({
      where: { id: input.contactId },
      data: { tags: { push: input.tag } },
    });

    return {
      success: true,
      data: {
        tags: tagUpdated.tags,
        message: `Tag "${input.tag}" added to contact ${input.contactId}.`,
      },
    };
  },

  remove_contact_tag: async (input) => {
    const removeTagContact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: { id: true, tags: true },
    });

    if (!removeTagContact) {
      return { success: false, error: `Contact not found with ID: ${input.contactId}`, code: 'PRECONDITION' as ToolErrorCode };
    }

    const filteredTags = removeTagContact.tags.filter((t) => t !== input.tag);

    const tagRemovedContact = await prisma.contact.update({
      where: { id: input.contactId },
      data: { tags: filteredTags },
    });

    return {
      success: true,
      data: {
        tags: tagRemovedContact.tags,
        message: `Tag "${input.tag}" removed from contact ${input.contactId}.`,
      },
    };
  },

  batch_create_contacts: async (input) => {
    const { contacts } = input;
    if (!Array.isArray(contacts) || contacts.length === 0) {
      return { success: false, error: 'contacts must be a non-empty array', code: 'VALIDATION' as ToolErrorCode };
    }
    if (contacts.length > 100) {
      return { success: false, error: 'Maximum 100 contacts per batch', code: 'VALIDATION' as ToolErrorCode };
    }

    const validContacts = contacts.filter((c: any) => c.email);
    const missingEmail = contacts.length - validContacts.length;

    const data = validContacts.map((contact: any) => ({
      email: contact.email.toLowerCase().trim(),
      firstName: contact.firstName || null,
      lastName: contact.lastName || null,
      fullName: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null,
      phone: contact.phone || null,
      title: contact.title || null,
      city: contact.city || null,
      state: contact.state || null,
      tags: contact.tags || [],
      source: 'batch_import',
    }));

    const result = await prisma.contact.createMany({
      data,
      skipDuplicates: true,
    });

    return {
      success: true,
      data: {
        total: contacts.length,
        created: result.count,
        skipped: validContacts.length - result.count,
        errors: missingEmail > 0 ? [`${missingEmail} contact(s) skipped due to missing email`] : undefined,
      },
    };
  },

  get_contractor_brief: async (input) => {
    const contractor = await prisma.contact.findUnique({
      where: { id: input.contactId },
      include: {
        activityLogs: {
          take: 10,
          orderBy: { createdAt: 'desc' },
        },
        replies: true,
        campaignEnrollments: {
          include: { campaign: true },
        },
        labels: true,
      },
    });

    if (!contractor) {
      return { success: false, error: `Contact not found with ID: ${input.contactId}`, code: 'PRECONDITION' as ToolErrorCode };
    }

    return {
      success: true,
      data: {
        contact: {
          id: contractor.id,
          fullName: contractor.fullName,
          firstName: contractor.firstName,
          lastName: contractor.lastName,
          email: contractor.email,
          phone: contractor.phone,
          phoneFormatted: contractor.phoneFormatted,
          title: contractor.title,
          city: contractor.city,
          state: contractor.state,
          status: contractor.status,
          tags: contractor.tags,
          source: contractor.source,
          hasReplied: contractor.hasReplied,
          repliedAt: contractor.repliedAt,
          lastContactedAt: contractor.lastContactedAt,
          ghlContactId: contractor.ghlContactId,
          permitType: contractor.permitType,
          permitCity: contractor.permitCity,
          permitDescription: contractor.permitDescription,
          permitDescriptionDerived: contractor.permitDescriptionDerived,
          licenseNumber: contractor.licenseNumber,
          avgJobValue: contractor.avgJobValue,
          totalJobValue: contractor.totalJobValue,
          permitCount: contractor.permitCount,
          revenue: contractor.revenue,
          employeeCount: contractor.employeeCount,
          website: contractor.website,
          rating: contractor.rating,
          reviewCount: contractor.reviewCount,
          seniorityLevel: contractor.seniorityLevel,
          department: contractor.department,
          createdAt: contractor.createdAt,
          updatedAt: contractor.updatedAt,
        },
        labels: contractor.labels,
        recentActivity: contractor.activityLogs,
        replies: contractor.replies,
        campaignEnrollments: contractor.campaignEnrollments.map((e) => ({
          id: e.id,
          campaignId: e.campaignId,
          campaignName: e.campaign.name,
          status: e.status,
          enrolledAt: e.enrolledAt,
          stoppedAt: e.stoppedAt,
          stoppedReason: e.stoppedReason,
        })),
      },
    };
  },

  mark_as_customer: async (input) => {
    const custContact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: { id: true, fullName: true, status: true },
    });

    if (!custContact) {
      return { success: false, error: `Contact not found with ID: ${input.contactId}`, code: 'PRECONDITION' as ToolErrorCode };
    }

    // 1. Update contact status to CUSTOMER
    await prisma.contact.update({
      where: { id: input.contactId },
      data: { status: 'CUSTOMER' },
    });

    // 2. Stop all active campaign enrollments
    const stoppedEnrollments = await prisma.campaignEnrollment.updateMany({
      where: { contactId: input.contactId, status: 'ENROLLED' },
      data: { status: 'STOPPED', stoppedAt: new Date(), stoppedReason: 'marked_as_customer' },
    });

    // 3. Add Customer label (catch if already exists)
    try {
      await prisma.contactLabel.create({
        data: {
          contactId: input.contactId,
          name: 'Customer',
          color: '#22c55e',
        },
      });
    } catch (labelErr: any) {
      if (labelErr.code !== 'P2002') throw labelErr;
      // Label already exists, that's fine
    }

    // 4. Log to ActivityLog
    await prisma.activityLog.create({
      data: {
        contactId: input.contactId,
        action: 'MARKED_AS_CUSTOMER',
        description: 'Marked as customer — removed from all active sequences',
        actorType: 'ai',
      },
    });

    return {
      success: true,
      data: {
        contactId: input.contactId,
        contactName: custContact.fullName,
        previousStatus: custContact.status,
        newStatus: 'CUSTOMER',
        enrollmentsStopped: stoppedEnrollments.count,
        message: `${custContact.fullName || input.contactId} marked as customer. ${stoppedEnrollments.count} active enrollment(s) stopped, Customer label added.`,
      },
    };
  },

  lookup_homeowner_by_address: async (input) => {
    const addressWhere: Record<string, any> = {
      street: { contains: input.address, mode: 'insensitive' },
    };
    if (input.city) {
      addressWhere.city = { contains: input.city, mode: 'insensitive' };
    }
    if (input.state) {
      addressWhere.state = { contains: input.state, mode: 'insensitive' };
    }

    const homeowners = await prisma.homeowner.findMany({
      where: addressWhere,
      include: { connections: true },
      take: 20,
    });

    return {
      success: true,
      data: {
        homeowners,
        total: homeowners.length,
        message: homeowners.length > 0
          ? `Found ${homeowners.length} homeowner(s) matching "${input.address}".`
          : `No homeowners found matching "${input.address}".`,
      },
    };
  },
};

export function registerTools(registry: ToolRegistry): void {
  for (const def of definitions) {
    registry.register(def, handlers[def.name]);
  }
}

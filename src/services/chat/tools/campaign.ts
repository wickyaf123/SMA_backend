import { ToolDefinition, ToolHandler, ToolRegistry, ToolErrorCode } from './types';
import { prisma } from '../../../config/database';
import { campaignService } from '../../campaign/campaign.service';

const definitions: ToolDefinition[] = [
  {
    name: 'list_campaigns',
    description:
      'List email/outreach campaigns with their status and stats',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description:
            'Filter by status (DRAFT, ACTIVE, PAUSED, COMPLETED)',
        },
        channel: {
          type: 'string',
          description: 'Filter by channel (EMAIL, SMS, LINKEDIN)',
        },
        limit: {
          type: 'number',
          description: 'Number of campaigns to return',
        },
      },
    },
  },
  {
    name: 'get_campaign_analytics',
    description:
      'Get analytics for campaigns. If campaignId is provided, returns stats for that campaign. If omitted, returns aggregate stats across all campaigns.',
    input_schema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', description: 'The campaign ID (optional - omit for aggregate stats)' },
      },
    },
  },
  {
    name: 'enroll_contacts',
    description:
      'Enroll one or more contacts into a campaign. Skips already-enrolled and ineligible contacts.',
    input_schema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', description: 'The campaign ID to enroll contacts in' },
        contactIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of contact IDs to enroll',
        },
      },
      required: ['campaignId', 'contactIds'],
    },
  },
  {
    name: 'stop_enrollment',
    description:
      'Stop a specific contact\'s enrollment in a campaign.',
    input_schema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', description: 'The campaign ID' },
        contactId: { type: 'string', description: 'The contact ID to stop enrollment for' },
        reason: { type: 'string', description: 'Reason for stopping (default: manual_stop)' },
      },
      required: ['campaignId', 'contactId'],
    },
  },
  {
    name: 'get_campaign_enrollments',
    description:
      'Get enrollments for a campaign with optional status filter.',
    input_schema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', description: 'The campaign ID' },
        status: {
          type: 'string',
          description: 'Filter by enrollment status (ENROLLED, SENT, OPENED, CLICKED, REPLIED, BOUNCED, STOPPED, UNSUBSCRIBED)',
        },
        limit: { type: 'number', description: 'Max enrollments to return (default 50)' },
      },
      required: ['campaignId'],
    },
  },
  {
    name: 'sync_campaigns',
    description:
      'Sync campaigns from Instantly. Creates local records for new Instantly campaigns and updates existing ones.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
];

const handlers: Record<string, ToolHandler> = {
  list_campaigns: async (input) => {
    const where: Record<string, any> = {};
    if (input.status) where.status = input.status;
    if (input.channel) where.channel = input.channel;

    const campaigns = await prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: input.limit || 20,
      include: {
        _count: {
          select: { enrollments: true },
        },
      },
    });
    return { success: true, data: campaigns };
  },

  get_campaign_analytics: async (input) => {
    if (input.campaignId) {
      // Single campaign analytics
      const campaign = await prisma.campaign.findUnique({
        where: { id: input.campaignId },
        include: {
          _count: {
            select: { enrollments: true },
          },
        },
      });
      if (!campaign) {
        return {
          success: false,
          error: `Campaign not found with ID: ${input.campaignId}`,
          code: 'PRECONDITION' as ToolErrorCode,
        };
      }

      const enrollmentStats = await prisma.campaignEnrollment.groupBy({
        by: ['status'],
        where: { campaignId: input.campaignId },
        _count: { status: true },
      });

      return {
        success: true,
        data: {
          campaign,
          enrollmentStats: enrollmentStats.map((s: any) => ({
            status: s.status,
            count: s._count.status,
          })),
        },
      };
    } else {
      // Aggregate analytics across all campaigns
      const campaigns = await prisma.campaign.findMany({
        include: {
          _count: { select: { enrollments: true } },
        },
      });

      const enrollmentStats = await prisma.campaignEnrollment.groupBy({
        by: ['status'],
        _count: { status: true },
      });

      const totalEnrolled = campaigns.reduce((sum, c) => sum + c._count.enrollments, 0);

      return {
        success: true,
        data: {
          totalCampaigns: campaigns.length,
          activeCampaigns: campaigns.filter(c => c.status === 'ACTIVE').length,
          totalEnrolled,
          campaigns: campaigns.map(c => ({
            id: c.id,
            name: c.name,
            channel: c.channel,
            status: c.status,
            enrolled: c._count.enrollments,
          })),
          enrollmentStats: enrollmentStats.map((s: any) => ({
            status: s.status,
            count: s._count.status,
          })),
        },
      };
    }
  },

  enroll_contacts: async (input) => {
    // Pre-validate: check campaign exists and is active
    const campaign = await prisma.campaign.findUnique({
      where: { id: input.campaignId },
      select: { status: true, name: true },
    });
    if (!campaign) {
      return { success: false, error: `Campaign not found with ID: ${input.campaignId}`, code: 'PRECONDITION' as ToolErrorCode };
    }
    if (campaign.status === 'DRAFT' || campaign.status === 'COMPLETED') {
      return { success: false, error: `Cannot enroll contacts in campaign "${campaign.name}" -- status is ${campaign.status}. Campaign must be ACTIVE or SCHEDULED.`, code: 'PRECONDITION' as ToolErrorCode };
    }
    const enrollResult = await campaignService.enrollContacts(
      input.campaignId,
      input.contactIds
    );

    return {
      success: true,
      data: {
        enrolled: enrollResult.enrolled,
        skipped: enrollResult.skipped,
        errors: enrollResult.errors,
        message: `Enrolled ${enrollResult.enrolled} contacts, skipped ${enrollResult.skipped}.`,
      },
    };
  },

  stop_enrollment: async (input) => {
    if (!input.campaignId || !input.contactId) {
      return { success: false, error: 'Both campaignId and contactId are required to stop enrollment.', code: 'VALIDATION' as ToolErrorCode };
    }

    // Pre-validate: check enrollment exists and is in ENROLLED status
    const enrollment = await prisma.campaignEnrollment.findFirst({
      where: { campaignId: input.campaignId, contactId: input.contactId },
      select: { id: true, status: true },
    });
    if (!enrollment) {
      return { success: false, error: 'Enrollment not found', code: 'PRECONDITION' as ToolErrorCode };
    }
    if (enrollment.status !== 'ENROLLED') {
      return { success: false, error: `Cannot stop enrollment -- status is ${enrollment.status}`, code: 'PRECONDITION' as ToolErrorCode };
    }

    try {
      await campaignService.stopEnrollment(
        input.campaignId,
        input.contactId,
        input.reason || 'manual_stop'
      );

      return {
        success: true,
        data: {
          message: `Enrollment stopped for contact ${input.contactId} in campaign ${input.campaignId}.`,
        },
      };
    } catch (err: any) {
      return { success: false, error: `Failed to stop enrollment: ${err.message}`, code: 'SERVICE' as ToolErrorCode };
    }
  },

  get_campaign_enrollments: async (input) => {
    const enrollmentResult = await campaignService.getEnrollments(
      input.campaignId,
      {
        status: input.status,
        limit: input.limit || 50,
      }
    );

    return {
      success: true,
      data: {
        enrollments: enrollmentResult.enrollments,
        total: enrollmentResult.total,
        campaignId: input.campaignId,
      },
    };
  },

  sync_campaigns: async () => {
    const syncResult = await campaignService.syncFromInstantly();

    return {
      success: true,
      data: {
        created: syncResult.created,
        updated: syncResult.updated,
        totalCampaigns: syncResult.campaigns.length,
        campaigns: syncResult.campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          status: c.status,
          channel: c.channel,
        })),
        message: `Synced ${syncResult.campaigns.length} campaigns from Instantly (${syncResult.created} new, ${syncResult.updated} updated).`,
      },
    };
  },

};

export function registerTools(registry: ToolRegistry): void {
  for (const def of definitions) {
    registry.register(def, handlers[def.name]);
  }
}

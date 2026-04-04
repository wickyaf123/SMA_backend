import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';
import { getInstantlyClient } from '../../integrations/instantly/client';
import { config } from '../../config';
import type {
  Campaign,
  CampaignEnrollment,
  OutreachChannel,
  CampaignStatus,
  EnrollmentStatus,
} from '@prisma/client';

export interface CreateCampaignData {
  name: string;
  channel: OutreachChannel;
  instantlyCampaignId?: string;
  phantomBusterId?: string;
  googleSheetUrl?: string;
  description?: string;
  settings?: Record<string, any>;
  linkedinEnabled?: boolean; // Day 7: Per-campaign LinkedIn toggle
}

export interface UpdateCampaignData {
  name?: string;
  status?: CampaignStatus;
  instantlyCampaignId?: string;
  phantomBusterId?: string;
  googleSheetUrl?: string;
  description?: string;
  settings?: Record<string, any>;
  linkedinEnabled?: boolean; // Day 7: Per-campaign LinkedIn toggle
}

export interface EnrollmentResult {
  enrolled: number;
  skipped: number;
  errors: string[];
}

export interface CampaignStats {
  enrolled: number;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  stopped: number;
  unsubscribed: number;
}

export class CampaignService {
  /**
   * Create a new campaign
   */
  async createCampaign(data: CreateCampaignData, userId?: string): Promise<Campaign> {
    try {
      logger.info({ name: data.name, channel: data.channel, userId }, 'Creating campaign');

      const campaign = await prisma.campaign.create({
        data: {
          name: data.name,
          channel: data.channel,
          instantlyCampaignId: data.instantlyCampaignId,
          phantomBusterId: data.phantomBusterId,
          googleSheetUrl: data.googleSheetUrl,
          description: data.description,
          settings: data.settings,
          linkedinEnabled: data.linkedinEnabled ?? true, // Default to true
          status: 'DRAFT',
          ...(userId && { userId }),
        },
      });

      logger.info({ campaignId: campaign.id }, 'Campaign created successfully');
      return campaign;
    } catch (error) {
      logger.error({ error, data }, 'Failed to create campaign');
      throw new AppError('Failed to create campaign', 500, 'CAMPAIGN_CREATE_ERROR');
    }
  }

  /**
   * Get campaign by ID
   */
  async getCampaign(campaignId: string, userId?: string): Promise<Campaign | null> {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        enrollments: {
          include: {
            contact: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                status: true,
              },
            },
          },
        },
      },
    });

    if (campaign && userId && campaign.userId && campaign.userId !== userId) {
      return null;
    }

    return campaign;
  }

  /**
   * List campaigns with optional filters
   */
  async listCampaigns(filters?: {
    channel?: OutreachChannel;
    status?: CampaignStatus;
    limit?: number;
    offset?: number;
  }, userId?: string): Promise<{ campaigns: Campaign[]; total: number }> {
    const where: any = {};

    if (userId) {
      where.userId = userId;
    }

    if (filters?.channel) {
      where.channel = filters.channel;
    }

    if (filters?.status) {
      where.status = filters.status;
    }

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: {
            select: { enrollments: true },
          },
        },
      }),
      prisma.campaign.count({ where }),
    ]);

    return { campaigns, total };
  }

  /**
   * Update campaign
   */
  async updateCampaign(
    campaignId: string,
    data: UpdateCampaignData,
    userId?: string
  ): Promise<Campaign> {
    try {
      logger.info({ campaignId, updates: Object.keys(data), userId }, 'Updating campaign');

      const where: any = { id: campaignId };
      if (userId) where.userId = userId;

      const campaign = await prisma.campaign.update({
        where,
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      logger.info({ campaignId }, 'Campaign updated successfully');
      return campaign;
    } catch (error) {
      logger.error({ error, campaignId, data }, 'Failed to update campaign');
      throw new AppError('Failed to update campaign', 500, 'CAMPAIGN_UPDATE_ERROR');
    }
  }

  /**
   * Delete (archive) campaign
   */
  async deleteCampaign(campaignId: string, userId?: string): Promise<void> {
    try {
      logger.info({ campaignId, userId }, 'Archiving campaign');

      const where: any = { id: campaignId };
      if (userId) where.userId = userId;

      await prisma.campaign.update({
        where,
        data: { status: 'ARCHIVED' },
      });

      logger.info({ campaignId }, 'Campaign archived successfully');
    } catch (error) {
      logger.error({ error, campaignId }, 'Failed to archive campaign');
      throw new AppError('Failed to archive campaign', 500, 'CAMPAIGN_DELETE_ERROR');
    }
  }

  /**
   * Enroll contacts in a campaign
   */
  async enrollContacts(
    campaignId: string,
    contactIds: string[]
  ): Promise<EnrollmentResult> {
    const result: EnrollmentResult = {
      enrolled: 0,
      skipped: 0,
      errors: [],
    };

    try {
      logger.info(
        { campaignId, contactCount: contactIds.length },
        'Enrolling contacts in campaign'
      );

      // Verify campaign exists
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign) {
        throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
      }

      if (campaign.status !== 'ACTIVE' && campaign.status !== 'DRAFT') {
        throw new AppError(
          'Cannot enroll contacts in non-active campaign',
          400,
          'CAMPAIGN_NOT_ACTIVE'
        );
      }

      // Get existing enrollments
      const existingEnrollments = await prisma.campaignEnrollment.findMany({
        where: {
          campaignId,
          contactId: { in: contactIds },
        },
        select: { contactId: true },
      });

      const existingContactIds = new Set(
        existingEnrollments.map((e) => e.contactId)
      );

      // Filter out already enrolled contacts
      const newContactIds = contactIds.filter(
        (id) => !existingContactIds.has(id)
      );

      result.skipped = existingContactIds.size;

      if (newContactIds.length === 0) {
        logger.info({ campaignId }, 'No new contacts to enroll');
        return result;
      }

      // Verify contacts exist
      const contacts = await prisma.contact.findMany({
        where: {
          id: { in: newContactIds },
          status: { notIn: ['UNSUBSCRIBED', 'BOUNCED'] },
        },
        select: { id: true },
      });

      const validContactIds = contacts.map((c) => c.id);
      const invalidCount = newContactIds.length - validContactIds.length;

      if (invalidCount > 0) {
        result.errors.push(
          `${invalidCount} contacts not found or ineligible for enrollment`
        );
      }

      // Create enrollments
      if (validContactIds.length > 0) {
        await prisma.campaignEnrollment.createMany({
          data: validContactIds.map((contactId) => ({
            campaignId,
            contactId,
            status: 'ENROLLED' as EnrollmentStatus,
          })),
        });

        result.enrolled = validContactIds.length;
      }

      logger.info(
        {
          campaignId,
          enrolled: result.enrolled,
          skipped: result.skipped,
          errors: result.errors.length,
        },
        'Contact enrollment complete'
      );

      return result;
    } catch (error) {
      logger.error({ error, campaignId, contactIds }, 'Failed to enroll contacts');
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError('Failed to enroll contacts', 500, 'ENROLLMENT_ERROR');
    }
  }

  /**
   * Check if contact is enrolled in campaign
   */
  async isEnrolled(campaignId: string, contactId: string): Promise<boolean> {
    const enrollment = await prisma.campaignEnrollment.findUnique({
      where: {
        campaignId_contactId: {
          campaignId,
          contactId,
        },
      },
    });

    return !!enrollment;
  }

  /**
   * Stop all campaigns for a contact (unified stop)
   */
  async stopAllCampaigns(
    contactId: string,
    reason: string
  ): Promise<number> {
    try {
      logger.info({ contactId, reason }, 'Stopping all campaigns for contact');

      const result = await prisma.campaignEnrollment.updateMany({
        where: {
          contactId,
          status: {
            in: ['ENROLLED', 'SENT', 'OPENED', 'CLICKED'],
          },
        },
        data: {
          status: 'STOPPED',
          stoppedAt: new Date(),
          stoppedReason: reason,
        },
      });

      logger.info(
        { contactId, stoppedCount: result.count },
        'All campaigns stopped for contact'
      );

      return result.count;
    } catch (error) {
      logger.error({ error, contactId, reason }, 'Failed to stop campaigns');
      throw new AppError('Failed to stop campaigns', 500, 'STOP_CAMPAIGNS_ERROR');
    }
  }

  /**
   * Manually stop a specific contact's enrollment
   */
  async stopEnrollment(
    campaignId: string,
    contactId: string,
    reason: string = 'manual_stop'
  ): Promise<void> {
    try {
      logger.info({ campaignId, contactId, reason }, 'Stopping enrollment');

      await prisma.campaignEnrollment.update({
        where: {
          campaignId_contactId: {
            campaignId,
            contactId,
          },
        },
        data: {
          status: 'STOPPED',
          stoppedAt: new Date(),
          stoppedReason: reason,
        },
      });

      logger.info({ campaignId, contactId }, 'Enrollment stopped successfully');
    } catch (error) {
      logger.error(
        { error, campaignId, contactId },
        'Failed to stop enrollment'
      );
      throw new AppError('Failed to stop enrollment', 500, 'STOP_ENROLLMENT_ERROR');
    }
  }

  /**
   * Get campaign statistics
   */
  async getCampaignStats(campaignId: string): Promise<CampaignStats> {
    try {
      const enrollments = await prisma.campaignEnrollment.groupBy({
        by: ['status'],
        where: { campaignId },
        _count: { status: true },
      });

      const stats: CampaignStats = {
        enrolled: 0,
        sent: 0,
        opened: 0,
        clicked: 0,
        replied: 0,
        bounced: 0,
        stopped: 0,
        unsubscribed: 0,
      };

      enrollments.forEach((group) => {
        const status = group.status.toLowerCase() as keyof CampaignStats;
        if (status in stats) {
          stats[status] = group._count.status;
        }
      });

      return stats;
    } catch (error) {
      logger.error({ error, campaignId }, 'Failed to get campaign stats');
      throw new AppError(
        'Failed to get campaign stats',
        500,
        'GET_STATS_ERROR'
      );
    }
  }

  /**
   * Get enrollments for a campaign
   */
  async getEnrollments(
    campaignId: string,
    filters?: {
      status?: EnrollmentStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ enrollments: CampaignEnrollment[]; total: number }> {
    const where: any = { campaignId };

    if (filters?.status) {
      where.status = filters.status;
    }

    const [enrollments, total] = await Promise.all([
      prisma.campaignEnrollment.findMany({
        where,
        take: filters?.limit || 50,
        skip: filters?.offset || 0,
        orderBy: { enrolledAt: 'desc' },
        include: {
          contact: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              phone: true,
              linkedinUrl: true,
              status: true,
            },
          },
        },
      }),
      prisma.campaignEnrollment.count({ where }),
    ]);

    return { enrollments, total };
  }

  /**
   * Sync campaigns from Instantly
   * Creates local Campaign records for any Instantly campaigns that don't exist locally
   */
  async syncFromInstantly(userId?: string): Promise<{ created: number; updated: number; campaigns: Campaign[] }> {
    try {
      logger.info('Starting sync from Instantly');

      const instantlyClient = getInstantlyClient({
        apiKey: config.instantly.apiKey,
        baseUrl: config.instantly.baseUrl,
      });

      // Fetch all campaigns from Instantly
      const instantlyCampaigns = await instantlyClient.listCampaigns();
      
      logger.info({ count: instantlyCampaigns.length }, 'Fetched campaigns from Instantly');

      let created = 0;
      let updated = 0;
      const campaigns: Campaign[] = [];

      for (const ic of instantlyCampaigns) {
        // Check if we already have this campaign
        const existing = await prisma.campaign.findFirst({
          where: { instantlyCampaignId: ic.id },
        });

        if (existing) {
          // Update name and status if changed
          // Instantly status codes: -1 = Paused (but active), 0 = Draft, 1 = Active, 3 = Completed
          const isActive = ic.status === 1 || ic.status === -1 || ic.status === 'active';
          const newStatus = isActive ? 'ACTIVE' : 'DRAFT';
          
          if (existing.name !== ic.name || existing.status !== newStatus) {
            const updatedCampaign = await prisma.campaign.update({
              where: { id: existing.id },
              data: { 
                name: ic.name,
                status: newStatus,
              },
            });
            campaigns.push(updatedCampaign);
            updated++;
            logger.info({ 
              campaignId: existing.id, 
              name: ic.name, 
              oldStatus: existing.status, 
              newStatus 
            }, 'Updated campaign from Instantly');
          } else {
            campaigns.push(existing);
          }
        } else {
          // Create new campaign
          // Instantly status codes: -1 = Paused (but active), 0 = Draft, 1 = Active, 3 = Completed
          const isActive = ic.status === 1 || ic.status === -1 || ic.status === 'active';
          const newCampaign = await prisma.campaign.create({
            data: {
              name: ic.name,
              channel: 'EMAIL',
              instantlyCampaignId: ic.id,
              status: isActive ? 'ACTIVE' : 'DRAFT',
              description: `Synced from Instantly`,
              ...(userId && { userId }),
            },
          });
          campaigns.push(newCampaign);
          created++;
          logger.info({ campaignId: newCampaign.id, instantlyId: ic.id }, 'Created campaign from Instantly');
        }
      }

      logger.info({ created, updated, total: campaigns.length }, 'Instantly sync complete');

      return { created, updated, campaigns };
    } catch (error) {
      logger.error({ error }, 'Failed to sync from Instantly');
      throw new AppError('Failed to sync campaigns from Instantly', 500, 'INSTANTLY_SYNC_ERROR');
    }
  }

  /**
   * Get aggregated outreach stats by channel
   */
  async getOutreachStats(userId?: string): Promise<{
    email: ChannelStats;
    sms: ChannelStats;
    linkedin: ChannelStats;
    totals: {
      inSequence: number;
      messagesSent: number;
      totalReplies: number;
      overallReplyRate: number;
    };
  }> {
    try {
      // Get all enrollments grouped by campaign channel and status
      const where: any = {};
      if (userId) {
        where.campaign = { userId };
      }

      const enrollments = await prisma.campaignEnrollment.findMany({
        where,
        include: {
          campaign: {
            select: { channel: true }
          }
        }
      });

      // Initialize stats
      const stats = {
        email: { enrolled: 0, sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, delivered: 0, failed: 0, pending: 0, accepted: 0 },
        sms: { enrolled: 0, sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, delivered: 0, failed: 0, pending: 0, accepted: 0 },
        linkedin: { enrolled: 0, sent: 0, opened: 0, clicked: 0, replied: 0, bounced: 0, delivered: 0, failed: 0, pending: 0, accepted: 0 },
      };

      // Count enrollments by channel and status
      // Valid statuses: ENROLLED, SENT, OPENED, CLICKED, REPLIED, BOUNCED, STOPPED, UNSUBSCRIBED
      enrollments.forEach(enrollment => {
        const channel = enrollment.campaign?.channel?.toLowerCase() as 'email' | 'sms' | 'linkedin';
        if (!channel || !stats[channel]) return;

        stats[channel].enrolled++;

        const status = enrollment.status;
        if (status === 'SENT') {
          stats[channel].sent++;
          stats[channel].delivered++;
        } else if (status === 'OPENED') {
          stats[channel].sent++;
          stats[channel].delivered++;
          stats[channel].opened++;
        } else if (status === 'CLICKED') {
          stats[channel].sent++;
          stats[channel].delivered++;
          stats[channel].opened++;
          stats[channel].clicked++;
        } else if (status === 'REPLIED') {
          stats[channel].sent++;
          stats[channel].delivered++;
          stats[channel].replied++;
        } else if (status === 'BOUNCED') {
          stats[channel].sent++;
          stats[channel].bounced++;
          stats[channel].failed++;
        } else if (status === 'ENROLLED') {
          stats[channel].pending++;
        } else if (status === 'STOPPED' || status === 'UNSUBSCRIBED') {
          // Stopped/unsubscribed don't add to stats
        }
      });

      // Calculate rates
      const emailReplyRate = stats.email.sent > 0 ? (stats.email.replied / stats.email.sent) * 100 : 0;
      const smsReplyRate = stats.sms.sent > 0 ? (stats.sms.replied / stats.sms.sent) * 100 : 0;
      const linkedinReplyRate = stats.linkedin.sent > 0 ? (stats.linkedin.replied / stats.linkedin.sent) * 100 : 0;
      
      const totalSent = stats.email.sent + stats.sms.sent + stats.linkedin.sent;
      const totalReplies = stats.email.replied + stats.sms.replied + stats.linkedin.replied;
      const totalInSequence = stats.email.enrolled + stats.sms.enrolled + stats.linkedin.enrolled;

      return {
        email: {
          ...stats.email,
          openRate: stats.email.sent > 0 ? (stats.email.opened / stats.email.sent) * 100 : 0,
          replyRate: emailReplyRate,
        },
        sms: {
          ...stats.sms,
          deliveryRate: stats.sms.sent > 0 ? (stats.sms.delivered / stats.sms.sent) * 100 : 0,
          replyRate: smsReplyRate,
        },
        linkedin: {
          ...stats.linkedin,
          acceptRate: stats.linkedin.sent > 0 ? (stats.linkedin.accepted / stats.linkedin.sent) * 100 : 0,
          replyRate: linkedinReplyRate,
        },
        totals: {
          inSequence: totalInSequence,
          messagesSent: totalSent,
          totalReplies,
          overallReplyRate: totalSent > 0 ? (totalReplies / totalSent) * 100 : 0,
        },
      };
    } catch (error) {
      logger.error({ error }, 'Failed to get outreach stats');
      throw new AppError('Failed to get outreach stats', 500, 'GET_OUTREACH_STATS_ERROR');
    }
  }
}

// Types
interface ChannelStats {
  enrolled: number;
  sent: number;
  opened: number;
  clicked: number;
  replied: number;
  bounced: number;
  delivered: number;
  failed: number;
  pending: number;
  accepted: number;
  openRate?: number;
  replyRate?: number;
  deliveryRate?: number;
  acceptRate?: number;
}

export const campaignService = new CampaignService();


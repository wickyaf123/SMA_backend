import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';
import { getInstantlyClient } from '../../integrations/instantly/client';
import { config } from '../../config';
import type { EnrollmentStatus } from '@prisma/client';

export interface EmailEnrollmentOptions {
  skipIfInWorkspace?: boolean;
  skipIfInCampaign?: boolean;
  customVariables?: Record<string, string>;
}

export interface EmailEnrollmentResult {
  success: number;
  failed: number;
  skipped: number;
  errors: Array<{ contactId: string; error: string }>;
}

export class EmailOutreachService {
  private instantlyClient = getInstantlyClient({
    apiKey: config.instantly.apiKey,
    baseUrl: 'https://api.instantly.ai/api/v1',
  });

  /**
   * Enroll contacts in an Instantly email campaign
   */
  async enrollInInstantly(
    campaignId: string,
    contactIds: string[],
    options: EmailEnrollmentOptions = {}
  ): Promise<EmailEnrollmentResult> {
    const result: EmailEnrollmentResult = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    try {
      logger.info(
        { campaignId, contactCount: contactIds.length },
        'Starting Instantly enrollment'
      );

      // Get campaign
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign) {
        throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
      }

      if (campaign.channel !== 'EMAIL') {
        throw new AppError(
          'Campaign is not an email campaign',
          400,
          'INVALID_CAMPAIGN_CHANNEL'
        );
      }

      if (!campaign.instantlyCampaignId) {
        throw new AppError(
          'Campaign has no Instantly campaign ID configured',
          400,
          'MISSING_INSTANTLY_CAMPAIGN_ID'
        );
      }

      // Get contacts
      const contacts = await prisma.contact.findMany({
        where: {
          id: { in: contactIds },
          email: { not: '' },
          status: { notIn: ['UNSUBSCRIBED', 'BOUNCED'] },
          emailValidationStatus: { in: ['VALID', 'UNKNOWN'] },
        },
        include: {
          company: {
            select: {
              name: true,
              website: true,
            },
          },
        },
      });

      logger.info(
        {
          requested: contactIds.length,
          eligible: contacts.length,
        },
        'Filtered eligible contacts'
      );

      // Process each contact
      for (const contact of contacts) {
        try {
          // Add to Instantly
          await this.instantlyClient.addLead({
            campaign_id: campaign.instantlyCampaignId,
            email: contact.email!,
            first_name: contact.firstName || undefined,
            last_name: contact.lastName || undefined,
            company_name: contact.company?.name || undefined,
            phone_number: contact.phone || undefined,
            website: contact.company?.website || undefined,
            custom_variables: options.customVariables || undefined,
            // Default to false so leads actually get enrolled in campaigns
            // Users can opt-in to skip via enrollment dialog options
            skip_if_in_workspace: options.skipIfInWorkspace ?? false,
            skip_if_in_campaign: options.skipIfInCampaign ?? false,
          });

          // Create or update enrollment record
          await prisma.campaignEnrollment.upsert({
            where: {
              campaignId_contactId: {
                campaignId,
                contactId: contact.id,
              },
            },
            create: {
              campaignId,
              contactId: contact.id,
              status: 'ENROLLED' as EnrollmentStatus,
              metadata: {
                instantlyCampaignId: campaign.instantlyCampaignId,
                enrolledVia: 'api',
              },
            },
            update: {
              status: 'ENROLLED' as EnrollmentStatus,
              stoppedAt: null,
              stoppedReason: null,
            },
          });

          // Update contact status
          if (contact.status === 'NEW' || contact.status === 'VALIDATED') {
            await prisma.contact.update({
              where: { id: contact.id },
              data: { status: 'IN_SEQUENCE' },
            });
          }

          result.success++;

          logger.debug(
            { contactId: contact.id, email: contact.email },
            'Contact enrolled in Instantly'
          );
        } catch (error: any) {
          result.failed++;
          result.errors.push({
            contactId: contact.id,
            error: error.message || 'Unknown error',
          });

          logger.error(
            { error, contactId: contact.id, email: contact.email },
            'Failed to enroll contact in Instantly'
          );
        }
      }

      result.skipped = contactIds.length - contacts.length;

      logger.info(
        {
          campaignId,
          success: result.success,
          failed: result.failed,
          skipped: result.skipped,
        },
        'Instantly enrollment complete'
      );

      return result;
    } catch (error) {
      logger.error({ error, campaignId, contactIds }, 'Instantly enrollment failed');
      if (error instanceof AppError) {
        throw error;
      }
      throw new AppError(
        'Failed to enroll contacts in Instantly',
        500,
        'INSTANTLY_ENROLLMENT_ERROR'
      );
    }
  }

  /**
   * Get campaign status from Instantly
   */
  async getCampaignStatus(
    campaignId: string,
    limit: number = 100
  ): Promise<any> {
    try {
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign || !campaign.instantlyCampaignId) {
        throw new AppError(
          'Campaign not found or missing Instantly ID',
          404,
          'CAMPAIGN_NOT_FOUND'
        );
      }

      const result = await this.instantlyClient.getCampaignEmails({
        campaign_id: campaign.instantlyCampaignId,
        limit,
        skip: 0,
      });

      return result;
    } catch (error) {
      logger.error({ error, campaignId }, 'Failed to get campaign status');
      throw error;
    }
  }

  /**
   * Sync status from Instantly for a campaign
   * This can be called periodically to update enrollment statuses
   */
  async syncCampaignStatus(campaignId: string): Promise<void> {
    try {
      logger.info({ campaignId }, 'Syncing campaign status from Instantly');

      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        include: {
          enrollments: {
            include: {
              contact: {
                select: { email: true },
              },
            },
          },
        },
      });

      if (!campaign || !campaign.instantlyCampaignId) {
        throw new AppError(
          'Campaign not found or missing Instantly ID',
          404,
          'CAMPAIGN_NOT_FOUND'
        );
      }

      // Get all emails from Instantly
      const instantlyData = await this.instantlyClient.getCampaignEmails({
        campaign_id: campaign.instantlyCampaignId,
        limit: 1000, // Adjust based on campaign size
        skip: 0,
      });

      // Create email-to-status map
      const emailStatusMap = new Map(
        instantlyData.emails.map((e) => [e.email, e])
      );

      // Update each enrollment
      for (const enrollment of campaign.enrollments) {
        const instantlyStatus = emailStatusMap.get(enrollment.contact.email);
        if (!instantlyStatus) continue;

        let newStatus: EnrollmentStatus = enrollment.status;

        // Determine new status based on Instantly data
        if (instantlyStatus.replied) {
          newStatus = 'REPLIED';
        } else if (instantlyStatus.bounced) {
          newStatus = 'BOUNCED';
        } else if (instantlyStatus.unsubscribed) {
          newStatus = 'UNSUBSCRIBED';
        } else if (instantlyStatus.clicked) {
          newStatus = 'CLICKED';
        } else if (instantlyStatus.opened) {
          newStatus = 'OPENED';
        } else if (instantlyStatus.status === 'sent') {
          newStatus = 'SENT';
        }

        // Update if status changed
        if (newStatus !== enrollment.status) {
          await prisma.campaignEnrollment.update({
            where: { id: enrollment.id },
            data: { status: newStatus },
          });

          logger.debug(
            {
              enrollmentId: enrollment.id,
              oldStatus: enrollment.status,
              newStatus,
            },
            'Updated enrollment status from Instantly'
          );
        }
      }

      logger.info({ campaignId }, 'Campaign status sync complete');
    } catch (error) {
      logger.error({ error, campaignId }, 'Failed to sync campaign status');
      throw error;
    }
  }
}

export const emailOutreachService = new EmailOutreachService();


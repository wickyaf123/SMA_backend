/**
 * Auto-Enroll Job
 * Daily auto-enrollment into Email and SMS campaigns
 * Day 8: Daily Automation
 * 
 * REQUIREMENTS:
 * - Default Email Campaign must be set in Settings (settings.defaultEmailCampaignId)
 * - Default SMS Campaign must be set in Settings (settings.defaultSmsCampaignId)
 * 
 * Configure via:
 * - POST /api/v1/settings/default-campaigns/email  with { campaignId: "uuid" }
 * - POST /api/v1/settings/default-campaigns/sms    with { campaignId: "uuid" }
 */

import { prisma } from '../config/database';
import { campaignService } from '../services/campaign/campaign.service';
import { emailOutreachService } from '../services/outreach/email.service';
import { settingsService } from '../services/settings/settings.service';
import { logger } from '../utils/logger';

export interface AutoEnrollJobConfig {
  batchSize?: number;
}

export interface AutoEnrollJobResult {
  success: boolean;
  contactsProcessed: number;
  emailEnrollments: number;
  smsEnrollments: number;
  errors: string[];
  duration: number;
  skippedReason?: string;
}

export class AutoEnrollJob {
  async run(config: AutoEnrollJobConfig = { batchSize: 10 }): Promise<AutoEnrollJobResult> {
    const startTime = Date.now();
    logger.info({ config }, 'Starting auto-enroll job');

    try {
      // Check if enroll job is enabled in settings
      const isEnabled = await settingsService.isJobEnabled('enroll');
      if (!isEnabled) {
        const duration = Date.now() - startTime;
        logger.warn('Auto-enroll job is disabled in settings');
        return {
          success: true,
          contactsProcessed: 0,
          emailEnrollments: 0,
          smsEnrollments: 0,
          errors: [],
          duration,
          skippedReason: 'Job disabled in settings (enrollJobEnabled: false or pipeline disabled)',
        };
      }

      // Get default campaign IDs from settings (creates defaults if not exists)
      const settings = await settingsService.getSettings();

      // Validate default campaigns are configured
      if (!settings.defaultEmailCampaignId && !settings.defaultSmsCampaignId) {
        const duration = Date.now() - startTime;
        logger.warn(
          'Auto-enroll job skipped: No default campaigns configured. ' +
          'Set default campaigns via POST /api/v1/settings/default-campaigns/email and /sms'
        );
        return {
          success: true,
          contactsProcessed: 0,
          emailEnrollments: 0,
          smsEnrollments: 0,
          errors: [],
          duration,
          skippedReason: 'No default campaigns configured. Configure via Settings > Default Campaigns in the UI.',
        };
      }

      // Log which campaigns are available
      logger.info({
        defaultEmailCampaignId: settings.defaultEmailCampaignId || 'NOT SET',
        defaultSmsCampaignId: settings.defaultSmsCampaignId || 'NOT SET',
      }, 'Default campaign configuration');

      // Get validated contacts that aren't enrolled yet
      const contacts = await prisma.contact.findMany({
        where: {
          status: 'VALIDATED',
          campaignEnrollments: {
            none: {},
          },
        },
        take: config.batchSize,
        orderBy: { createdAt: 'desc' },
      });

      logger.info({ count: contacts.length }, 'Found contacts to enroll');

      let emailEnrollments = 0;
      let smsEnrollments = 0;
      const errors: string[] = [];

      for (const contact of contacts) {
        let enrolledInAny = false;
        
        try {
          // Enroll in Email campaign (if configured and contact has email)
          if (settings.defaultEmailCampaignId && contact.email) {
            try {
              // Check if email outreach is enabled
              const emailEnabled = await settingsService.isOutreachEnabled('email');
              if (emailEnabled) {
                await campaignService.enrollContacts(settings.defaultEmailCampaignId, [contact.id]);
                
                // Add to Instantly
                await emailOutreachService.enrollInInstantly(
                  settings.defaultEmailCampaignId,
                  [contact.id],
                  {
                    skipIfInWorkspace: true,
                    skipIfInCampaign: true,
                  }
                );
                
                emailEnrollments++;
                enrolledInAny = true;
                logger.debug({ contactId: contact.id }, 'Enrolled in email campaign');
              } else {
                logger.debug({ contactId: contact.id }, 'Email outreach disabled, skipping email enrollment');
              }
            } catch (error: any) {
              logger.warn({ contactId: contact.id, error: error.message }, 'Failed to enroll in email');
              errors.push(`Email enrollment for ${contact.id}: ${error.message}`);
            }
          }

          // Enroll in SMS campaign (if configured and contact has phone)
          if (settings.defaultSmsCampaignId && contact.phone) {
            try {
              // Check if SMS outreach is enabled
              const smsEnabled = await settingsService.isOutreachEnabled('sms');
              if (smsEnabled) {
                await campaignService.enrollContacts(settings.defaultSmsCampaignId, [contact.id]);
                smsEnrollments++;
                enrolledInAny = true;
                logger.debug({ contactId: contact.id }, 'Enrolled in SMS campaign');
                
                // NOTE: Actual SMS sending is handled by GHL workflows, not directly here.
                // The contact will be synced to GHL when first SMS is sent manually or via workflow.
              } else {
                logger.debug({ contactId: contact.id }, 'SMS outreach disabled, skipping SMS enrollment');
              }
            } catch (error: any) {
              logger.warn({ contactId: contact.id, error: error.message }, 'Failed to enroll in SMS');
              errors.push(`SMS enrollment for ${contact.id}: ${error.message}`);
            }
          }

          // Update contact status only if enrolled in at least one campaign
          if (enrolledInAny) {
            await prisma.contact.update({
              where: { id: contact.id },
              data: {
                status: 'IN_SEQUENCE',
              },
            });
          } else {
            logger.info(
              { contactId: contact.id, hasEmail: !!contact.email, hasPhone: !!contact.phone },
              'Contact not enrolled - missing contact info or outreach disabled'
            );
          }
        } catch (error: any) {
          logger.error({ contactId: contact.id, error: error.message }, 'Failed to process contact');
          errors.push(`Contact ${contact.id}: ${error.message}`);
        }
      }

      const duration = Date.now() - startTime;

      logger.info(
        {
          contactsProcessed: contacts.length,
          emailEnrollments,
          smsEnrollments,
          duration,
        },
        'Auto-enroll job completed'
      );

      return {
        success: true,
        contactsProcessed: contacts.length,
        emailEnrollments,
        smsEnrollments,
        errors,
        duration,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error({ error: error.message, duration }, 'Auto-enroll job failed');

      return {
        success: false,
        contactsProcessed: 0,
        emailEnrollments: 0,
        smsEnrollments: 0,
        errors: [error.message],
        duration,
      };
    }
  }
}

export const autoEnrollJob = new AutoEnrollJob();


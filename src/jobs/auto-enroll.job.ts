/**
 * Auto-Enroll Job
 * Daily auto-enrollment into Email and SMS campaigns
 * Day 8: Daily Automation
 * 
 * UPDATED: Now uses Campaign Routing Rules for intelligent lead routing
 * 
 * ROUTING BEHAVIOR:
 * 1. For each validated contact, evaluate routing rules by priority
 * 2. First matching rule determines the target campaign
 * 3. If no rule matches, fallback behavior is applied:
 *    - "default_campaign": Use settings.defaultEmailCampaignId
 *    - "skip": Don't enroll the contact
 * 
 * Configure routing rules via:
 * - GET/POST /api/v1/campaigns/routing-rules
 * 
 * Configure fallback via:
 * - Settings > routingFallbackBehavior
 */

import { prisma } from '../config/database';
import { campaignService } from '../services/campaign/campaign.service';
import { campaignRoutingService } from '../services/campaign/routing.service';
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
  routedByRule: number;
  routedByFallback: number;
  skippedNoMatch: number;
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
          routedByRule: 0,
          routedByFallback: 0,
          skippedNoMatch: 0,
          errors: [],
          duration,
          skippedReason: 'Job disabled in settings (enrollJobEnabled: false or pipeline disabled)',
        };
      }

      // Get settings for SMS campaign and fallback behavior
      const settings = await settingsService.getSettings();

      // Check if we have any routing rules OR a default campaign configured
      const routingRules = await prisma.campaignRoutingRule.findMany({
        where: { isActive: true },
      });
      
      const hasRoutingRules = routingRules.length > 0;
      const hasDefaultEmailCampaign = !!settings.defaultEmailCampaignId;
      const hasDefaultSmsCampaign = !!settings.defaultSmsCampaignId;

      if (!hasRoutingRules && !hasDefaultEmailCampaign && !hasDefaultSmsCampaign) {
        const duration = Date.now() - startTime;
        logger.warn(
          'Auto-enroll job skipped: No routing rules or default campaigns configured.'
        );
        return {
          success: true,
          contactsProcessed: 0,
          emailEnrollments: 0,
          smsEnrollments: 0,
          routedByRule: 0,
          routedByFallback: 0,
          skippedNoMatch: 0,
          errors: [],
          duration,
          skippedReason: 'No routing rules or default campaigns configured. Configure via Settings > Routing Rules.',
        };
      }

      // Log configuration
      logger.info({
        routingRulesCount: routingRules.length,
        fallbackBehavior: settings.routingFallbackBehavior,
        defaultEmailCampaignId: settings.defaultEmailCampaignId || 'NOT SET',
        defaultSmsCampaignId: settings.defaultSmsCampaignId || 'NOT SET',
      }, 'Auto-enroll configuration');

      // Get validated contacts that aren't enrolled yet (include company for routing)
      const contacts = await prisma.contact.findMany({
        where: {
          status: 'VALIDATED',
          campaignEnrollments: {
            none: {},
          },
        },
        include: {
          company: true,
        },
        take: config.batchSize,
        orderBy: { createdAt: 'desc' },
      });

      logger.info({ count: contacts.length }, 'Found contacts to enroll');

      let emailEnrollments = 0;
      let smsEnrollments = 0;
      let routedByRule = 0;
      let routedByFallback = 0;
      let skippedNoMatch = 0;
      const errors: string[] = [];

      for (const contact of contacts) {
        let enrolledInAny = false;
        
        try {
          // ==================== EMAIL ROUTING ====================
          if (contact.email) {
            try {
              // Check if email outreach is enabled
              const emailEnabled = await settingsService.isOutreachEnabled('email');
              if (emailEnabled) {
                // Use routing service to determine target campaign
                const routeResult = await campaignRoutingService.routeContact(contact);
                
                if (routeResult.campaign) {
                  // Enroll in the routed campaign
                  await campaignService.enrollContacts(routeResult.campaign.id, [contact.id]);
                  
                  // Add to Instantly
                  await emailOutreachService.enrollInInstantly(
                    routeResult.campaign.id,
                    [contact.id],
                    {
                      skipIfInWorkspace: true,
                      skipIfInCampaign: true,
                    }
                  );
                  
                  emailEnrollments++;
                  enrolledInAny = true;
                  
                  if (routeResult.matchedRule) {
                    routedByRule++;
                    logger.debug({ 
                      contactId: contact.id, 
                      ruleId: routeResult.matchedRule.id,
                      ruleName: routeResult.matchedRule.name,
                      campaignId: routeResult.campaign.id,
                      campaignName: routeResult.campaign.name,
                    }, 'Contact routed by rule');
                  } else {
                    routedByFallback++;
                    logger.debug({ 
                      contactId: contact.id, 
                      campaignId: routeResult.campaign.id,
                      campaignName: routeResult.campaign.name,
                    }, 'Contact routed by fallback');
                  }
                } else {
                  // No campaign matched and fallback is "skip"
                  skippedNoMatch++;
                  logger.debug({ 
                    contactId: contact.id, 
                    source: contact.source,
                    state: contact.state,
                  }, 'Contact skipped - no routing rule matched');
                }
              } else {
                logger.debug({ contactId: contact.id }, 'Email outreach disabled, skipping email enrollment');
              }
            } catch (error: any) {
              logger.warn({ contactId: contact.id, error: error.message }, 'Failed to enroll in email');
              errors.push(`Email enrollment for ${contact.id}: ${error.message}`);
            }
          }

          // ==================== SMS ENROLLMENT ====================
          // SMS still uses the default campaign (no routing rules for SMS yet)
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
              'Contact not enrolled - missing contact info, outreach disabled, or no matching rule'
            );
          }
        } catch (error: any) {
          logger.error({ contactId: contact.id, error: error.message }, 'Failed to process contact');
          errors.push(`Contact ${contact.id}: ${error.message}`);
        }
      }

      // ==================== SMS DELAY FALLBACK ====================
      // Check for contacts tagged sms_fallback_pending that have passed the delay window
      let smsFallbackEnrolled = 0;
      const smsFallbackDelayDays = (settings as any).smsFallbackDelayDays ?? 5;
      if (smsFallbackDelayDays > 0 && settings.defaultSmsCampaignId && settings.smsOutreachEnabled) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - smsFallbackDelayDays);

        const fallbackContacts = await prisma.contact.findMany({
          where: {
            tags: { has: 'sms_fallback_pending' },
            hasReplied: false,
            phone: { not: null },
            lastContactedAt: { lte: cutoffDate },
          },
          take: 50,
        });

        for (const contact of fallbackContacts) {
          try {
            await campaignService.enrollContacts(settings.defaultSmsCampaignId, [contact.id]);
            // Remove the pending tag and add completed tag
            const updatedTags = contact.tags
              .filter(t => t !== 'sms_fallback_pending')
              .concat('sms_fallback_sent');
            await prisma.contact.update({
              where: { id: contact.id },
              data: { tags: updatedTags },
            });
            smsFallbackEnrolled++;
          } catch (err: any) {
            logger.warn({ contactId: contact.id, error: err.message }, 'SMS fallback enrollment failed');
          }
        }

        if (smsFallbackEnrolled > 0) {
          logger.info(
            { smsFallbackEnrolled, delayDays: smsFallbackDelayDays },
            'SMS delay fallback enrollments completed'
          );
        }
      }

      const duration = Date.now() - startTime;

      logger.info(
        {
          contactsProcessed: contacts.length,
          emailEnrollments,
          smsEnrollments,
          smsFallbackEnrolled,
          routedByRule,
          routedByFallback,
          skippedNoMatch,
          duration,
        },
        'Auto-enroll job completed'
      );

      return {
        success: true,
        contactsProcessed: contacts.length,
        emailEnrollments,
        smsEnrollments,
        routedByRule,
        routedByFallback,
        skippedNoMatch,
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
        routedByRule: 0,
        routedByFallback: 0,
        skippedNoMatch: 0,
        errors: [error.message],
        duration,
      };
    }
  }
}

export const autoEnrollJob = new AutoEnrollJob();

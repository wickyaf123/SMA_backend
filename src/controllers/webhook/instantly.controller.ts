import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { sendSuccess } from '../../utils/response';
import { unifiedReplyHandler } from '../../services/reply/unified-reply-handler.service';
import { campaignService } from '../../services/campaign/campaign.service';
import { ghlUnifiedInboxService } from '../../services/ghl/ghl-unified-inbox.service';
import type {
  InstantlyWebhookPayload,
  InstantlyWebhookEvent,
} from '../../integrations/instantly/types';
import type { EnrollmentStatus } from '@prisma/client';

export class InstantlyWebhookController {
  /**
   * Handle Instantly webhook events
   * POST /webhooks/instantly
   */
  async handleWebhook(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const payload = req.body as InstantlyWebhookPayload;

      logger.info(
        {
          event: payload.event,
          email: payload.data?.email,
          campaignId: payload.data?.campaign_id,
        },
        'Received Instantly webhook'
      );

      // Store webhook in log
      await prisma.webhookLog.create({
        data: {
          source: 'instantly',
          eventType: payload.event,
          payload: payload as any,
          processed: false,
        },
      });

      // Find contact by email
      const contact = await prisma.contact.findUnique({
        where: { email: payload.data.email },
      });

      if (!contact) {
        logger.warn(
          { email: payload.data.email },
          'Contact not found for Instantly webhook'
        );
        sendSuccess(res, { received: true, processed: false });
        return;
      }

      // Find enrollment by campaign ID and contact
      const enrollment = await prisma.campaignEnrollment.findFirst({
        where: {
          contactId: contact.id,
          campaign: {
            instantlyCampaignId: payload.data.campaign_id,
          },
        },
        include: {
          campaign: true,
        },
      });

      if (!enrollment) {
        logger.warn(
          {
            contactId: contact.id,
            campaignId: payload.data.campaign_id,
          },
          'Enrollment not found for Instantly webhook'
        );
        sendSuccess(res, { received: true, processed: false });
        return;
      }

      // Process event
      await this.processEvent(payload.event, enrollment, contact, payload.data);

      // Mark webhook as processed
      await prisma.webhookLog.updateMany({
        where: {
          source: 'instantly',
          eventType: payload.event,
          processed: false,
          payload: {
            path: ['data', 'email'],
            equals: payload.data.email,
          },
        },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });

      sendSuccess(res, { received: true, processed: true });
    } catch (error) {
      logger.error({ error, body: req.body }, 'Error processing Instantly webhook');
      next(error);
    }
  }

  /**
   * Process specific webhook events
   */
  private async processEvent(
    event: InstantlyWebhookEvent,
    enrollment: any,
    contact: any,
    data: any
  ): Promise<void> {
    let newStatus: EnrollmentStatus | null = null;
    let updateContact = false;

    switch (event) {
      case 'email.sent':
        newStatus = 'SENT';
        logger.info(
          { contactId: contact.id, enrollmentId: enrollment.id },
          'Email sent'
        );
        break;

      case 'email.delivered':
        // Keep SENT status, just log
        logger.info(
          { contactId: contact.id, enrollmentId: enrollment.id },
          'Email delivered'
        );
        break;

      case 'email.opened':
        newStatus = 'OPENED';
        logger.info(
          { contactId: contact.id, enrollmentId: enrollment.id },
          'Email opened'
        );
        break;

      case 'email.clicked':
        newStatus = 'CLICKED';
        logger.info(
          { contactId: contact.id, enrollmentId: enrollment.id },
          'Email clicked'
        );
        break;

      case 'email.replied':
        newStatus = 'REPLIED';
        updateContact = true;

        logger.info(
          { contactId: contact.id, enrollmentId: enrollment.id },
          'Email replied - stopping all campaigns and routing to GHL'
        );

        // UNIFIED REPLY HANDLER - Stop all campaigns for this contact
        await campaignService.stopAllCampaigns(
          contact.id,
          'replied_email'
        );

        // Update contact status
        await prisma.contact.update({
          where: { id: contact.id },
          data: {
            status: 'REPLIED',
            hasReplied: true,
            repliedAt: new Date(),
            repliedChannel: 'EMAIL',
          },
        });

        // Log reply
        await prisma.reply.create({
          data: {
            contactId: contact.id,
            channel: 'EMAIL',
            content: data.reply_text || null,
            fromAddress: data.reply_from || data.email,
            messageId: data.message_id,
            receivedAt: new Date(data.timestamp || Date.now()),
            rawPayload: data,
            isProcessed: true,
            processedAt: new Date(),
          },
        });

        // ===== ROUTE TO GHL UNIFIED INBOX =====
        // This makes the email reply visible in GHL Conversations
        try {
          const ghlResult = await ghlUnifiedInboxService.routeReplyToGHL({
            contactId: contact.id,
            channel: 'EMAIL',
            source: 'instantly',
            replyText: data.reply_text || 'No reply content',
            metadata: {
              subject: data.subject,
              fromEmail: data.reply_from || data.email,
              fromName: data.reply_from_name,
              messageId: data.message_id,
              timestamp: data.timestamp,
              originalSubject: data.original_subject,
            },
          });

          if (ghlResult.success) {
            logger.info(
              { 
                contactId: contact.id, 
                ghlContactId: ghlResult.ghlContactId,
                ghlConversationId: ghlResult.ghlConversationId,
              },
              'Email reply routed to GHL unified inbox'
            );
          } else {
            logger.warn(
              { contactId: contact.id, error: ghlResult.error },
              'Failed to route email reply to GHL (non-critical)'
            );
          }
        } catch (ghlError: any) {
          // Don't fail the webhook if GHL routing fails
          logger.error(
            { contactId: contact.id, error: ghlError.message },
            'GHL routing error (non-critical)'
          );
        }

        break;

      case 'email.bounced':
        newStatus = 'BOUNCED';
        updateContact = true;

        logger.warn(
          { contactId: contact.id, enrollmentId: enrollment.id },
          'Email bounced'
        );

        // Update contact status
        await prisma.contact.update({
          where: { id: contact.id },
          data: {
            status: 'BOUNCED',
            emailValidationStatus: 'INVALID',
          },
        });

        break;

      case 'email.unsubscribed':
        newStatus = 'UNSUBSCRIBED';
        updateContact = true;

        logger.warn(
          { contactId: contact.id, enrollmentId: enrollment.id },
          'Contact unsubscribed'
        );

        // Update contact status and stop all campaigns
        await prisma.contact.update({
          where: { id: contact.id },
          data: { status: 'UNSUBSCRIBED' },
        });

        await campaignService.stopAllCampaigns(
          contact.id,
          'unsubscribed'
        );

        break;
    }

    // Update enrollment status if needed
    if (newStatus && enrollment.status !== newStatus) {
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
        'Updated enrollment status'
      );
    }
  }
}

export const instantlyWebhookController = new InstantlyWebhookController();


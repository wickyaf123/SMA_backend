import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { sendSuccess } from '../../utils/response';
import { unifiedReplyHandler } from '../../services/reply/unified-reply-handler.service';

export interface PhantomBusterWebhookPayload {
  event: string;
  containerId?: string;
  agentId?: string;
  data?: {
    linkedinUrl?: string;
    profileUrl?: string;
    connected?: boolean;
    connectionRequestSent?: boolean;
    messageSent?: boolean;
    replied?: boolean;
    replyText?: string;
    timestamp?: string;
    error?: string;
    [key: string]: any;
  };
}

export class PhantomBusterWebhookController {
  /**
   * Handle PhantomBuster webhook events
   * POST /webhooks/phantombuster
   */
  async handleWebhook(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const payload = req.body as PhantomBusterWebhookPayload;

      logger.info(
        {
          event: payload.event,
          containerId: payload.containerId,
          linkedinUrl: payload.data?.linkedinUrl || payload.data?.profileUrl,
        },
        'Received PhantomBuster webhook'
      );

      // Store webhook in log
      await prisma.webhookLog.create({
        data: {
          source: 'phantombuster',
          eventType: payload.event,
          payload: payload as any,
          processed: false,
        },
      });

      const linkedinUrl = payload.data?.linkedinUrl || payload.data?.profileUrl;

      if (!linkedinUrl) {
        logger.warn({ payload }, 'No LinkedIn URL in PhantomBuster webhook');
        sendSuccess(res, { received: true, processed: false });
        return;
      }

      // Find contact by LinkedIn URL
      const contact = await prisma.contact.findFirst({
        where: { linkedinUrl },
      });

      if (!contact) {
        logger.warn(
          { linkedinUrl },
          'Contact not found for PhantomBuster webhook'
        );
        sendSuccess(res, { received: true, processed: false });
        return;
      }

      // Process the event
      await this.processEvent(payload, contact);

      // Mark webhook as processed
      await prisma.webhookLog.updateMany({
        where: {
          source: 'phantombuster',
          eventType: payload.event,
          processed: false,
        },
        data: {
          processed: true,
          processedAt: new Date(),
        },
      });

      sendSuccess(res, { received: true, processed: true });
    } catch (error) {
      logger.error(
        { error, body: req.body },
        'Error processing PhantomBuster webhook'
      );
      next(error);
    }
  }

  /**
   * Process specific webhook events
   */
  private async processEvent(
    payload: PhantomBusterWebhookPayload,
    contact: any
  ): Promise<void> {
    const data = payload.data || {};

    // Find active LinkedIn campaign enrollment
    const enrollment = await prisma.campaignEnrollment.findFirst({
      where: {
        contactId: contact.id,
        campaign: { channel: 'LINKEDIN' },
        status: { in: ['ENROLLED', 'SENT'] },
      },
      include: {
        campaign: true,
      },
    });

    // Handle connection request sent
    if (data.connectionRequestSent || payload.event === 'connection_request_sent') {
      logger.info({ contactId: contact.id }, 'LinkedIn connection request sent');

      if (enrollment) {
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'SENT' },
        });
      }

      // Update contact last contacted
      await prisma.contact.update({
        where: { id: contact.id },
        data: { lastContactedAt: new Date() },
      });
    }

    // Handle connection accepted
    if (data.connected || payload.event === 'connection_accepted') {
      logger.info({ contactId: contact.id }, 'LinkedIn connection accepted');

      if (enrollment) {
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'OPENED' }, // Use OPENED to indicate connection accepted
        });
      }
    }

    // Handle message sent
    if (data.messageSent || payload.event === 'message_sent') {
      logger.info({ contactId: contact.id }, 'LinkedIn message sent');

      if (enrollment) {
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'SENT' },
        });
      }

      await prisma.contact.update({
        where: { id: contact.id },
        data: { lastContactedAt: new Date() },
      });
    }

    // Handle reply
    if (data.replied || payload.event === 'replied') {
      logger.info(
        { contactId: contact.id },
        'LinkedIn reply received - processing via unified handler'
      );

      // Use unified reply handler
      await unifiedReplyHandler.handleReply({
        contactId: contact.id,
        channel: 'LINKEDIN',
        source: 'phantombuster',
        replyText: data.replyText || '',
        metadata: {
          fromAddress: contact.linkedinUrl || '',
          externalId: data.messageId,
        },
      });

      if (enrollment) {
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: { status: 'REPLIED' },
        });
      }
    }

    // Handle errors
    if (data.error || payload.event === 'error') {
      logger.error(
        {
          contactId: contact.id,
          error: data.error,
        },
        'PhantomBuster action failed'
      );

      if (enrollment) {
        await prisma.campaignEnrollment.update({
          where: { id: enrollment.id },
          data: {
            status: 'STOPPED',
            stoppedAt: new Date(),
            stoppedReason: `phantombuster_error: ${data.error}`,
          },
        });
      }
    }
  }
}

export const phantomBusterWebhookController = new PhantomBusterWebhookController();


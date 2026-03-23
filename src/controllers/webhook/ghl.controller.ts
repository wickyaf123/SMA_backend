/**
 * GoHighLevel Webhook Controller
 * Handles incoming webhooks from GHL for SMS/Email replies
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { GHLInboundMessagePayload } from '../../integrations/ghl/types';
import { unifiedReplyHandler } from '../../services/reply/unified-reply-handler.service';

class GHLWebhookController {
  /**
   * Handle GHL webhook events
   * Endpoint: POST /webhooks/ghl/reply
   */
  async handleWebhook(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const payload = req.body as GHLInboundMessagePayload;

      logger.info(
        {
          type: payload.type,
          contactId: payload.contactId,
          conversationId: payload.conversationId,
        },
        'Received GHL webhook'
      );

      // Only process inbound messages
      if (payload.type !== 'InboundMessage') {
        logger.debug({ type: payload.type }, 'Ignoring non-inbound message webhook');
        res.status(200).json({ received: true, processed: false });
        return;
      }

      // Only process SMS and Email replies
      if (payload.message.type !== 'SMS' && payload.message.type !== 'Email') {
        logger.debug(
          { messageType: payload.message.type },
          'Ignoring non-SMS/Email message'
        );
        res.status(200).json({ received: true, processed: false });
        return;
      }

      // Only process inbound direction
      if (payload.message.direction !== 'inbound') {
        logger.debug({ direction: payload.message.direction }, 'Ignoring outbound message');
        res.status(200).json({ received: true, processed: false });
        return;
      }

      // Find contact in our database by GHL contact ID
      const contact = await prisma.contact.findFirst({
        where: {
          ghlContactId: payload.contactId,
        },
        select: {
          id: true,
          email: true,
          phone: true,
          fullName: true,
        },
      });

      if (!contact) {
        logger.warn(
          { ghlContactId: payload.contactId },
          'Contact not found in database for GHL webhook'
        );
        res.status(200).json({ received: true, processed: false });
        return;
      }

      logger.info(
        {
          contactId: contact.id,
          ghlContactId: payload.contactId,
          messageType: payload.message.type,
        },
        'Processing GHL reply'
      );

      // Use unified reply handler
      const result = await unifiedReplyHandler.handleReply({
        contactId: contact.id,
        channel: payload.message.type === 'SMS' ? 'SMS' : 'EMAIL',
        source: 'ghl',
        replyText: payload.message.body,
        metadata: {
          messageId: payload.message.id,
          conversationId: payload.conversationId,
          externalId: payload.message.id,
          fromAddress: contact.phone || contact.email || undefined,
        },
      });

      logger.info(
        { 
          contactId: contact.id, 
          stoppedCount: result.stoppedCampaigns,
          replyId: result.replyId,
        },
        'Unified reply handler processed GHL reply'
      );

      // GHL workflow enrollment is handled by unifiedReplyHandler.triggerGhlReplyWorkflow()
      // (called within handleReply above) — no duplicate enrollment needed here.

      res.status(200).json({
        received: true,
        processed: true,
        contactId: contact.id,
        stoppedCampaigns: result.stoppedCampaigns,
        replyId: result.replyId,
      });
    } catch (error: any) {
      logger.error({ error: error.message, stack: error.stack }, 'GHL webhook error');
      next(error);
    }
  }

  /**
   * Verify GHL webhook signature (if configured)
   * GHL doesn't provide webhook signing by default, but you can implement IP whitelisting
   * 
   * SECURITY NOTE: For production, consider:
   * 1. IP whitelisting (GHL webhook IPs: https://docs.gohighlevel.com/docs/webhooks)
   * 2. Using GHL's location-specific webhook secrets if available
   * 3. Rate limiting on this endpoint
   * 
   * Currently: Webhooks are accepted from any IP. This is acceptable for most use cases
   * since the webhook only triggers internal actions (no data exposure).
   */
  verifyWebhook(req: Request, res: Response, next: NextFunction): void {
    // Currently accepting all webhooks - GHL doesn't provide webhook signatures
    // The webhook only triggers internal reply handling, so risk is minimal
    next();
  }
}

export const ghlWebhookController = new GHLWebhookController();


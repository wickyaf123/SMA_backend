/**
 * GoHighLevel Webhook Controller
 * Handles incoming webhooks from GHL for SMS/Email replies
 */

import { Request, Response, NextFunction } from 'express';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { unifiedReplyHandler } from '../../services/reply/unified-reply-handler.service';

interface NormalizedInbound {
  type: 'InboundMessage' | string;
  contactId: string;
  conversationId: string;
  message: {
    id: string;
    type: 'SMS' | 'Email' | string;
    direction: 'inbound' | 'outbound' | string;
    body: string;
  };
}

/**
 * Accepts both GHL payload shapes and returns a unified structure:
 * 1) Native subscription / "Inbound Message" event: nested { type, contactId, message: {...} }
 * 2) Workflow "Send Webhook" action with Custom Data (flat key-value pairs):
 *    e.g. { contact_id, message_body, message_type, conversation_id, message_id, ... }
 *
 * Returns null when the body has neither shape.
 */
function normalizeGhlPayload(body: Record<string, any>): NormalizedInbound | null {
  if (!body || typeof body !== 'object') return null;

  if (body.type === 'InboundMessage' && body.message && body.contactId) {
    return body as NormalizedInbound;
  }

  const contactId = body.contact_id || body.contactId || body['contact.id'];
  const messageBody =
    body.message_body || body.body || body.message?.body || body['message.body'];
  if (!contactId || typeof messageBody !== 'string') return null;

  const rawType: string =
    body.message_type ||
    body.type ||
    body.channel ||
    body.message?.type ||
    'SMS';
  const messageType: 'SMS' | 'Email' =
    /email/i.test(rawType) ? 'Email' : 'SMS';

  const direction: string =
    body.message_direction ||
    body.direction ||
    body.message?.direction ||
    'inbound';

  return {
    type: 'InboundMessage',
    contactId: String(contactId),
    conversationId: String(
      body.conversation_id || body.conversationId || body['conversation.id'] || ''
    ),
    message: {
      id: String(body.message_id || body.messageId || body['message.id'] || ''),
      type: messageType,
      direction,
      body: messageBody,
    },
  };
}

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
      const raw = req.body as Record<string, any>;

      logger.info(
        { rawPayload: raw, headers: { 'content-type': req.get('content-type') } },
        'Received GHL webhook (raw)'
      );

      const normalized = normalizeGhlPayload(raw);

      if (!normalized) {
        logger.warn({ rawPayload: raw }, 'GHL webhook payload could not be normalized');
        res.status(200).json({ received: true, processed: false, reason: 'unrecognized_payload_shape' });
        return;
      }

      logger.info(
        {
          type: normalized.type,
          contactId: normalized.contactId,
          conversationId: normalized.conversationId,
          messageType: normalized.message.type,
          messageDirection: normalized.message.direction,
          bodyLength: normalized.message.body?.length ?? 0,
        },
        'Received GHL webhook (normalized)'
      );

      if (normalized.type !== 'InboundMessage') {
        logger.debug({ type: normalized.type }, 'Ignoring non-inbound message webhook');
        res.status(200).json({ received: true, processed: false, reason: 'not_inbound' });
        return;
      }

      if (normalized.message.type !== 'SMS' && normalized.message.type !== 'Email') {
        logger.debug(
          { messageType: normalized.message.type },
          'Ignoring non-SMS/Email message'
        );
        res.status(200).json({ received: true, processed: false, reason: 'unsupported_channel' });
        return;
      }

      if (normalized.message.direction !== 'inbound') {
        logger.debug({ direction: normalized.message.direction }, 'Ignoring outbound message');
        res.status(200).json({ received: true, processed: false, reason: 'not_inbound_direction' });
        return;
      }

      const contact = await prisma.contact.findFirst({
        where: { ghlContactId: normalized.contactId },
        select: {
          id: true,
          email: true,
          phone: true,
          fullName: true,
        },
      });

      if (!contact) {
        logger.warn(
          { ghlContactId: normalized.contactId },
          'Contact not found in database for GHL webhook'
        );
        res.status(200).json({ received: true, processed: false, reason: 'contact_not_found' });
        return;
      }

      logger.info(
        {
          contactId: contact.id,
          ghlContactId: normalized.contactId,
          messageType: normalized.message.type,
        },
        'Processing GHL reply'
      );

      const result = await unifiedReplyHandler.handleReply({
        contactId: contact.id,
        channel: normalized.message.type === 'SMS' ? 'SMS' : 'EMAIL',
        source: 'ghl',
        replyText: normalized.message.body,
        metadata: {
          messageId: normalized.message.id,
          conversationId: normalized.conversationId,
          externalId: normalized.message.id,
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


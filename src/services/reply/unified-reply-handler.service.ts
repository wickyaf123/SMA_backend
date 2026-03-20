/**
 * Unified Reply Handler Service
 * Central service for handling replies from all channels (Email, SMS, LinkedIn)
 * 
 * Features:
 * - Stops all active campaigns when a contact replies
 * - Tracks replies in database
 * - Updates contact status
 * - Prevents duplicate outreach
 * - Prepares for email notifications (Day 6)
 */

import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { OutreachChannel } from '@prisma/client';
import { campaignService } from '../campaign/campaign.service';
import { emailNotificationService } from '../notification/email-notification.service';
import { realtimeEmitter } from '../realtime/event-emitter.service';
import { replyClassificationService } from './classification.service';
import { ghlClient } from '../../integrations/ghl/client';
import { settingsService } from '../settings/settings.service';

export interface HandleReplyParams {
  contactId: string;
  channel: OutreachChannel;
  source: 'instantly' | 'ghl' | 'phantombuster';
  replyText: string;
  metadata?: {
    messageId?: string;
    conversationId?: string;
    externalId?: string;
    fromAddress?: string;
    subject?: string;
    threadId?: string;
    [key: string]: any;
  };
}

export interface HandleReplyResult {
  success: boolean;
  contactId: string;
  replyId: string;
  stoppedCampaigns: number;
  contactUpdated: boolean;
  error?: string;
}

class UnifiedReplyHandlerService {
  /**
   * Handle reply from any channel
   * Central orchestration for reply processing
   */
  async handleReply(params: HandleReplyParams): Promise<HandleReplyResult> {
    const { contactId, channel, source, replyText, metadata } = params;

    logger.info(
      {
        contactId,
        channel,
        source,
        replyLength: replyText.length,
      },
      'Processing unified reply'
    );

    try {
      // 1. Verify contact exists
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: {
          id: true,
          email: true,
          fullName: true,
          hasReplied: true,
        },
      });

      if (!contact) {
        logger.warn({ contactId }, 'Contact not found for reply');
        return {
          success: false,
          contactId,
          replyId: '',
          stoppedCampaigns: 0,
          contactUpdated: false,
          error: 'Contact not found',
        };
      }

      // 2. Store reply in database
      const reply = await this.storeReply({
        contactId,
        channel,
        source,
        replyText,
        metadata,
      });

      logger.debug({ replyId: reply.id }, 'Reply stored in database');

      // 3. Stop all active campaigns for this contact
      const stoppedCount = await campaignService.stopAllCampaigns(
        contactId,
        `${channel} reply received via ${source}`
      );

      logger.info(
        { contactId, stoppedCount, channel },
        'Stopped campaigns due to reply'
      );

      // 4. Update contact status
      const contactUpdated = await this.updateContactStatus(contactId, channel);

      // 5. Emit real-time WebSocket event (HIGH PRIORITY)
      realtimeEmitter.emitReplyReceived({
        replyId: reply.id,
        contactId,
        contactName: contact.fullName || undefined,
        contactEmail: contact.email || undefined,
        channel,
        content: replyText.substring(0, 200), // Truncate for notification
        stoppedCampaigns: stoppedCount,
      });

      // 6. Classify reply with Claude Haiku (async, non-blocking)
      this.classifyReplyAsync(reply.id);

      // 7. Trigger GHL reply workflow if configured (async, non-blocking)
      this.triggerGhlReplyWorkflow(contactId, channel);

      // 8. Send email notification (Day 6)
      await this.sendReplyNotification(contact, reply, stoppedCount);

      return {
        success: true,
        contactId,
        replyId: reply.id,
        stoppedCampaigns: stoppedCount,
        contactUpdated,
      };
    } catch (error: any) {
      logger.error(
        {
          contactId,
          channel,
          source,
          error: error.message,
          stack: error.stack,
        },
        'Error handling unified reply'
      );

      return {
        success: false,
        contactId,
        replyId: '',
        stoppedCampaigns: 0,
        contactUpdated: false,
        error: error.message,
      };
    }
  }

  /**
   * Store reply in database
   */
  private async storeReply(params: HandleReplyParams) {
    const { contactId, channel, source, replyText, metadata } = params;

    return await prisma.reply.create({
      data: {
        contactId,
        channel,
        content: replyText,
        receivedAt: new Date(),
        
        // Store metadata fields
        externalId: metadata?.externalId,
        messageId: metadata?.messageId,
        threadId: metadata?.threadId,
        fromAddress: metadata?.fromAddress,
        subject: metadata?.subject,
        
        // Store full metadata as JSON in rawPayload
        rawPayload: {
          source,
          ...metadata,
        },
        
        isProcessed: true,
        processedAt: new Date(),
      },
    });
  }

  /**
   * Update contact status to reflect they have replied
   */
  private async updateContactStatus(
    contactId: string,
    channel: OutreachChannel
  ): Promise<boolean> {
    try {
      await prisma.contact.update({
        where: { id: contactId },
        data: {
          hasReplied: true,
          repliedAt: new Date(),
          repliedChannel: channel,
          status: 'REPLIED',
        },
      });

      logger.debug({ contactId, channel }, 'Contact status updated to REPLIED');
      return true;
    } catch (error: any) {
      logger.error(
        { contactId, error: error.message },
        'Failed to update contact status'
      );
      return false;
    }
  }

  /**
   * Check if contact has already replied
   * Useful for preventing duplicate processing
   */
  async hasContactReplied(contactId: string): Promise<boolean> {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { hasReplied: true },
    });

    return contact?.hasReplied || false;
  }

  /**
   * Get all replies for a contact
   */
  async getContactReplies(contactId: string) {
    return await prisma.reply.findMany({
      where: { contactId },
      orderBy: { receivedAt: 'desc' },
      include: {
        contact: {
          select: {
            id: true,
            email: true,
            fullName: true,
          },
        },
      },
    });
  }

  /**
   * Get reply statistics by channel
   */
  async getReplyStats(options?: {
    startDate?: Date;
    endDate?: Date;
  }) {
    const where: any = {};

    if (options?.startDate || options?.endDate) {
      where.receivedAt = {};
      if (options.startDate) where.receivedAt.gte = options.startDate;
      if (options.endDate) where.receivedAt.lte = options.endDate;
    }

    const [total, byChannel] = await Promise.all([
      prisma.reply.count({ where }),
      prisma.reply.groupBy({
        by: ['channel'],
        where,
        _count: true,
      }),
    ]);

    return {
      total,
      byChannel: byChannel.map((item) => ({
        channel: item.channel,
        count: item._count,
      })),
    };
  }

  /**
   * Classify reply asynchronously (fire-and-forget)
   */
  private classifyReplyAsync(replyId: string): void {
    replyClassificationService.classifyAndStoreReply(replyId).catch((error) => {
      logger.warn({ replyId, error: error.message }, 'Reply classification failed (non-critical)');
    });
  }

  /**
   * Trigger GHL reply workflow based on channel (fire-and-forget)
   */
  private triggerGhlReplyWorkflow(contactId: string, channel: OutreachChannel): void {
    (async () => {
      try {
        const contact = await prisma.contact.findUnique({
          where: { id: contactId },
          select: { ghlContactId: true },
        });

        if (!contact?.ghlContactId) return;

        const settings = await settingsService.getSettings();
        let workflowId: string | null = null;

        if (channel === 'EMAIL' && settings.permitGhlEmailReplyWorkflowId) {
          workflowId = settings.permitGhlEmailReplyWorkflowId;
        } else if (channel === 'SMS' && settings.permitGhlSmsReplyWorkflowId) {
          workflowId = settings.permitGhlSmsReplyWorkflowId;
        }

        if (workflowId) {
          await ghlClient.addContactToWorkflow(contact.ghlContactId, workflowId);
          logger.info({ contactId, channel, workflowId }, 'GHL reply workflow triggered');
        }
      } catch (error: any) {
        logger.warn({ contactId, channel, error: error.message }, 'GHL reply workflow trigger failed (non-critical)');
      }
    })();
  }

  /**
   * Send email notification to team about the reply
   */
  private async sendReplyNotification(
    contact: { id: string; email: string | null; fullName: string | null },
    reply: { id: string; channel: OutreachChannel; content: string | null; receivedAt: Date },
    stoppedCampaigns: number
  ): Promise<void> {
    try {
      // Fetch full contact details including GHL contact ID and company
      const fullContact = await prisma.contact.findUnique({
        where: { id: contact.id },
        select: {
          id: true,
          fullName: true,
          email: true,
          phone: true,
          ghlContactId: true,
          company: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!fullContact) {
        logger.warn({ contactId: contact.id }, 'Contact not found for notification');
        return;
      }

      // Send notification via email service
      await emailNotificationService.sendReplyNotification({
        contact: {
          id: fullContact.id,
          fullName: fullContact.fullName,
          email: fullContact.email,
          phone: fullContact.phone,
          companyName: fullContact.company?.name || null,
          ghlContactId: fullContact.ghlContactId,
        },
        reply: {
          id: reply.id,
          channel: reply.channel,
          content: reply.content,
          receivedAt: reply.receivedAt,
        },
        stoppedCampaigns,
      });

      logger.debug({ contactId: contact.id }, 'Reply notification sent');
    } catch (error: any) {
      // Log error but don't fail the reply handling process
      logger.error(
        { contactId: contact.id, error: error.message },
        'Failed to send reply notification (non-critical)'
      );
    }
  }
}

export const unifiedReplyHandler = new UnifiedReplyHandlerService();


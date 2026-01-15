/**
 * GHL SMS Service
 * Handles SMS sending via GoHighLevel
 * Replaces Twilio for SMS outreach
 */

import { ghlClient } from '../../integrations/ghl/client';
import { ghlContactSyncService } from './ghl-contact-sync.service';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { OutreachChannel } from '@prisma/client';

export interface SendSMSOptions {
  contactId: string;
  message: string;
  campaignId?: string;
  skipSync?: boolean; // Skip GHL contact sync if already synced
}

export interface SMSPreviewResult {
  contactName: string;
  contactPhone: string;
  message: string;
  characterCount: number;
  estimatedSegments: number; // SMS are sent in 160-char segments
  canSend: boolean;
  reason?: string;
}

export interface SMSResult {
  success: boolean;
  conversationId?: string;
  messageId?: string;
  ghlContactId: string;
  error?: string;
}

class GHLSMSService {
  /**
   * Preview an SMS before sending
   */
  async previewSMS(contactId: string, message: string): Promise<SMSPreviewResult> {
    logger.debug({ contactId, messageLength: message.length }, 'Previewing SMS');

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        firstName: true,
        lastName: true,
        fullName: true,
        phone: true,
        phoneValidationStatus: true,
      },
    });

    if (!contact) {
      return {
        contactName: 'Unknown',
        contactPhone: 'N/A',
        message,
        characterCount: message.length,
        estimatedSegments: Math.ceil(message.length / 160),
        canSend: false,
        reason: 'Contact not found',
      };
    }

    if (!contact.phone) {
      return {
        contactName: contact.fullName || `${contact.firstName} ${contact.lastName}`,
        contactPhone: 'No phone',
        message,
        characterCount: message.length,
        estimatedSegments: Math.ceil(message.length / 160),
        canSend: false,
        reason: 'Contact has no phone number',
      };
    }

    if (
      contact.phoneValidationStatus === 'INVALID' ||
      contact.phoneValidationStatus === 'UNKNOWN'
    ) {
      return {
        contactName: contact.fullName || `${contact.firstName} ${contact.lastName}`,
        contactPhone: contact.phone,
        message,
        characterCount: message.length,
        estimatedSegments: Math.ceil(message.length / 160),
        canSend: false,
        reason: `Phone validation status: ${contact.phoneValidationStatus}`,
      };
    }

    return {
      contactName: contact.fullName || `${contact.firstName} ${contact.lastName}`,
      contactPhone: contact.phone,
      message,
      characterCount: message.length,
      estimatedSegments: Math.ceil(message.length / 160),
      canSend: true,
    };
  }

  /**
   * Send an SMS to a contact via GoHighLevel
   */
  async sendSMS(options: SendSMSOptions): Promise<SMSResult> {
    const { contactId, message, campaignId, skipSync = false } = options;

    logger.info({ contactId, campaignId, messageLength: message.length }, 'Sending SMS via GHL');

    // Fetch contact
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        phone: true,
        phoneValidationStatus: true,
        ghlContactId: true,
      },
    });

    if (!contact) {
      return {
        success: false,
        ghlContactId: '',
        error: 'Contact not found',
      };
    }

    if (!contact.phone) {
      return {
        success: false,
        ghlContactId: contact.ghlContactId || '',
        error: 'Contact has no phone number',
      };
    }

    if (
      contact.phoneValidationStatus === 'INVALID' ||
      contact.phoneValidationStatus === 'UNKNOWN'
    ) {
      return {
        success: false,
        ghlContactId: contact.ghlContactId || '',
        error: `Phone validation failed: ${contact.phoneValidationStatus}`,
      };
    }

    // Sync contact to GHL if not already synced or skipSync is false
    let ghlContactId = contact.ghlContactId;
    if (!ghlContactId || !skipSync) {
      try {
        const syncResult = await ghlContactSyncService.syncContactToGHL(contactId);
        ghlContactId = syncResult.ghlContactId;
        logger.debug({ ghlContactId, isNew: syncResult.isNew }, 'Contact synced to GHL');
      } catch (error: any) {
        logger.error({ contactId, error: error.message }, 'Failed to sync contact to GHL');
        return {
          success: false,
          ghlContactId: ghlContactId || '',
          error: `Failed to sync contact to GHL: ${error.message}`,
        };
      }
    }

    // Send SMS via GHL
    try {
      const response = await ghlClient.sendSMS(ghlContactId, message);

      // Store conversation ID in our database
      await prisma.contact.update({
        where: { id: contactId },
        data: {
          ghlConversationId: response.conversationId,
        },
      });

      // If this is part of a campaign, update enrollment status
      if (campaignId) {
        await prisma.campaignEnrollment.updateMany({
          where: {
            campaignId,
            contactId,
          },
          data: {
            status: 'SENT',
          },
        });
      }

      logger.info(
        {
          contactId,
          conversationId: response.conversationId,
          messageId: response.messageId,
        },
        'SMS sent successfully via GHL'
      );

      return {
        success: true,
        conversationId: response.conversationId,
        messageId: response.messageId,
        ghlContactId,
      };
    } catch (error: any) {
      logger.error(
        { contactId, ghlContactId, error: error.message },
        'Failed to send SMS via GHL'
      );
      return {
        success: false,
        ghlContactId,
        error: error.message,
      };
    }
  }

  /**
   * Send bulk SMS to multiple contacts
   */
  async sendBulkSMS(
    contactIds: string[],
    message: string,
    campaignId?: string
  ): Promise<{
    sent: number;
    failed: number;
    results: Array<{ contactId: string; success: boolean; error?: string }>;
  }> {
    logger.info(
      { count: contactIds.length, campaignId },
      'Sending bulk SMS via GHL'
    );

    let sent = 0;
    let failed = 0;
    const results: Array<{ contactId: string; success: boolean; error?: string }> = [];

    for (const contactId of contactIds) {
      const result = await this.sendSMS({ contactId, message, campaignId });

      if (result.success) {
        sent++;
        results.push({ contactId, success: true });
      } else {
        failed++;
        results.push({ contactId, success: false, error: result.error });
      }

      // Rate limit: GHL allows ~10 requests/second
      // Wait 150ms between each SMS to be safe
      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    logger.info({ sent, failed }, 'Bulk SMS sending completed');

    return { sent, failed, results };
  }

  /**
   * Create a conversation for a contact in GHL
   * (useful for preparing SMS campaigns)
   */
  async createConversation(contactId: string): Promise<string> {
    logger.info({ contactId }, 'Creating GHL conversation for contact');

    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      select: { ghlContactId: true, ghlConversationId: true },
    });

    if (!contact) {
      throw new Error(`Contact ${contactId} not found`);
    }

    // Return existing conversation ID if available
    if (contact.ghlConversationId) {
      logger.debug(
        { conversationId: contact.ghlConversationId },
        'Conversation already exists'
      );
      return contact.ghlConversationId;
    }

    // Ensure contact is synced to GHL
    let ghlContactId = contact.ghlContactId;
    if (!ghlContactId) {
      const syncResult = await ghlContactSyncService.syncContactToGHL(contactId);
      ghlContactId = syncResult.ghlContactId;
    }

    // Create conversation
    const conversation = await ghlClient.createConversation(ghlContactId, 'SMS');

    // Store conversation ID
    await prisma.contact.update({
      where: { id: contactId },
      data: { ghlConversationId: conversation.id },
    });

    logger.info({ conversationId: conversation.id }, 'Conversation created');

    return conversation.id;
  }
}

export const ghlSMSService = new GHLSMSService();


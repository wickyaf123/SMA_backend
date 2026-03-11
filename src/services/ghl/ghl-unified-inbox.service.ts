/**
 * GHL Unified Inbox Service
 * Routes replies from all channels (Email, SMS, LinkedIn) to GHL Conversations
 * 
 * This allows users to view and respond to all communications from GHL's app
 */

import { prisma } from '../../config/database';
import { ghlClient } from '../../integrations/ghl/client';
import { logger } from '../../utils/logger';

export interface RouteToGHLParams {
  contactId: string;
  channel: 'EMAIL' | 'SMS' | 'LINKEDIN';
  source: 'instantly' | 'ghl' | 'phantombuster';
  replyText: string;
  metadata?: {
    subject?: string;
    fromEmail?: string;
    fromName?: string;
    threadId?: string;
    messageId?: string;
    timestamp?: string;
    originalSubject?: string;
  };
}

export interface RouteToGHLResult {
  success: boolean;
  ghlContactId?: string;
  ghlConversationId?: string;
  ghlMessageId?: string;
  noteId?: string;
  error?: string;
}

class GHLUnifiedInboxService {
  /**
   * Route a reply from any channel to GHL Conversations
   * This makes the reply visible in GHL's unified inbox
   */
  async routeReplyToGHL(params: RouteToGHLParams): Promise<RouteToGHLResult> {
    const { contactId, channel, source, replyText, metadata } = params;

    logger.info(
      { contactId, channel, source },
      'Routing reply to GHL unified inbox'
    );

    try {
      // 1. Get contact with GHL contact ID
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        select: {
          id: true,
          email: true,
          phone: true,
          fullName: true,
          firstName: true,
          lastName: true,
          ghlContactId: true,
          city: true,
          state: true,
          permitType: true,
          permitCity: true,
          licenseNumber: true,
          tags: true,
          enrichmentData: true,
          company: {
            select: { name: true, website: true },
          },
        },
      });

      if (!contact) {
        logger.warn({ contactId }, 'Contact not found for GHL routing');
        return { success: false, error: 'Contact not found' };
      }

      // 2. Ensure contact is synced to GHL
      let ghlContactId = contact.ghlContactId;
      
      if (!ghlContactId) {
        logger.info({ contactId }, 'Contact not synced to GHL, syncing now');
        
        // Search for existing contact in GHL
        const existingGHLContact = await ghlClient.findContactByEmailOrPhone(
          contact.email || undefined,
          contact.phone || undefined
        );

        if (existingGHLContact) {
          ghlContactId = existingGHLContact.id;
        } else {
          const enrichment = (contact.enrichmentData || {}) as Record<string, any>;
          const permitTags = (contact.tags || []).filter((t: string) => t.startsWith('permit:'));
          const ghlTags = ['auto-synced', 'lead-system', ...permitTags];
          if (contact.permitType) ghlTags.push(`permit-type:${contact.permitType}`);

          const customFields: Array<{ key: string; field_value: string }> = [
            { key: 'permit_type', field_value: contact.permitType || '' },
            { key: 'permit_city', field_value: contact.permitCity || '' },
            { key: 'permit_date', field_value: enrichment.permitDate || '' },
            { key: 'permit_count', field_value: String(enrichment.permitCount || '') },
            { key: 'avg_job_value', field_value: String(enrichment.avgJobValue || '') },
            { key: 'total_job_value', field_value: String(enrichment.totalJobValue || '') },
            { key: 'company_revenue', field_value: enrichment.revenue || '' },
            { key: 'license_number', field_value: contact.licenseNumber || '' },
            { key: 'internal_contact_id', field_value: contact.id },
          ].filter(f => f.field_value !== '');

          const newGHLContact = await ghlClient.createContact({
            firstName: contact.firstName || contact.fullName?.split(' ')[0] || 'Unknown',
            lastName: contact.lastName || contact.fullName?.split(' ').slice(1).join(' ') || undefined,
            email: contact.email || undefined,
            phone: contact.phone || undefined,
            companyName: contact.company?.name || undefined,
            city: contact.city || undefined,
            state: contact.state || undefined,
            website: contact.company?.website || undefined,
            tags: ghlTags,
            source: 'PermitScraper.ai',
            customFields,
          });
          ghlContactId = newGHLContact.id;
        }

        // Update our contact with GHL ID
        await prisma.contact.update({
          where: { id: contactId },
          data: { ghlContactId },
        });

        logger.info({ contactId, ghlContactId }, 'Contact synced to GHL');
      }

      // 3. Route based on channel
      let result: RouteToGHLResult;

      switch (channel) {
        case 'EMAIL':
          result = await this.routeEmailReply(ghlContactId, replyText, metadata);
          break;
        case 'LINKEDIN':
          result = await this.routeLinkedInReply(ghlContactId, replyText, metadata);
          break;
        case 'SMS':
          // SMS replies from GHL are already in GHL, just add note if from external
          if (source !== 'ghl') {
            result = await this.routeSMSReply(ghlContactId, replyText, metadata);
          } else {
            result = { success: true, ghlContactId };
          }
          break;
        default:
          result = await this.addGenericNote(ghlContactId, channel, replyText, metadata);
      }

      result.ghlContactId = ghlContactId;
      return result;

    } catch (error: any) {
      logger.error(
        { contactId, channel, source, error: error.message },
        'Failed to route reply to GHL'
      );
      return { success: false, error: error.message };
    }
  }

  /**
   * Route email reply to GHL
   * Adds a formatted note to the contact that appears in their activity
   */
  private async routeEmailReply(
    ghlContactId: string,
    replyText: string,
    metadata?: RouteToGHLParams['metadata']
  ): Promise<RouteToGHLResult> {
    // Format the note with email reply details
    const subject = metadata?.subject || metadata?.originalSubject || 'Email Reply';
    const timestamp = metadata?.timestamp 
      ? new Date(metadata.timestamp).toLocaleString() 
      : new Date().toLocaleString();
    
    const formattedNote = [
      `📧 EMAIL REPLY RECEIVED`,
      `━━━━━━━━━━━━━━━━━━━━━━━━`,
      metadata?.fromEmail ? `From: ${metadata.fromName || ''} <${metadata.fromEmail}>` : '',
      `Subject: ${subject}`,
      `Time: ${timestamp}`,
      `Source: Instantly`,
      ``,
      `Message:`,
      `─────────────────────────`,
      replyText,
      `─────────────────────────`,
      ``,
      `⚡ Auto-imported from Lead System`,
    ].filter(Boolean).join('\n');

    return this.addNote(ghlContactId, formattedNote);
  }

  /**
   * Route LinkedIn reply to GHL as a note
   * LinkedIn doesn't have a native GHL channel, so we use notes
   */
  private async routeLinkedInReply(
    ghlContactId: string,
    replyText: string,
    metadata?: RouteToGHLParams['metadata']
  ): Promise<RouteToGHLResult> {
    const formattedNote = [
      `🔗 **LinkedIn Reply Received**`,
      metadata?.fromName ? `From: ${metadata.fromName}` : '',
      metadata?.timestamp ? `Time: ${new Date(metadata.timestamp).toLocaleString()}` : '',
      `---`,
      replyText,
    ].filter(Boolean).join('\n');

    return this.addNote(ghlContactId, formattedNote);
  }

  /**
   * Route external SMS reply to GHL
   * Only used for SMS not originating from GHL
   */
  private async routeSMSReply(
    ghlContactId: string,
    replyText: string,
    metadata?: RouteToGHLParams['metadata']
  ): Promise<RouteToGHLResult> {
    const formattedNote = [
      `📱 **SMS Reply Received (External)**`,
      metadata?.timestamp ? `Time: ${new Date(metadata.timestamp).toLocaleString()}` : '',
      `---`,
      replyText,
    ].filter(Boolean).join('\n');

    return this.addNote(ghlContactId, formattedNote);
  }

  /**
   * Add a generic note to contact
   */
  private async addGenericNote(
    ghlContactId: string,
    channel: string,
    replyText: string,
    metadata?: RouteToGHLParams['metadata']
  ): Promise<RouteToGHLResult> {
    const channelEmoji = {
      EMAIL: '📧',
      SMS: '📱',
      LINKEDIN: '🔗',
    }[channel] || '💬';

    const formattedNote = [
      `${channelEmoji} **${channel} Reply Received**`,
      metadata?.fromEmail || metadata?.fromName ? `From: ${metadata.fromName || metadata.fromEmail}` : '',
      metadata?.subject ? `Subject: ${metadata.subject}` : '',
      metadata?.timestamp ? `Time: ${new Date(metadata.timestamp).toLocaleString()}` : '',
      `---`,
      replyText,
    ].filter(Boolean).join('\n');

    return this.addNote(ghlContactId, formattedNote);
  }

  /**
   * Add a note to GHL contact
   * Falls back to adding tags if notes API fails
   */
  private async addNote(ghlContactId: string, body: string): Promise<RouteToGHLResult> {
    try {
      const note = await ghlClient.addContactNote(ghlContactId, body);

      logger.info({ ghlContactId, noteId: note?.id }, 'Note added to GHL contact');

      return {
        success: true,
        noteId: note?.id,
      };
    } catch (error: any) {
      logger.warn(
        { ghlContactId, error: error.message },
        'Notes API failed, trying tags fallback'
      );

      // Fallback: Add tags to mark the contact as having replied
      try {
        const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        await ghlClient.addContactTags(ghlContactId, [
          'email-reply',
          'lead-system-reply',
          `reply-${timestamp}`,
        ]);

        logger.info({ ghlContactId }, 'Tags added as fallback for reply tracking');

        return {
          success: true,
          noteId: 'tags-fallback',
        };
      } catch (tagError: any) {
        logger.error(
          { ghlContactId, error: tagError.message },
          'Both notes and tags failed'
        );
        return { success: false, error: `Notes: ${error.message}, Tags: ${tagError.message}` };
      }
    }
  }
}

export const ghlUnifiedInboxService = new GHLUnifiedInboxService();


import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';
import { ghlSMSService } from './ghl-sms.service';

export interface SendSMSOptions {
  contactId: string;
  message: string;
  variables?: Record<string, string>;
  campaignId?: string;
}

export interface SendSMSResult {
  success: boolean;
  messageSid?: string; // For backwards compatibility (now conversationId)
  conversationId?: string;
  messageId?: string;
  error?: string;
}

/**
 * SMS Outreach Service (now using GoHighLevel)
 * Replaced Twilio with GHL for SMS sending
 * Kept same interface for backwards compatibility
 */
export class SMSOutreachService {

  /**
   * Replace variables in message template
   */
  private replaceVariables(
    template: string,
    contact: any,
    customVars?: Record<string, string>
  ): string {
    let message = template;

    // Replace contact variables
    const vars: Record<string, string> = {
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      fullName: contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
      email: contact.email || '',
      phone: contact.phone || '',
      title: contact.title || '',
      company: contact.company?.name || '',
      companyName: contact.company?.name || '',
      ...customVars,
    };

    // Replace {{variable}} patterns
    Object.entries(vars).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
      message = message.replace(regex, value);
    });

    return message;
  }

  /**
   * Validate message length
   */
  private validateMessageLength(message: string): void {
    const length = message.length;
    
    // SMS segment limits
    // Single segment: 160 chars (GSM-7) or 70 chars (Unicode)
    // Multi-segment: 153 chars per segment (GSM-7) or 67 chars per segment (Unicode)
    
    if (length > 480) { // ~3 segments worth
      throw new AppError(
        `Message too long (${length} chars). Keep under 480 characters (3 SMS segments)`,
        400,
        'SMS_TOO_LONG'
      );
    }

    if (length > 160) {
      logger.warn(
        { length, segments: Math.ceil(length / 153) },
        'SMS message will be split into multiple segments'
      );
    }
  }

  /**
   * Send SMS to a contact (now via GoHighLevel)
   */
  async sendSMS(options: SendSMSOptions): Promise<SendSMSResult> {
    try {
      logger.info(
        { contactId: options.contactId },
        'Sending SMS to contact via GHL'
      );

      // Get contact with company
      const contact = await prisma.contact.findUnique({
        where: { id: options.contactId },
        include: {
          company: {
            select: {
              name: true,
            },
          },
        },
      });

      if (!contact) {
        throw new AppError('Contact not found', 404, 'CONTACT_NOT_FOUND');
      }

      // Check if contact is unsubscribed
      if (contact.status === 'UNSUBSCRIBED') {
        throw new AppError(
          'Contact is unsubscribed',
          400,
          'CONTACT_UNSUBSCRIBED'
        );
      }

      // Check if contact has valid mobile number
      if (!contact.phone) {
        throw new AppError(
          'Contact has no phone number',
          400,
          'NO_PHONE_NUMBER'
        );
      }

      // Replace variables in message
      const message = this.replaceVariables(
        options.message,
        contact,
        options.variables
      );

      // Validate message length
      this.validateMessageLength(message);

      // Send SMS via GoHighLevel
      const result = await ghlSMSService.sendSMS({
        contactId: options.contactId,
        message,
        campaignId: options.campaignId,
      });

      if (!result.success) {
        throw new AppError(
          result.error || 'Failed to send SMS via GHL',
          500,
          'GHL_SMS_FAILED'
        );
      }

      logger.info(
        {
          contactId: contact.id,
          phone: contact.phone,
          conversationId: result.conversationId,
          messageId: result.messageId,
        },
        'SMS sent successfully via GHL'
      );

      // Update contact last contacted time
      await prisma.contact.update({
        where: { id: contact.id },
        data: { lastContactedAt: new Date() },
      });

      return {
        success: true,
        messageSid: result.conversationId, // For backwards compatibility
        conversationId: result.conversationId,
        messageId: result.messageId,
      };
    } catch (error: any) {
      logger.error(
        { error, contactId: options.contactId },
        'Failed to send SMS'
      );

      if (error instanceof AppError) {
        throw error;
      }

      return {
        success: false,
        error: error.message || 'Failed to send SMS',
      };
    }
  }

  /**
   * Send bulk SMS to multiple contacts
   */
  async sendBulkSMS(
    contactIds: string[],
    message: string,
    variables?: Record<string, string>
  ): Promise<{
    success: number;
    failed: number;
    errors: Array<{ contactId: string; error: string }>;
  }> {
    const result = {
      success: 0,
      failed: 0,
      errors: [] as Array<{ contactId: string; error: string }>,
    };

    logger.info(
      { contactCount: contactIds.length },
      'Sending bulk SMS'
    );

    for (const contactId of contactIds) {
      try {
        await this.sendSMS({
          contactId,
          message,
          variables,
        });
        result.success++;
      } catch (error: any) {
        result.failed++;
        result.errors.push({
          contactId,
          error: error.message || 'Unknown error',
        });
        logger.error(
          { error, contactId },
          'Failed to send SMS in bulk operation'
        );
      }

      // Add delay between messages to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    logger.info(
      {
        success: result.success,
        failed: result.failed,
      },
      'Bulk SMS complete'
    );

    return result;
  }

  /**
   * Preview SMS message with variables replaced (now using GHL)
   */
  async previewSMS(
    contactId: string,
    message: string,
    variables?: Record<string, string>
  ): Promise<{
    message: string;
    length: number;
    segments: number;
    contact: {
      phone: string;
      firstName?: string;
      lastName?: string;
    };
  }> {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        company: {
          select: {
            name: true,
          },
        },
      },
    });

    if (!contact) {
      throw new AppError('Contact not found', 404, 'CONTACT_NOT_FOUND');
    }

    const previewMessage = this.replaceVariables(message, contact, variables);
    const length = previewMessage.length;
    const segments = length <= 160 ? 1 : Math.ceil(length / 153);

    return {
      message: previewMessage,
      length,
      segments,
      contact: {
        phone: contact.phone || 'No phone number',
        firstName: contact.firstName || undefined,
        lastName: contact.lastName || undefined,
      },
    };
  }
}

export const smsOutreachService = new SMSOutreachService();


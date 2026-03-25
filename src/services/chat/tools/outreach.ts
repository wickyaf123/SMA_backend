import { ToolDefinition, ToolHandler, ToolRegistry } from './types';
import { prisma } from '../../../config/database';
import { smsOutreachService } from '../../outreach/sms.service';
import { ghlClient } from '../../../integrations/ghl/client';

const definitions: ToolDefinition[] = [
  {
    name: 'send_sms',
    description:
      'Send an SMS message to a contact via GoHighLevel. Supports {{variable}} template placeholders.',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID to send SMS to' },
        message: { type: 'string', description: 'The SMS message body. Supports {{firstName}}, {{lastName}}, {{company}} variables.' },
        campaignId: { type: 'string', description: 'Optional campaign ID to associate with the message' },
      },
      required: ['contactId', 'message'],
    },
  },
];

const handlers: Record<string, ToolHandler> = {
  send_sms: async (input) => {
    if (!ghlClient.isConfigured()) {
      return { success: false, error: 'GoHighLevel is not configured. Set GHL_API_KEY and GHL_LOCATION_ID to enable SMS sending.' };
    }
    // Pre-validate: check contact has phone
    const smsContact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: { phone: true },
    });
    if (!smsContact) {
      return { success: false, error: `Contact not found with ID: ${input.contactId}` };
    }
    if (!smsContact.phone) {
      return { success: false, error: `Contact ${input.contactId} has no phone number. Cannot send SMS.` };
    }
    const smsResult = await smsOutreachService.sendSMS({
      contactId: input.contactId,
      message: input.message,
      campaignId: input.campaignId,
    });

    if (!smsResult.success) {
      return { success: false, error: smsResult.error || 'Failed to send SMS' };
    }

    // Log activity
    await prisma.activityLog.create({
      data: {
        contactId: input.contactId,
        action: 'SMS_SENT',
        channel: 'SMS',
        description: `SMS sent via Jerry AI`,
        actorType: 'ai',
        metadata: {
          conversationId: smsResult.conversationId,
          messageId: smsResult.messageId,
        },
      },
    });

    return {
      success: true,
      data: {
        conversationId: smsResult.conversationId,
        messageId: smsResult.messageId,
        message: 'SMS sent successfully.',
      },
    };
  },
};

export function registerTools(registry: ToolRegistry): void {
  for (const def of definitions) {
    registry.register(def, handlers[def.name]);
  }
}

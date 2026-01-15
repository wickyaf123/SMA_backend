/**
 * GoHighLevel Routes
 * API endpoints for GHL contact sync and SMS management
 */

import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { ghlContactSyncService } from '../services/outreach/ghl-contact-sync.service';
import { ghlSMSService } from '../services/outreach/ghl-sms.service';
import { messageTemplateService } from '../services/templates/message-template.service';
import { prisma } from '../config/database';
import { sendSuccess } from '../utils/response';
import { z } from 'zod';
import { validate } from '../middleware/validate';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

const router = Router();

// ==================== Validation Schemas ====================

const syncContactSchema = z.object({
  contactId: z.string().uuid('Invalid contact ID'),
});

const bulkSyncSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(100),
});

const syncByCriteriaSchema = z.object({
  tags: z.array(z.string()).optional(),
  minDataQuality: z.number().min(0).max(100).optional(),
  dataSources: z.array(z.string()).optional(),
  limit: z.number().min(1).max(1000).optional().default(100),
});

const sendSMSSchema = z.object({
  contactId: z.string().uuid('Invalid contact ID'),
  message: z.string().min(1).max(480, 'Message too long (max 480 characters)'),
  campaignId: z.string().uuid().optional(),
});

const bulkSMSSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(100),
  message: z.string().min(1).max(480),
  campaignId: z.string().uuid().optional(),
});

const sendSMSWithTemplateSchema = z.object({
  contactId: z.string().uuid('Invalid contact ID'),
  templateId: z.string().uuid('Invalid template ID'),
  campaignId: z.string().uuid().optional(),
  customVariables: z.record(z.string()).optional(),
});

const bulkSMSWithTemplateSchema = z.object({
  contactIds: z.array(z.string().uuid()).min(1).max(100),
  templateId: z.string().uuid('Invalid template ID'),
  campaignId: z.string().uuid().optional(),
});

// ==================== Contact Sync Routes ====================

/**
 * POST /api/v1/ghl/sync/contact
 * Sync a single contact to GoHighLevel
 */
router.post(
  '/sync/contact',
  validate(syncContactSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { contactId } = req.body;

      logger.info({ contactId }, 'API: Syncing contact to GHL');

      const result = await ghlContactSyncService.syncContactToGHL(contactId);

      sendSuccess(res, {
        message: result.isNew
          ? 'Contact synced to GHL (created)'
          : 'Contact synced to GHL (updated)',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/ghl/sync/bulk
 * Sync multiple contacts to GoHighLevel
 */
router.post(
  '/sync/bulk',
  validate(bulkSyncSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { contactIds } = req.body;

      logger.info({ count: contactIds.length }, 'API: Bulk syncing contacts to GHL');

      const result = await ghlContactSyncService.bulkSyncToGHL(contactIds);

      sendSuccess(res, {
        message: `Bulk sync completed: ${result.synced} synced, ${result.failed} failed`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/ghl/sync/criteria
 * Sync contacts by criteria to GoHighLevel
 */
router.post(
  '/sync/criteria',
  validate(syncByCriteriaSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const criteria = req.body;

      logger.info({ criteria }, 'API: Syncing contacts by criteria to GHL');

      const result = await ghlContactSyncService.syncContactsByCriteria(criteria);

      sendSuccess(res, {
        message: `Sync completed: ${result.synced} synced, ${result.failed} failed`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== SMS Routes ====================

/**
 * POST /api/v1/ghl/sms/send
 * Send SMS to a contact via GoHighLevel
 */
router.post(
  '/sms/send',
  validate(sendSMSSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { contactId, message, campaignId } = req.body;

      logger.info({ contactId, campaignId }, 'API: Sending SMS via GHL');

      const result = await ghlSMSService.sendSMS({
        contactId,
        message,
        campaignId,
      });

      if (result.success) {
        sendSuccess(res, {
          message: 'SMS sent successfully',
          data: result,
        });
      } else {
        throw new AppError(result.error || 'Failed to send SMS', 500);
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/ghl/sms/bulk
 * Send bulk SMS via GoHighLevel
 */
router.post(
  '/sms/bulk',
  validate(bulkSMSSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { contactIds, message, campaignId } = req.body;

      logger.info(
        { count: contactIds.length, campaignId },
        'API: Sending bulk SMS via GHL'
      );

      const result = await ghlSMSService.sendBulkSMS(contactIds, message, campaignId);

      sendSuccess(res, {
        message: `Bulk SMS completed: ${result.sent} sent, ${result.failed} failed`,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/ghl/sms/preview
 * Preview SMS before sending
 */
router.post(
  '/sms/preview',
  validate(sendSMSSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { contactId, message } = req.body;

      logger.debug({ contactId }, 'API: Previewing SMS');

      const preview = await ghlSMSService.previewSMS(contactId, message);

      sendSuccess(res, {
        message: 'SMS preview generated',
        data: preview,
      });
    } catch (error) {
      next(error);
    }
  }
);

// ==================== Template-Based SMS Routes ====================

/**
 * POST /api/v1/ghl/sms/send-template
 * Send SMS using a template
 */
router.post(
  '/sms/send-template',
  validate(sendSMSWithTemplateSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { contactId, templateId, campaignId, customVariables } = req.body;

      logger.info({ contactId, templateId, campaignId }, 'API: Sending SMS with template via GHL');

      // Get contact data for personalization
      const contact = await prisma.contact.findUnique({
        where: { id: contactId },
        include: { company: true },
      });

      if (!contact) {
        throw new AppError('Contact not found', 404);
      }

      // Build contact variables for template
      const contactVariables: Record<string, string> = {
        firstName: contact.firstName || '',
        lastName: contact.lastName || '',
        fullName: contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
        email: contact.email || '',
        phone: contact.phone || '',
        title: contact.title || '',
        company: contact.company?.name || '',
        companyName: contact.company?.name || '',
        ...customVariables,
      };

      // Personalize the template
      const personalized = await messageTemplateService.personalizeTemplate(
        templateId,
        contactVariables
      );

      // Send the SMS
      const result = await ghlSMSService.sendSMS({
        contactId,
        message: personalized.body,
        campaignId,
      });

      if (result.success) {
        sendSuccess(res, {
          message: 'SMS sent successfully using template',
          data: {
            ...result,
            templateId,
            personalizedMessage: personalized.body,
          },
        });
      } else {
        throw new AppError(result.error || 'Failed to send SMS', 500);
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/ghl/sms/bulk-template
 * Send bulk SMS using a template
 */
router.post(
  '/sms/bulk-template',
  validate(bulkSMSWithTemplateSchema, 'body'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { contactIds, templateId, campaignId } = req.body;

      logger.info(
        { count: contactIds.length, templateId, campaignId },
        'API: Sending bulk SMS with template via GHL'
      );

      // Get the template
      const template = await messageTemplateService.getTemplate(templateId);

      // Get all contacts with company data
      const contacts = await prisma.contact.findMany({
        where: { id: { in: contactIds } },
        include: { company: true },
      });

      let sent = 0;
      let failed = 0;
      const results: any[] = [];
      const errors: string[] = [];

      for (const contact of contacts) {
        try {
          // Build contact variables
          const contactVariables: Record<string, string> = {
            firstName: contact.firstName || '',
            lastName: contact.lastName || '',
            fullName: contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
            email: contact.email || '',
            phone: contact.phone || '',
            title: contact.title || '',
            company: contact.company?.name || '',
            companyName: contact.company?.name || '',
          };

          // Personalize the message
          const personalizedMessage = messageTemplateService.replaceVariables(
            template.body,
            contactVariables
          );

          // Send SMS
          const result = await ghlSMSService.sendSMS({
            contactId: contact.id,
            message: personalizedMessage,
            campaignId,
          });

          if (result.success) {
            sent++;
            results.push({
              contactId: contact.id,
              success: true,
              message: personalizedMessage,
            });
          } else {
            failed++;
            errors.push(`Contact ${contact.id}: ${result.error}`);
          }
        } catch (error: any) {
          failed++;
          errors.push(`Contact ${contact.id}: ${error.message}`);
        }
      }

      // Update template usage count
      await prisma.messageTemplate.update({
        where: { id: templateId },
        data: {
          usageCount: { increment: sent },
          lastUsedAt: new Date(),
        },
      });

      sendSuccess(res, {
        message: `Bulk SMS completed: ${sent} sent, ${failed} failed`,
        data: {
          templateId,
          sent,
          failed,
          total: contactIds.length,
          results,
          errors,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/ghl/sms/preview-template
 * Preview SMS with template before sending
 */
router.post(
  '/sms/preview-template',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { contactId, templateId } = req.body;

      logger.debug({ contactId, templateId }, 'API: Previewing SMS with template');

      // If contactId provided, use real contact data
      let contactVariables: Record<string, string>;

      if (contactId) {
        const contact = await prisma.contact.findUnique({
          where: { id: contactId },
          include: { company: true },
        });

        if (!contact) {
          throw new AppError('Contact not found', 404);
        }

        contactVariables = {
          firstName: contact.firstName || '',
          lastName: contact.lastName || '',
          fullName: contact.fullName || `${contact.firstName || ''} ${contact.lastName || ''}`.trim(),
          email: contact.email || '',
          phone: contact.phone || '',
          title: contact.title || '',
          company: contact.company?.name || '',
          companyName: contact.company?.name || '',
        };
      } else {
        // Use sample data
        contactVariables = {
          firstName: 'John',
          lastName: 'Smith',
          fullName: 'John Smith',
          email: 'john@example.com',
          phone: '+1234567890',
          title: 'Owner',
          company: 'ABC Company',
          companyName: 'ABC Company',
        };
      }

      const preview = await messageTemplateService.previewTemplate(templateId, contactVariables);

      sendSuccess(res, {
        message: 'Template preview generated',
        data: preview,
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;


import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';
import { successResponse, sendError } from '../utils/response';
import { ApolloMobilePhoneWebhookPayload } from '../integrations/apollo/types';

/**
 * Webhook Controller
 * Handles incoming webhooks from external services
 * 
 * NOTE: Primary webhook handlers are in dedicated controllers:
 * - Instantly (Email): /webhooks/instantly/* → see webhook/instantly.controller.ts
 * - GoHighLevel (SMS): /webhooks/ghl/* → see webhook/ghl.controller.ts
 * 
 * This controller handles:
 * - Apollo mobile phone webhooks
 * - Legacy/fallback endpoints (deprecated)
 */
export class WebhookController {
  /**
   * Handle Apollo mobile phone webhook
   * POST /api/v1/webhooks/apollo/phones
   * 
   * This endpoint receives async callbacks from Apollo with mobile phone numbers.
   * No authentication required - Apollo doesn't support webhook signatures yet.
   */
  public async handleApolloPhones(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const payload = req.body;
      
      // Apollo sends an array of people in the "people" field
      const people = payload.people || [];
      
      logger.info({
        peopleCount: people.length,
        status: payload.status,
        creditsConsumed: payload.credits_consumed,
      }, 'Received Apollo mobile phone webhook');

      if (!people || people.length === 0) {
        logger.warn({ body: req.body }, 'Invalid Apollo webhook payload - no people data');
        sendError(res, 400, 'Invalid payload', 'VALIDATION_ERROR');
        return;
      }

      let updatedCount = 0;
      let notFoundCount = 0;
      let noPhoneCount = 0;

      // Process each person in the webhook
      for (const person of people) {
        const { id: apolloId, phone_numbers } = person;

        if (!apolloId) {
          logger.warn({ person }, 'Skipping person without ID');
          continue;
        }

        // Find contact by Apollo ID
        const contact = await prisma.contact.findFirst({
          where: { apolloId },
        });

        if (!contact) {
          logger.warn({ apolloId }, 'Contact not found for mobile phone update');
          notFoundCount++;
          continue;
        }

        if (!phone_numbers || phone_numbers.length === 0) {
          logger.info({ apolloId, contactId: contact.id }, 'No phone numbers in webhook for this person');
          noPhoneCount++;
          continue;
        }

        // Extract mobile phone (prioritize mobile over other types)
        const mobilePhone = phone_numbers.find((p: any) => 
          p.type_cd === 'mobile'
        );
        
        // Fallback to work_direct or first available
        const fallbackPhone = !mobilePhone && phone_numbers.length > 0
          ? phone_numbers.find((p: any) => p.type_cd === 'work_direct') || phone_numbers[0]
          : null;
        
        const phoneToUse = mobilePhone || fallbackPhone;

        if (phoneToUse) {
          const phoneValidationStatus = phoneToUse.type_cd === 'mobile' 
            ? 'VALID_MOBILE' 
            : phoneToUse.type_cd === 'work_direct' || phoneToUse.type_cd === 'work'
            ? 'VALID_LANDLINE'
            : 'PENDING';

          await prisma.contact.update({
            where: { id: contact.id },
            data: {
              phone: phoneToUse.sanitized_number || phoneToUse.raw_number,
              phoneFormatted: phoneToUse.sanitized_number,
              phoneValidationStatus: phoneValidationStatus as any,
              phoneValidatedAt: new Date(),
            },
          });

          logger.info({
            contactId: contact.id,
            apolloId,
            phone: phoneToUse.sanitized_number,
            type: phoneToUse.type_cd,
          }, '📱 Phone updated from Apollo webhook');
          
          updatedCount++;
        }
      }

      logger.info({
        totalPeople: people.length,
        updated: updatedCount,
        notFound: notFoundCount,
        noPhone: noPhoneCount,
      }, 'Apollo webhook processing complete');

      res.json(successResponse({ 
        received: true, 
        processed: people.length,
        updated: updatedCount,
        notFound: notFoundCount,
        noPhone: noPhoneCount,
      }));
    } catch (error) {
      logger.error({ 
        error, 
        body: req.body,
      }, 'Error processing Apollo phone webhook');
      next(error);
    }
  }

  /**
   * Handle Instantly email webhooks (DEPRECATED)
   * POST /api/v1/webhooks/instantly/email
   * 
   * @deprecated Use POST /webhooks/instantly instead - see webhook/instantly.controller.ts
   * This endpoint is kept for backwards compatibility but redirects to the main handler.
   */
  public async handleInstantlyEmail(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      logger.warn(
        { body: req.body }, 
        'DEPRECATED: Instantly webhook received at legacy endpoint. Use /webhooks/instantly instead'
      );
      // Acknowledge receipt but log deprecation warning
      res.json(successResponse({ 
        received: true,
        warning: 'This endpoint is deprecated. Please use POST /webhooks/instantly instead.'
      }));
    } catch (error) {
      logger.error({ error, body: req.body }, 'Error processing Instantly webhook');
      next(error);
    }
  }

  /**
   * Handle Twilio SMS webhooks (NOT IMPLEMENTED)
   * POST /api/v1/webhooks/twilio/sms
   * 
   * NOTE: SMS handling is done via GoHighLevel, not Twilio.
   * Twilio is only used for phone number validation (Lookup API).
   * For SMS replies, use the GHL webhook: POST /webhooks/ghl/reply
   */
  public async handleTwilioSms(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      logger.warn(
        { body: req.body }, 
        'Twilio SMS webhook received but not implemented. SMS handling is done via GoHighLevel.'
      );
      res.json(successResponse({ 
        received: true,
        message: 'SMS handling is done via GoHighLevel. Use /webhooks/ghl/reply for SMS replies.'
      }));
    } catch (error) {
      logger.error({ error, body: req.body }, 'Error processing Twilio webhook');
      next(error);
    }
  }
}

export const webhookController = new WebhookController();


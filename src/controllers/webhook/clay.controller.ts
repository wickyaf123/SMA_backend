import { Request, Response } from 'express';
import { clayClient } from '../../integrations/clay/client';
import { clayEnrichmentService } from '../../services/enrichment/clay.service';
import { logger } from '../../utils/logger';

export async function handleClayWebhook(req: Request, res: Response) {
  res.status(200).json({ received: true });

  try {
    const signature = req.headers['x-clay-signature'] as string || '';
    const rawBody = JSON.stringify(req.body);

    if (!clayClient.validateWebhook(signature, rawBody)) {
      logger.warn('Clay webhook signature validation failed');
      return;
    }

    const { contactId, email, phone } = req.body;
    if (!contactId) {
      logger.warn({ body: req.body }, 'Clay webhook missing contactId');
      return;
    }

    await clayEnrichmentService.handleWebhookCallback({ contactId, email, phone });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Clay webhook processing failed');
  }
}

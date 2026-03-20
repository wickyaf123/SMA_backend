import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';
import { instantlyWebhookController } from '../controllers/webhook/instantly.controller';
import { phantomBusterWebhookController } from '../controllers/webhook/phantombuster.controller';
import { ghlWebhookController } from '../controllers/webhook/ghl.controller';
import { handleClayWebhook } from '../controllers/webhook/clay.controller';
import { webhookLogController } from '../controllers/webhook-log.controller';

const router = Router();

/**
 * Webhook Routes
 * 
 * These endpoints receive callbacks from external services like
 * Apollo, Instantly, PhantomBuster, and GoHighLevel.
 */

// Apollo webhooks
router.post(
  '/apollo/phones',
  webhookController.handleApolloPhones.bind(webhookController)
);

// Instantly webhooks
router.post(
  '/instantly',
  instantlyWebhookController.handleWebhook.bind(instantlyWebhookController)
);

// PhantomBuster webhooks
router.post(
  '/phantombuster',
  phantomBusterWebhookController.handleWebhook.bind(phantomBusterWebhookController)
);

// GoHighLevel webhooks (replaces Twilio)
router.post(
  '/ghl/reply',
  ghlWebhookController.handleWebhook.bind(ghlWebhookController)
);

// Clay enrichment webhooks
router.post('/clay', handleClayWebhook);

/**
 * Webhook Logs
 */
router.get(
  '/logs',
  webhookLogController.getLogs.bind(webhookLogController)
);

router.get(
  '/logs/recent',
  webhookLogController.getRecent.bind(webhookLogController)
);

router.get(
  '/logs/stats',
  webhookLogController.getStats.bind(webhookLogController)
);

export default router;


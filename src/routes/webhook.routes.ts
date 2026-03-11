import { Router } from 'express';
import { webhookController } from '../controllers/webhook.controller';
import { instantlyWebhookController } from '../controllers/webhook/instantly.controller';
import { phantomBusterWebhookController } from '../controllers/webhook/phantombuster.controller';
import { ghlWebhookController } from '../controllers/webhook/ghl.controller';
import { handleClayWebhook } from '../controllers/webhook/clay.controller';
import { webhookLogController } from '../controllers/webhook-log.controller';
import { authenticateApiKey } from '../middleware/auth';

const router = Router();

/**
 * Webhook Routes
 * 
 * These endpoints are PUBLIC (no authentication required) as they receive
 * callbacks from external services like Apollo, Instantly, PhantomBuster, and GoHighLevel.
 * 
 * Security Note: In production, implement webhook signature verification
 * where supported by the provider.
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
 * Webhook Logs (protected - requires authentication)
 */

// GET /webhooks/logs - Get webhook logs with pagination
router.get(
  '/logs',
  authenticateApiKey,
  webhookLogController.getLogs.bind(webhookLogController)
);

// GET /webhooks/logs/recent - Get recent webhook logs
router.get(
  '/logs/recent',
  authenticateApiKey,
  webhookLogController.getRecent.bind(webhookLogController)
);

// GET /webhooks/logs/stats - Get webhook statistics
router.get(
  '/logs/stats',
  authenticateApiKey,
  webhookLogController.getStats.bind(webhookLogController)
);

export default router;


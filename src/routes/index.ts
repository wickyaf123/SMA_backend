import { Router } from 'express';
import healthRoutes from './health.routes';
import contactRoutes from './contact.routes';
import companyRoutes from './company.routes';
import campaignRoutes from './campaign.routes';
import webhookRoutes from './webhook.routes';
import ghlRoutes from './ghl.routes';
import settingsRoutes from './settings.routes';
import jobsRoutes from './jobs.routes';
import activityRoutes from './activity.routes';
import templateRoutes from './template.routes';
import metricsRoutes from './metrics.routes';
import contractorRoutes from './contractor.routes';
import scraperRoutes from './scraper.routes';
import queueRoutes from './queue.routes';
import permitRoutes from './permit.routes';
import { authenticateApiKey } from '../middleware/auth';

const router = Router();

/**
 * API v1 Routes
 * All routes under /api/v1
 */

// Health and system routes (public)
router.use(healthRoutes);

// Webhooks (public - no auth, validated by provider signatures)
// Note: /webhooks/logs requires auth (handled inside webhook.routes.ts)
router.use('/api/v1/webhooks', webhookRoutes);

// Phase 2: Lead Ingestion & Contact Management (protected)
router.use('/contacts', authenticateApiKey, contactRoutes);
router.use('/companies', authenticateApiKey, companyRoutes);

// Phase 3/4: Campaign Management & Outreach (protected)
router.use('/campaigns', authenticateApiKey, campaignRoutes);

// Phase 3.5: GoHighLevel Integration (protected)
router.use('/ghl', authenticateApiKey, ghlRoutes);

// Phase 3.5 Day 7: Settings Management (protected)
router.use('/api/v1/settings', authenticateApiKey, settingsRoutes);

// Phase 3.5 Day 8: Jobs Management (protected)
router.use('/api/v1/jobs', authenticateApiKey, jobsRoutes);

// Activity Logs (protected)
router.use('/activity', authenticateApiKey, activityRoutes);

// Message Templates (protected)
router.use('/templates', authenticateApiKey, templateRoutes);

// Metrics & Analytics (protected)
router.use('/api/v1/metrics', authenticateApiKey, metricsRoutes);

// Contractor Lead Generation (protected)
router.use('/api/v1/contractors', authenticateApiKey, contractorRoutes);

// Scraper Services (protected)
router.use('/api/v1/scraper', authenticateApiKey, scraperRoutes);

// Queue Management (protected)
router.use('/api/v1/queues', authenticateApiKey, queueRoutes);

// Permit Intelligence (protected)
router.use('/api/v1/permits', authenticateApiKey, permitRoutes);

// Additional routes will be added in future phases:
// router.use('/dashboard', dashboardRoutes);     // Phase 6

export default router;


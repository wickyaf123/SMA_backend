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
import homeownerRoutes from './homeowner.routes';
import connectionRoutes from './connection.routes';
import chatRoutes from './chat.routes';

const router = Router();

/**
 * API v1 Routes
 * All routes under /api/v1
 */

// Health and system routes
router.use(healthRoutes);

// Webhooks (validated by provider signatures)
router.use('/api/v1/webhooks', webhookRoutes);

// Lead Ingestion & Contact Management
router.use('/api/v1/contacts', contactRoutes);
router.use('/api/v1/companies', companyRoutes);

// Campaign Management & Outreach
router.use('/api/v1/campaigns', campaignRoutes);

// GoHighLevel Integration
router.use('/api/v1/ghl', ghlRoutes);

// Settings Management
router.use('/api/v1/settings', settingsRoutes);

// Jobs Management
router.use('/api/v1/jobs', jobsRoutes);

// Activity Logs
router.use('/api/v1/activity', activityRoutes);

// Message Templates
router.use('/api/v1/templates', templateRoutes);

// Metrics & Analytics
router.use('/api/v1/metrics', metricsRoutes);

// Contractor Lead Generation
router.use('/api/v1/contractors', contractorRoutes);

// Scraper Services
router.use('/api/v1/scraper', scraperRoutes);

// Queue Management
router.use('/api/v1/queues', queueRoutes);

// Permit Intelligence
router.use('/api/v1/permits', permitRoutes);

// Homeowner Data
router.use('/api/v1/homeowners', homeownerRoutes);

// Contractor-Homeowner Connections
router.use('/api/v1/connections', connectionRoutes);

// Chat / Jerry AI
router.use('/api/v1/chat', chatRoutes);

export default router;


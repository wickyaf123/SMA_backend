import { Router } from 'express';
import { authMiddleware } from '../middleware/auth';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
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

// Health and system routes (no auth)
router.use(healthRoutes);

// Auth routes (no auth required for register/login/refresh/logout; /me and /password apply their own auth)
router.use('/api/v1/auth', authRoutes);

// Webhooks — validated by provider signatures, not JWT (no auth middleware)
router.use('/api/v1/webhooks', webhookRoutes);

// ----- All routes below require authentication -----

// Lead Ingestion & Contact Management
router.use('/api/v1/contacts', authMiddleware, contactRoutes);
router.use('/api/v1/companies', authMiddleware, companyRoutes);

// Campaign Management & Outreach
router.use('/api/v1/campaigns', authMiddleware, campaignRoutes);

// GoHighLevel Integration
router.use('/api/v1/ghl', authMiddleware, ghlRoutes);

// Settings Management
router.use('/api/v1/settings', authMiddleware, settingsRoutes);

// Jobs Management
router.use('/api/v1/jobs', authMiddleware, jobsRoutes);

// Activity Logs
router.use('/api/v1/activity', authMiddleware, activityRoutes);

// Message Templates
router.use('/api/v1/templates', authMiddleware, templateRoutes);

// Metrics & Analytics
router.use('/api/v1/metrics', authMiddleware, metricsRoutes);

// Contractor Lead Generation
router.use('/api/v1/contractors', authMiddleware, contractorRoutes);

// Scraper Services
router.use('/api/v1/scraper', authMiddleware, scraperRoutes);

// Queue Management
router.use('/api/v1/queues', authMiddleware, queueRoutes);

// Permit Intelligence
router.use('/api/v1/permits', authMiddleware, permitRoutes);

// Homeowner Data
router.use('/api/v1/homeowners', authMiddleware, homeownerRoutes);

// Contractor-Homeowner Connections
router.use('/api/v1/connections', authMiddleware, connectionRoutes);

// Chat / Jerry AI
router.use('/api/v1/chat', authMiddleware, chatRoutes);

export default router;

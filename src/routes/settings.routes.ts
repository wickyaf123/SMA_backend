/**
 * Settings Routes
 * Phase 3.5 Day 7
 */

import { Router } from 'express';
import { settingsController } from '../controllers/settings.controller';

const router = Router();

/**
 * GET /api/v1/settings
 * Get global settings
 */
router.get('/', settingsController.getSettings.bind(settingsController));

/**
 * PATCH /api/v1/settings
 * Update global settings
 */
router.patch('/', settingsController.updateSettings.bind(settingsController));

/**
 * POST /api/v1/settings/linkedin/enable
 * Enable LinkedIn globally
 */
router.post('/linkedin/enable', settingsController.enableLinkedIn.bind(settingsController));

/**
 * POST /api/v1/settings/linkedin/disable
 * Disable LinkedIn globally
 */
router.post('/linkedin/disable', settingsController.disableLinkedIn.bind(settingsController));

/**
 * GET /api/v1/settings/linkedin/check/:campaignId
 * Check if LinkedIn is enabled for a specific campaign
 */
router.get('/linkedin/check/:campaignId', settingsController.checkLinkedInForCampaign.bind(settingsController));

/**
 * POST /api/v1/settings/default-campaigns/email
 * Set default email campaign for auto-enrollment
 */
router.post('/default-campaigns/email', settingsController.setDefaultEmailCampaign.bind(settingsController));

/**
 * POST /api/v1/settings/default-campaigns/sms
 * Set default SMS campaign for auto-enrollment
 */
router.post('/default-campaigns/sms', settingsController.setDefaultSmsCampaign.bind(settingsController));

// ==================== SCRAPER CONFIGURATION ====================

/**
 * GET /api/v1/settings/scrapers
 * Get all scraper settings
 */
router.get('/scrapers', settingsController.getScraperSettings.bind(settingsController));

/**
 * GET /api/v1/settings/scrapers/shovels
 * Get Shovels scraper settings
 */
router.get('/scrapers/shovels', settingsController.getShovelsSettings.bind(settingsController));

/**
 * PATCH /api/v1/settings/scrapers/shovels
 * Update Shovels scraper settings
 */
router.patch('/scrapers/shovels', settingsController.updateShovelsSettings.bind(settingsController));

// ==================== HOMEOWNER SCRAPER ====================

/**
 * GET /api/v1/settings/scrapers/homeowner
 * Get homeowner scraper settings
 */
router.get('/scrapers/homeowner', settingsController.getHomeownerSettings.bind(settingsController));

/**
 * PATCH /api/v1/settings/scrapers/homeowner
 * Update homeowner scraper settings
 */
router.patch('/scrapers/homeowner', settingsController.updateHomeownerSettings.bind(settingsController));

// ==================== PERMIT ROUTING ====================

/**
 * GET /api/v1/settings/permit-routing
 * Get permit routing settings
 */
router.get('/permit-routing', settingsController.getPermitRoutingSettings.bind(settingsController));

/**
 * PATCH /api/v1/settings/permit-routing
 * Update permit routing settings
 */
router.patch('/permit-routing', settingsController.updatePermitRoutingSettings.bind(settingsController));

// ==================== PIPELINE CONTROL ====================

/**
 * GET /api/v1/settings/pipeline
 * Get pipeline control settings
 */
router.get('/pipeline', settingsController.getPipelineControls.bind(settingsController));

/**
 * PATCH /api/v1/settings/pipeline
 * Update pipeline control settings
 */
router.patch('/pipeline', settingsController.updatePipelineControls.bind(settingsController));

/**
 * POST /api/v1/settings/pipeline/emergency-stop
 * Emergency stop - stops all outreach immediately
 */
router.post('/pipeline/emergency-stop', settingsController.emergencyStop.bind(settingsController));

/**
 * POST /api/v1/settings/pipeline/resume
 * Resume pipeline after emergency stop
 */
router.post('/pipeline/resume', settingsController.resumePipeline.bind(settingsController));

// ==================== SCHEDULE CONFIGURATION ====================

/**
 * GET /api/v1/settings/schedules/templates
 * Get all available schedule templates
 */
router.get('/schedules/templates', settingsController.getScheduleTemplates.bind(settingsController));

/**
 * GET /api/v1/settings/schedules
 * Get current schedule settings
 */
router.get('/schedules', settingsController.getScheduleSettings.bind(settingsController));

/**
 * POST /api/v1/settings/schedules/apply-template
 * Apply a schedule template
 */
router.post('/schedules/apply-template', settingsController.applyScheduleTemplate.bind(settingsController));

/**
 * PATCH /api/v1/settings/schedules
 * Update custom schedules
 */
router.patch('/schedules', settingsController.updateSchedules.bind(settingsController));

/**
 * GET /api/v1/settings/schedules/status
 * Get scheduler status
 */
router.get('/schedules/status', settingsController.getSchedulerStatus.bind(settingsController));

/**
 * POST /api/v1/settings/schedules/trigger/:jobName
 * Manually trigger a job
 */
router.post('/schedules/trigger/:jobName', settingsController.triggerJob.bind(settingsController));

/**
 * POST /api/v1/settings/schedules/reload
 * Reload scheduler (re-read schedules from database)
 */
router.post('/schedules/reload', settingsController.reloadScheduler.bind(settingsController));

export default router;


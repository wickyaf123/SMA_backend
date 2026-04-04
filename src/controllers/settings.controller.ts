/**
 * Settings Controller
 * Manage global application settings
 * Phase 3.5 Day 7
 */

import { Request, Response, NextFunction } from 'express';
import { settingsService } from '../services/settings/settings.service';
import { sendSuccess } from '../utils/response';
import { logger } from '../utils/logger';
import { getScheduler, reloadScheduler } from '../jobs/scheduler';
import { getAllScheduleTemplates } from '../config/schedule-templates';

export class SettingsController {
  /**
   * Get global settings
   * GET /api/v1/settings
   */
  async getSettings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const settings = await settingsService.getSettings(userId);
      sendSuccess(res, settings);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update global settings
   * PATCH /api/v1/settings
   */
  async updateSettings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const settings = await settingsService.updateSettings(req.body, userId);
      sendSuccess(res, settings);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Enable LinkedIn globally
   * POST /api/v1/settings/linkedin/enable
   */
  async enableLinkedIn(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const settings = await settingsService.enableLinkedIn();
      sendSuccess(res, {
        linkedinGloballyEnabled: settings.linkedinGloballyEnabled,
        message: 'LinkedIn enabled globally',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Disable LinkedIn globally
   * POST /api/v1/settings/linkedin/disable
   */
  async disableLinkedIn(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const settings = await settingsService.disableLinkedIn();
      logger.warn('LinkedIn disabled globally');
      sendSuccess(res, {
        linkedinGloballyEnabled: settings.linkedinGloballyEnabled,
        message: 'LinkedIn disabled globally',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Check if LinkedIn is enabled for a campaign
   * GET /api/v1/settings/linkedin/check/:campaignId
   */
  async checkLinkedInForCampaign(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { campaignId } = req.params;
      const enabled = await settingsService.isLinkedInEnabledForCampaign(campaignId);
      
      sendSuccess(res, {
        campaignId,
        linkedinEnabled: enabled,
        message: enabled 
          ? 'LinkedIn is enabled for this campaign' 
          : 'LinkedIn is disabled for this campaign',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Set default email campaign
   * POST /api/v1/settings/default-campaigns/email
   */
  async setDefaultEmailCampaign(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { campaignId } = req.body;
      
      if (!campaignId) {
        sendSuccess(res, { error: 'campaignId is required' }, 400);
        return;
      }

      const settings = await settingsService.setDefaultEmailCampaign(campaignId);
      
      sendSuccess(res, {
        defaultEmailCampaignId: settings.defaultEmailCampaignId,
        message: 'Default email campaign set successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Set default SMS campaign
   * POST /api/v1/settings/default-campaigns/sms
   */
  async setDefaultSmsCampaign(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { campaignId } = req.body;
      
      if (!campaignId) {
        sendSuccess(res, { error: 'campaignId is required' }, 400);
        return;
      }

      const settings = await settingsService.setDefaultSmsCampaign(campaignId);
      
      sendSuccess(res, {
        defaultSmsCampaignId: settings.defaultSmsCampaignId,
        message: 'Default SMS campaign set successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== SCRAPER CONFIGURATION ====================

  /**
   * Get all scraper settings
   * GET /api/v1/settings/scrapers
   */
  async getScraperSettings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const settings = await settingsService.getScraperSettings();
      sendSuccess(res, settings);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get Shovels scraper settings
   * GET /api/v1/settings/scrapers/shovels
   */
  async getShovelsSettings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const settings = await settingsService.getShovelsSettings();
      sendSuccess(res, settings);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update Shovels scraper settings
   * PATCH /api/v1/settings/scrapers/shovels
   */
  async updateShovelsSettings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const settings = await settingsService.updateShovelsSettings(req.body);
      sendSuccess(res, {
        ...settings,
        message: 'Shovels scraper settings updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== HOMEOWNER SCRAPER ====================

  async getHomeownerSettings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const settings = await settingsService.getHomeownerSettings();
      sendSuccess(res, settings);
    } catch (error) {
      next(error);
    }
  }

  async updateHomeownerSettings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const settings = await settingsService.updateHomeownerSettings(req.body);
      sendSuccess(res, {
        ...settings,
        message: 'Homeowner scraper settings updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== PIPELINE CONTROL ====================

  /**
   * Get pipeline control settings
   * GET /api/v1/settings/pipeline
   */
  async getPipelineControls(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const controls = await settingsService.getPipelineControls();
      sendSuccess(res, controls);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update pipeline control settings
   * PATCH /api/v1/settings/pipeline
   */
  async updatePipelineControls(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const controls = await settingsService.updatePipelineControls(req.body);
      sendSuccess(res, {
        ...controls,
        message: 'Pipeline controls updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Emergency stop - stops all outreach immediately
   * POST /api/v1/settings/pipeline/emergency-stop
   */
  async emergencyStop(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const stoppedBy = req.body.stoppedBy || 'admin';
      logger.warn({ stoppedBy, ip: req.ip }, '⚠️ EMERGENCY STOP REQUESTED');
      
      const controls = await settingsService.emergencyStop(stoppedBy);
      sendSuccess(res, {
        ...controls,
        message: '⚠️ EMERGENCY STOP ACTIVATED - All outreach has been disabled',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Resume pipeline after emergency stop
   * POST /api/v1/settings/pipeline/resume
   */
  async resumePipeline(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      logger.info({ ip: req.ip }, 'Pipeline resume requested');
      const controls = await settingsService.resumePipeline();
      sendSuccess(res, {
        ...controls,
        message: '✅ Pipeline resumed - All systems enabled',
      });
    } catch (error) {
      next(error);
    }
  }

  // ==================== SCHEDULE CONFIGURATION ====================

  /**
   * Get all available schedule templates
   * GET /api/v1/settings/schedules/templates
   */
  async getScheduleTemplates(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const templates = getAllScheduleTemplates();
      sendSuccess(res, { templates });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get current schedule settings
   * GET /api/v1/settings/schedules
   */
  async getScheduleSettings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const schedules = await settingsService.getScheduleSettings();
      const scheduler = getScheduler();
      const status = scheduler?.getStatus() || { isRunning: false, jobs: [] };
      
      sendSuccess(res, {
        ...schedules,
        schedulerStatus: status,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Apply a schedule template
   * POST /api/v1/settings/schedules/apply-template
   */
  async applyScheduleTemplate(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { templateId } = req.body;
      
      if (!templateId) {
        sendSuccess(res, { error: 'templateId is required' }, 400);
        return;
      }

      logger.info({ templateId }, 'Applying schedule template');
      const schedules = await settingsService.applyScheduleTemplate(templateId);
      
      // Reload the scheduler with new settings
      await reloadScheduler();
      
      const scheduler = getScheduler();
      const status = scheduler?.getStatus() || { isRunning: false, jobs: [] };

      sendSuccess(res, {
        ...schedules,
        schedulerStatus: status,
        message: `Schedule template '${templateId}' applied successfully`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update custom schedules
   * PATCH /api/v1/settings/schedules
   */
  async updateSchedules(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      logger.info({ updates: Object.keys(req.body) }, 'Updating custom schedules');
      const schedules = await settingsService.updateSchedules(req.body);
      
      // Reload the scheduler with new settings
      await reloadScheduler();
      
      const scheduler = getScheduler();
      const status = scheduler?.getStatus() || { isRunning: false, jobs: [] };

      sendSuccess(res, {
        ...schedules,
        schedulerStatus: status,
        message: 'Schedules updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get scheduler status
   * GET /api/v1/settings/schedules/status
   */
  async getSchedulerStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const scheduler = getScheduler();
      const status = scheduler?.getStatus() || { isRunning: false, jobs: [] };
      sendSuccess(res, status);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Manually trigger a job
   * POST /api/v1/settings/schedules/trigger/:jobName
   */
  async triggerJob(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { jobName } = req.params;
      const validJobs = ['shovels', 'homeowner', 'enrich', 'merge', 'validate', 'enroll'];
      
      if (!validJobs.includes(jobName)) {
        sendSuccess(res, { error: `Invalid job name. Valid jobs: ${validJobs.join(', ')}` }, 400);
        return;
      }

      logger.info({ jobName, ip: req.ip }, 'Manually triggering job');
      
      const scheduler = getScheduler();
      if (!scheduler) {
        sendSuccess(res, { error: 'Scheduler not initialized' }, 500);
        return;
      }

      const result = await scheduler.triggerJob(jobName as any);
      
      sendSuccess(res, {
        jobName,
        result,
        message: `Job '${jobName}' triggered successfully`,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reload scheduler (re-read schedules from database)
   * POST /api/v1/settings/schedules/reload
   */
  async reloadScheduler(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      logger.info({ ip: req.ip }, 'Reloading scheduler');
      await reloadScheduler();
      
      const scheduler = getScheduler();
      const status = scheduler?.getStatus() || { isRunning: false, jobs: [] };

      sendSuccess(res, {
        ...status,
        message: 'Scheduler reloaded successfully',
      });
    } catch (error) {
      next(error);
    }
  }
  // ==================== PERMIT ROUTING ====================

  async getPermitRoutingSettings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const settings = await settingsService.getPermitRoutingSettings();
      sendSuccess(res, settings);
    } catch (error) {
      next(error);
    }
  }

  async updatePermitRoutingSettings(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const settings = await settingsService.updatePermitRoutingSettings(req.body);
      sendSuccess(res, {
        ...settings,
        message: 'Permit routing settings updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const settingsController = new SettingsController();


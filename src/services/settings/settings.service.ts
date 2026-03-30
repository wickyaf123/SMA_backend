/**
 * Settings Service
 * Manages global application settings including LinkedIn toggle
 * Phase 3.5 Day 7
 */

import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';
import { SCHEDULE_TEMPLATES, getScheduleTemplate, cronToHuman, isValidCron, type ScheduleTemplate } from '../../config/schedule-templates';

const DEFAULT_SETTINGS_ID = 'default';

export interface PipelineControlSettings {
  pipelineEnabled: boolean;
  emailOutreachEnabled: boolean;
  smsOutreachEnabled: boolean;
  linkedinGloballyEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  schedulerEnabled: boolean;
  shovelsJobEnabled: boolean;
  homeownerJobEnabled: boolean;
  connectionJobEnabled: boolean;
  enrichJobEnabled: boolean;
  mergeJobEnabled: boolean;
  validateJobEnabled: boolean;
  enrollJobEnabled: boolean;
  lastEmergencyStopAt: Date | null;
  lastEmergencyStopBy: string | null;
}

export interface ScheduleSettings {
  scheduleTemplate: string;
  shovelsJobCron: string;
  enrichJobCron: string;
  mergeJobCron: string;
  validateJobCron: string;
  enrollJobCron: string;
}

export interface ScheduleSettingsWithMeta extends ScheduleSettings {
  templateName: string | null;
  templateDescription: string | null;
  templateIcon: string | null;
  targetLeads: number | null;
  estimatedCosts: { shovels: string } | null;
  scheduleDescriptions: {
    shovels: string;
    enrich: string;
    merge: string;
    validate: string;
    enroll: string;
  };
}

export interface UpdateSettingsData {
  linkedinGloballyEnabled?: boolean;
  defaultEmailCampaignId?: string | null;
  defaultSmsCampaignId?: string | null;
}

export interface EmployeeFilterSettings {
  seniorityFilter: string[];
  departmentFilter: string[];
  titleInclude: string[];
  titleExclude: string[];
}

export interface ShovelsScraperSettings {
  permitTypes: string[];
  geoIds: string[];
  locations: string[];
  dateRangeDays: number;
  maxResults: number;
  enableEmployees: boolean;
  employeeFilter: EmployeeFilterSettings;
}

export interface HomeownerScraperSettings {
  geoIds: string[];
  locations: string[];
  maxResults: number;
  realieEnrich: boolean;
  useShovelsGeoIds: boolean;
  fetchPermitDetails: boolean;
  realieFallback: boolean;
}

export class SettingsService {
  /**
   * Get global settings (creates default if not exists)
   */
  async getSettings() {
    try {
      let settings = await prisma.settings.findUnique({
        where: { id: DEFAULT_SETTINGS_ID },
      });

      if (!settings) {
        logger.info('Creating default settings');
        settings = await prisma.settings.create({
          data: {
            id: DEFAULT_SETTINGS_ID,
            linkedinGloballyEnabled: true,
          },
        });
      }

      return settings;
    } catch (error) {
      logger.error({ error }, 'Failed to get settings');
      throw new AppError('Failed to retrieve settings', 500, 'SETTINGS_ERROR');
    }
  }

  async updateSettings(data: UpdateSettingsData) {
    try {
      logger.info({ updates: Object.keys(data) }, 'Updating settings');
      await this.getSettings();

      const settings = await prisma.settings.update({
        where: { id: DEFAULT_SETTINGS_ID },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      logger.info('Settings updated successfully');
      return settings;
    } catch (error) {
      logger.error({ error, data }, 'Failed to update settings');
      throw new AppError('Failed to update settings', 500, 'SETTINGS_UPDATE_ERROR');
    }
  }

  /**
   * Check if LinkedIn is globally enabled
   */
  async isLinkedInEnabled(): Promise<boolean> {
    const settings = await this.getSettings();
    return settings.linkedinGloballyEnabled;
  }

  /**
   * Enable LinkedIn globally
   */
  async enableLinkedIn() {
    logger.info('Enabling LinkedIn globally');
    return this.updateSettings({ linkedinGloballyEnabled: true });
  }

  /**
   * Disable LinkedIn globally
   */
  async disableLinkedIn() {
    logger.warn('Disabling LinkedIn globally');
    return this.updateSettings({ linkedinGloballyEnabled: false });
  }

  /**
   * Check if LinkedIn is enabled for a specific campaign
   * Takes into account both global and campaign-level settings
   */
  async isLinkedInEnabledForCampaign(campaignId: string): Promise<boolean> {
    try {
      // Check global setting first
      const globalEnabled = await this.isLinkedInEnabled();
      if (!globalEnabled) {
        logger.debug({ campaignId }, 'LinkedIn disabled globally');
        return false;
      }

      // Check campaign-level setting
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { linkedinEnabled: true, channel: true },
      });

      if (!campaign) {
        logger.warn({ campaignId }, 'Campaign not found');
        return false;
      }

      // Only check linkedinEnabled if it's a LinkedIn campaign
      if (campaign.channel === 'LINKEDIN' && !campaign.linkedinEnabled) {
        logger.debug({ campaignId }, 'LinkedIn disabled for campaign');
        return false;
      }

      return true;
    } catch (error) {
      logger.error({ error, campaignId }, 'Failed to check LinkedIn status');
      return false;
    }
  }

  /**
   * Set default email campaign for auto-enrollment
   */
  async setDefaultEmailCampaign(campaignId: string) {
    try {
      // Verify campaign exists and is EMAIL type
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, channel: true, name: true },
      });

      if (!campaign) {
        throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
      }

      if (campaign.channel !== 'EMAIL') {
        throw new AppError('Campaign must be an EMAIL campaign', 400, 'INVALID_CAMPAIGN_TYPE');
      }

      logger.info({ campaignId, name: campaign.name }, 'Setting default email campaign');

      return this.updateSettings({ defaultEmailCampaignId: campaignId });
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ error, campaignId }, 'Failed to set default email campaign');
      throw new AppError('Failed to set default email campaign', 500, 'SETTINGS_UPDATE_ERROR');
    }
  }

  /**
   * Set default SMS campaign for auto-enrollment
   */
  async setDefaultSmsCampaign(campaignId: string) {
    try {
      // Verify campaign exists and is SMS type
      const campaign = await prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { id: true, channel: true, name: true },
      });

      if (!campaign) {
        throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
      }

      if (campaign.channel !== 'SMS') {
        throw new AppError('Campaign must be an SMS campaign', 400, 'INVALID_CAMPAIGN_TYPE');
      }

      logger.info({ campaignId, name: campaign.name }, 'Setting default SMS campaign');

      return this.updateSettings({ defaultSmsCampaignId: campaignId });
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ error, campaignId }, 'Failed to set default SMS campaign');
      throw new AppError('Failed to set default SMS campaign', 500, 'SETTINGS_UPDATE_ERROR');
    }
  }

  /**
   * Get default campaign IDs
   */
  async getDefaultCampaignIds(): Promise<{ emailCampaignId: string | null; smsCampaignId: string | null }> {
    const settings = await this.getSettings();
    return {
      emailCampaignId: settings.defaultEmailCampaignId,
      smsCampaignId: settings.defaultSmsCampaignId,
    };
  }

  // ==================== SCRAPER CONFIGURATION ====================

  async isShovelsConfigured(): Promise<boolean> {
    const settings = await this.getSettings();
    return !!(
      settings.shovelsPermitTypes?.length > 0 &&
      settings.shovelsGeoIds?.length > 0
    );
  }

  async getShovelsSettings(): Promise<ShovelsScraperSettings> {
    const settings = await this.getSettings();
    if (!settings.shovelsPermitTypes || settings.shovelsPermitTypes.length === 0) {
      throw new AppError(
        'Shovels scraper not configured: Permit types required',
        400,
        'SHOVELS_NOT_CONFIGURED'
      );
    }
    if (!settings.shovelsGeoIds || settings.shovelsGeoIds.length === 0) {
      throw new AppError(
        'Shovels scraper not configured: Geo IDs required',
        400,
        'SHOVELS_NOT_CONFIGURED'
      );
    }
    return {
      permitTypes: settings.shovelsPermitTypes,
      geoIds: settings.shovelsGeoIds,
      locations: settings.shovelsLocations || [],
      dateRangeDays: settings.shovelsDateRangeDays ?? 365,
      maxResults: settings.shovelsMaxResults ?? 100,
      enableEmployees: settings.shovelsEnableEmployees ?? true,
      employeeFilter: {
        seniorityFilter: settings.shovelsEmployeeSeniorityFilter || ['Senior', 'Executive'],
        departmentFilter: settings.shovelsEmployeeDepartmentFilter || ['Operations', 'Management', 'Administration'],
        titleInclude: settings.shovelsEmployeeTitleInclude || ['Owner', 'President', 'CEO', 'Founder', 'Director', 'VP', 'Vice President'],
        titleExclude: settings.shovelsEmployeeTitleExclude || ['Technician', 'Installer', 'Helper', 'Laborer', 'Apprentice'],
      },
    };
  }

  async updateShovelsSettings(data: Partial<ShovelsScraperSettings>): Promise<ShovelsScraperSettings> {
    try {
      logger.info({ updates: Object.keys(data) }, 'Updating Shovels scraper settings');
      await this.getSettings();
      await prisma.settings.update({
        where: { id: DEFAULT_SETTINGS_ID },
        data: {
          shovelsPermitTypes: data.permitTypes,
          shovelsGeoIds: data.geoIds,
          shovelsLocations: data.locations,
          shovelsDateRangeDays: data.dateRangeDays,
          shovelsMaxResults: data.maxResults,
          shovelsEnableEmployees: data.enableEmployees,
          ...(data.employeeFilter && {
            shovelsEmployeeSeniorityFilter: data.employeeFilter.seniorityFilter,
            shovelsEmployeeDepartmentFilter: data.employeeFilter.departmentFilter,
            shovelsEmployeeTitleInclude: data.employeeFilter.titleInclude,
            shovelsEmployeeTitleExclude: data.employeeFilter.titleExclude,
          }),
          updatedAt: new Date(),
        },
      });
      logger.info('Shovels settings updated successfully');
      return this.getShovelsSettings();
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ error, data }, 'Failed to update Shovels settings');
      throw new AppError('Failed to update Shovels settings', 500, 'SETTINGS_UPDATE_ERROR');
    }
  }

  async getHomeownerSettings(): Promise<HomeownerScraperSettings> {
    const settings = await this.getSettings();
    return {
      geoIds: settings.homeownerGeoIds || [],
      locations: settings.homeownerLocations || [],
      maxResults: settings.homeownerMaxResults ?? 100,
      realieEnrich: settings.homeownerRealieEnrich ?? true,
      useShovelsGeoIds: settings.homeownerUseShovelsGeoIds ?? true,
      fetchPermitDetails: settings.homeownerFetchPermitDetails ?? true,
      realieFallback: settings.homeownerRealieFallback ?? true,
    };
  }

  async updateHomeownerSettings(data: Partial<HomeownerScraperSettings>): Promise<HomeownerScraperSettings> {
    try {
      logger.info({ updates: Object.keys(data) }, 'Updating homeowner scraper settings');
      await this.getSettings();
      await prisma.settings.update({
        where: { id: DEFAULT_SETTINGS_ID },
        data: {
          homeownerGeoIds: data.geoIds,
          homeownerLocations: data.locations,
          homeownerMaxResults: data.maxResults,
          homeownerRealieEnrich: data.realieEnrich,
          homeownerUseShovelsGeoIds: data.useShovelsGeoIds,
          homeownerFetchPermitDetails: data.fetchPermitDetails,
          homeownerRealieFallback: data.realieFallback,
          updatedAt: new Date(),
        },
      });
      logger.info('Homeowner settings updated successfully');
      return this.getHomeownerSettings();
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ error, data }, 'Failed to update homeowner settings');
      throw new AppError('Failed to update homeowner settings', 500, 'SETTINGS_UPDATE_ERROR');
    }
  }

  async getScraperSettings(): Promise<{ shovels: ShovelsScraperSettings | null }> {
    try {
      const shovels = await this.getShovelsSettings().catch(() => null);
      return { shovels };
    } catch (error) {
      logger.warn('Failed to get scraper settings, returning null values');
      return { shovels: null };
    }
  }

  // ==================== PIPELINE CONTROL ====================

  /**
   * Get pipeline control settings
   */
  async getPipelineControls(): Promise<PipelineControlSettings> {
    const settings = await this.getSettings();
    return {
      pipelineEnabled: settings.pipelineEnabled ?? true,
      emailOutreachEnabled: settings.emailOutreachEnabled ?? true,
      smsOutreachEnabled: settings.smsOutreachEnabled ?? true,
      linkedinGloballyEnabled: settings.linkedinGloballyEnabled,
      maintenanceMode: settings.maintenanceMode ?? false,
      maintenanceMessage: settings.maintenanceMessage,
      schedulerEnabled: settings.schedulerEnabled ?? true,
      shovelsJobEnabled: settings.shovelsJobEnabled ?? true,
      homeownerJobEnabled: settings.homeownerJobEnabled ?? false,
      connectionJobEnabled: settings.connectionJobEnabled ?? false,
      enrichJobEnabled: settings.enrichJobEnabled ?? true,
      mergeJobEnabled: settings.mergeJobEnabled ?? true,
      validateJobEnabled: settings.validateJobEnabled ?? true,
      enrollJobEnabled: settings.enrollJobEnabled ?? true,
      lastEmergencyStopAt: settings.lastEmergencyStopAt,
      lastEmergencyStopBy: settings.lastEmergencyStopBy,
    };
  }

  /**
   * Update pipeline control settings
   */
  async updatePipelineControls(data: Partial<PipelineControlSettings>): Promise<PipelineControlSettings> {
    try {
      logger.info({ updates: Object.keys(data) }, 'Updating pipeline controls');

      await this.getSettings();

      await prisma.settings.update({
        where: { id: DEFAULT_SETTINGS_ID },
        data: {
          pipelineEnabled: data.pipelineEnabled,
          emailOutreachEnabled: data.emailOutreachEnabled,
          smsOutreachEnabled: data.smsOutreachEnabled,
          linkedinGloballyEnabled: data.linkedinGloballyEnabled,
          maintenanceMode: data.maintenanceMode,
          maintenanceMessage: data.maintenanceMessage,
          schedulerEnabled: data.schedulerEnabled,
          shovelsJobEnabled: data.shovelsJobEnabled,
          homeownerJobEnabled: data.homeownerJobEnabled,
          connectionJobEnabled: data.connectionJobEnabled,
          enrichJobEnabled: data.enrichJobEnabled,
          mergeJobEnabled: data.mergeJobEnabled,
          validateJobEnabled: data.validateJobEnabled,
          enrollJobEnabled: data.enrollJobEnabled,
          updatedAt: new Date(),
        },
      });

      logger.info('Pipeline controls updated successfully');
      return this.getPipelineControls();
    } catch (error) {
      logger.error({ error, data }, 'Failed to update pipeline controls');
      throw new AppError('Failed to update pipeline controls', 500, 'SETTINGS_UPDATE_ERROR');
    }
  }

  // ==================== SCHEDULE CONFIGURATION ====================

  /**
   * Get all available schedule templates
   */
  getScheduleTemplates(): ScheduleTemplate[] {
    return Object.values(SCHEDULE_TEMPLATES);
  }

  /**
   * Get current schedule settings with metadata
   */
  async getScheduleSettings(): Promise<ScheduleSettingsWithMeta> {
    const settings = await this.getSettings();
    const templateId = settings.scheduleTemplate || 'balanced';
    const template = getScheduleTemplate(templateId);

    return {
      scheduleTemplate: templateId,
      shovelsJobCron: settings.shovelsJobCron || '0 7 * * *',
      enrichJobCron: settings.enrichJobCron || '0 8 * * *',
      mergeJobCron: settings.mergeJobCron || '0 9 * * *',
      validateJobCron: settings.validateJobCron || '0 10 * * *',
      enrollJobCron: settings.enrollJobCron || '0 11 * * *',
      templateName: template?.name || null,
      templateDescription: template?.description || null,
      templateIcon: template?.icon || null,
      targetLeads: template?.targetLeads || null,
      estimatedCosts: template?.estimatedCosts || null,
      scheduleDescriptions: {
        shovels: cronToHuman(settings.shovelsJobCron || '0 7 * * *'),
        enrich: cronToHuman(settings.enrichJobCron || '0 8 * * *'),
        merge: cronToHuman(settings.mergeJobCron || '0 9 * * *'),
        validate: cronToHuman(settings.validateJobCron || '0 10 * * *'),
        enroll: cronToHuman(settings.enrollJobCron || '0 11 * * *'),
      },
    };
  }

  /**
   * Apply a schedule template
   */
  async applyScheduleTemplate(templateId: string): Promise<ScheduleSettingsWithMeta> {
    const template = getScheduleTemplate(templateId);
    
    if (!template) {
      throw new AppError(`Schedule template '${templateId}' not found`, 404, 'TEMPLATE_NOT_FOUND');
    }

    logger.info({ templateId, templateName: template.name }, 'Applying schedule template');

    await this.getSettings();

    await prisma.settings.update({
      where: { id: DEFAULT_SETTINGS_ID },
      data: {
        scheduleTemplate: templateId,
        shovelsJobCron: template.schedules.shovelsJobCron,
        enrichJobCron: template.schedules.enrichJobCron,
        mergeJobCron: template.schedules.mergeJobCron,
        validateJobCron: template.schedules.validateJobCron,
        enrollJobCron: template.schedules.enrollJobCron,
        updatedAt: new Date(),
      },
    });

    logger.info({ templateId }, 'Schedule template applied successfully');
    return this.getScheduleSettings();
  }

  /**
   * Update individual cron schedules (custom mode)
   */
  async updateSchedules(data: Partial<ScheduleSettings>): Promise<ScheduleSettingsWithMeta> {
    try {
      // Validate cron expressions
      const cronFields = ['shovelsJobCron', 'enrichJobCron', 'mergeJobCron', 'validateJobCron', 'enrollJobCron'] as const;
      
      for (const field of cronFields) {
        if (data[field] && !isValidCron(data[field]!)) {
          throw new AppError(`Invalid cron expression for ${field}: ${data[field]}`, 400, 'INVALID_CRON');
        }
      }

      logger.info({ updates: Object.keys(data) }, 'Updating custom schedules');

      await this.getSettings();

      await prisma.settings.update({
        where: { id: DEFAULT_SETTINGS_ID },
        data: {
          scheduleTemplate: 'custom', // Mark as custom when manually editing
          shovelsJobCron: data.shovelsJobCron,
          enrichJobCron: data.enrichJobCron,
          mergeJobCron: data.mergeJobCron,
          validateJobCron: data.validateJobCron,
          enrollJobCron: data.enrollJobCron,
          updatedAt: new Date(),
        },
      });

      logger.info('Custom schedules updated successfully');
      return this.getScheduleSettings();
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ error, data }, 'Failed to update schedules');
      throw new AppError('Failed to update schedules', 500, 'SETTINGS_UPDATE_ERROR');
    }
  }

  /**
   * Get cron schedules for the scheduler
   */
  async getCronSchedules(): Promise<Record<string, string>> {
    const settings = await this.getSettings();
    return {
      shovels: settings.shovelsJobCron || '0 7 * * *',
      homeowner: settings.homeownerJobCron || '0 9 * * *',
      connection: settings.connectionJobCron || '30 9 * * *',
      enrich: settings.enrichJobCron || '0 8 * * *',
      merge: settings.mergeJobCron || '0 9 * * *',
      validate: settings.validateJobCron || '0 10 * * *',
      enroll: settings.enrollJobCron || '0 11 * * *',
    };
  }

  /**
   * Emergency stop - stops all outreach immediately
   */
  async emergencyStop(stoppedBy: string = 'system'): Promise<PipelineControlSettings> {
    logger.warn({ stoppedBy }, '⚠️ EMERGENCY STOP TRIGGERED - Stopping all outreach');

    await this.getSettings();

    await prisma.settings.update({
      where: { id: DEFAULT_SETTINGS_ID },
      data: {
        pipelineEnabled: false,
        emailOutreachEnabled: false,
        smsOutreachEnabled: false,
        linkedinGloballyEnabled: false,
        schedulerEnabled: false,
        enrichJobEnabled: false,
        mergeJobEnabled: false,
        validateJobEnabled: false,
        enrollJobEnabled: false,
        shovelsJobEnabled: false,
        homeownerJobEnabled: false,
        connectionJobEnabled: false,
        lastEmergencyStopAt: new Date(),
        lastEmergencyStopBy: stoppedBy,
        updatedAt: new Date(),
      },
    });

    // Cancel all in-memory scraper jobs
    try {
      const { cancelJob } = await import('../scraper/shovels.service');
      const activeSearches = await prisma.permitSearch.findMany({
        where: { status: { in: ['PENDING', 'SEARCHING', 'ENRICHING'] } },
        select: { id: true },
      });
      for (const search of activeSearches) {
        cancelJob(search.id);
        await prisma.permitSearch.update({
          where: { id: search.id },
          data: { status: 'CANCELLED' },
        }).catch(() => {});
      }
      if (activeSearches.length > 0) {
        logger.warn({ count: activeSearches.length }, 'Cancelled active scraper jobs');
      }
    } catch (err) {
      logger.error({ err }, 'Failed to cancel active scraper jobs during emergency stop');
    }

    logger.warn('Emergency stop completed - All outreach and jobs disabled');
    return this.getPipelineControls();
  }

  /**
   * Resume pipeline after emergency stop
   */
  async resumePipeline(): Promise<PipelineControlSettings> {
    logger.info('Resuming pipeline after emergency stop');

    await this.getSettings();

    await prisma.settings.update({
      where: { id: DEFAULT_SETTINGS_ID },
      data: {
        pipelineEnabled: true,
        emailOutreachEnabled: true,
        smsOutreachEnabled: true,
        linkedinGloballyEnabled: true,
        schedulerEnabled: true,
        enrichJobEnabled: true,
        mergeJobEnabled: true,
        validateJobEnabled: true,
        enrollJobEnabled: true,
        shovelsJobEnabled: true,
        homeownerJobEnabled: true,
        connectionJobEnabled: true,
        maintenanceMode: false,
        updatedAt: new Date(),
      },
    });

    logger.info('Pipeline resumed - All systems enabled');
    return this.getPipelineControls();
  }

  /**
   * Check if a specific job is enabled
   */
  async isJobEnabled(jobType: 'shovels' | 'homeowner' | 'connection' | 'enrich' | 'merge' | 'validate' | 'enroll'): Promise<boolean> {
    const settings = await this.getSettings();
    
    if (!settings.pipelineEnabled || !settings.schedulerEnabled) {
      return false;
    }

    switch (jobType) {
      case 'shovels':
        return settings.shovelsJobEnabled ?? true;
      case 'homeowner':
        return settings.homeownerJobEnabled ?? false;
      case 'connection':
        return settings.connectionJobEnabled ?? false;
      case 'enrich':
        return settings.enrichJobEnabled ?? true;
      case 'merge':
        return settings.mergeJobEnabled ?? true;
      case 'validate':
        return settings.validateJobEnabled ?? true;
      case 'enroll':
        return settings.enrollJobEnabled ?? true;
      default:
        return false;
    }
  }

  /**
   * Check if outreach channel is enabled
   */
  async isOutreachEnabled(channel: 'email' | 'sms' | 'linkedin'): Promise<boolean> {
    const settings = await this.getSettings();
    
    if (!(settings.pipelineEnabled ?? true)) {
      return false;
    }

    switch (channel) {
      case 'email':
        return settings.emailOutreachEnabled ?? true;
      case 'sms':
        return settings.smsOutreachEnabled ?? true;
      case 'linkedin':
        return settings.linkedinGloballyEnabled;
      default:
        return false;
    }
  }
  // ==================== PERMIT ROUTING ====================

  async getPermitRoutingSettings(): Promise<{
    permitRouteMode: string;
    permitEmailCampaignId: string | null;
    permitGhlWorkflowId: string | null;
    permitGhlEmailReplyWorkflowId: string | null;
    permitGhlSmsReplyWorkflowId: string | null;
    permitSmsFallbackEnabled: boolean;
    permitAutoRouteEnabled: boolean;
  }> {
    const settings = await this.getSettings();
    return {
      permitRouteMode: settings.permitRouteMode || 'email',
      permitEmailCampaignId: settings.permitEmailCampaignId || null,
      permitGhlWorkflowId: settings.permitGhlWorkflowId || null,
      permitGhlEmailReplyWorkflowId: settings.permitGhlEmailReplyWorkflowId || null,
      permitGhlSmsReplyWorkflowId: settings.permitGhlSmsReplyWorkflowId || null,
      permitSmsFallbackEnabled: settings.permitSmsFallbackEnabled ?? true,
      permitAutoRouteEnabled: settings.permitAutoRouteEnabled ?? false,
    };
  }

  async updatePermitRoutingSettings(data: {
    permitRouteMode?: string;
    permitEmailCampaignId?: string;
    permitGhlWorkflowId?: string;
    permitGhlEmailReplyWorkflowId?: string;
    permitGhlSmsReplyWorkflowId?: string;
    permitSmsFallbackEnabled?: boolean;
    permitAutoRouteEnabled?: boolean;
  }): Promise<any> {
    try {
      logger.info({ updates: Object.keys(data) }, 'Updating permit routing settings');
      await this.getSettings();
      await prisma.settings.update({
        where: { id: DEFAULT_SETTINGS_ID },
        data: { ...data, updatedAt: new Date() },
      });
      logger.info('Permit routing settings updated');
      return this.getPermitRoutingSettings();
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ error, data }, 'Failed to update permit routing settings');
      throw new AppError('Failed to update permit routing settings', 500, 'SETTINGS_UPDATE_ERROR');
    }
  }
}

export const settingsService = new SettingsService();


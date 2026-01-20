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

export interface Settings {
  id: string;
  linkedinGloballyEnabled: boolean;
  defaultEmailCampaignId: string | null;
  defaultSmsCampaignId: string | null;
  // Apify (Google Maps) Scraper Settings - Expanded
  apifySearchTerms: string[];
  apifyLocations: string[];
  apifyIndustries: string[];
  apifyMaxResults: number | null;
  apifyMinRating: number | null;
  apifyRequirePhone: boolean | null;
  apifyRequireWebsite: boolean | null;
  apifySkipClosed: boolean | null;
  apifyLanguage: string | null;
  apifySearchMatching: string | null;
  apifyScrapePlaceDetails: boolean | null;
  apifyScrapeContacts: boolean | null;
  apifyScrapeReviews: boolean | null;
  apifyMaxReviews: number | null;
  apifyScrapeSocialMedia: any | null;
  apifyMinReviewCount: number | null;
  // Apollo Scraper Settings - Expanded
  apolloIndustry: string | null;
  apolloPersonTitles: string[];
  apolloLocations: string[];
  apolloExcludeLocations: string[];
  apolloEmployeesMin: number | null;
  apolloEmployeesMax: number | null;
  apolloRevenueMin: number | null;
  apolloRevenueMax: number | null;
  apolloEnrichLimit: number | null;
  apolloEnrichPhones: boolean;
  apolloSearchKeywords: string | null;
  apolloPersonLocations: string[];
  apolloPersonSeniorities: string[];
  apolloOrganizationKeywordTags: string[];
  apolloNegativeKeywordTags: string[];
  apolloTechnologies: string[];
  apolloIndustryTagIds: string[];
  apolloEmployeeGrowthRate: string | null;
  apolloFundingStage: string | null;
  apolloPage: number | null;
  apolloPerPage: number | null;
  // Pipeline Control
  pipelineEnabled: boolean | null;
  emailOutreachEnabled: boolean | null;
  smsOutreachEnabled: boolean | null;
  maintenanceMode: boolean | null;
  maintenanceMessage: string | null;
  // Job Controls
  schedulerEnabled: boolean | null;
  scrapeJobEnabled: boolean | null;
  apolloJobEnabled: boolean | null;
  enrichJobEnabled: boolean | null;
  mergeJobEnabled: boolean | null;
  validateJobEnabled: boolean | null;
  enrollJobEnabled: boolean | null;
  // Cron Schedules
  scheduleTemplate: string | null;
  scrapeJobCron: string | null;
  apolloJobCron: string | null;
  enrichJobCron: string | null;
  mergeJobCron: string | null;
  validateJobCron: string | null;
  enrollJobCron: string | null;
  // Emergency Stop
  lastEmergencyStopAt: Date | null;
  lastEmergencyStopBy: string | null;
  // Campaign Routing
  routingFallbackBehavior: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PipelineControlSettings {
  pipelineEnabled: boolean;
  emailOutreachEnabled: boolean;
  smsOutreachEnabled: boolean;
  linkedinGloballyEnabled: boolean;
  maintenanceMode: boolean;
  maintenanceMessage: string | null;
  schedulerEnabled: boolean;
  scrapeJobEnabled: boolean;
  apolloJobEnabled: boolean;
  enrichJobEnabled: boolean;
  mergeJobEnabled: boolean;
  validateJobEnabled: boolean;
  enrollJobEnabled: boolean;
  lastEmergencyStopAt: Date | null;
  lastEmergencyStopBy: string | null;
}

export interface ScheduleSettings {
  scheduleTemplate: string;
  scrapeJobCron: string;
  apolloJobCron: string;
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
  estimatedCosts: { apollo: string; apify: string } | null;
  scheduleDescriptions: {
    scrape: string;
    apollo: string;
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

export interface ApifyScraperSettings {
  searchTerms: string[];
  locations: string[];
  industries: string[];
  maxResults: number;
  minRating: number;
  requirePhone: boolean;
  requireWebsite: boolean;
  skipClosed: boolean;
  language?: string;
  searchMatching?: 'all' | 'exact';
  scrapePlaceDetails?: boolean;
  scrapeContacts?: boolean;
  scrapeReviews?: boolean;
  maxReviews?: number;
  scrapeSocialMedia?: any;
  minReviewCount?: number;
}

export interface ApolloScraperSettings {
  industry: string;
  personTitles: string[];
  locations: string[];
  excludeLocations: string[];
  employeesMin: number | null;
  employeesMax: number | null;
  revenueMin: number | null;
  revenueMax: number | null;
  enrichLimit: number;
  enrichPhones: boolean;
  searchKeywords?: string;
  personLocations?: string[];
  personSeniorities?: string[];
  organizationKeywordTags?: string[];
  negativeKeywordTags?: string[];
  technologies?: string[];
  industryTagIds?: string[];
  employeeGrowthRate?: string;
  fundingStage?: string;
  page?: number;
  perPage?: number;
}

export class SettingsService {
  /**
   * Get global settings (creates default if not exists)
   */
  async getSettings(): Promise<Settings> {
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

  /**
   * Update global settings
   */
  async updateSettings(data: UpdateSettingsData): Promise<Settings> {
    try {
      logger.info({ updates: Object.keys(data) }, 'Updating settings');

      // Ensure settings exist first
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
  async enableLinkedIn(): Promise<Settings> {
    logger.info('Enabling LinkedIn globally');
    return this.updateSettings({ linkedinGloballyEnabled: true });
  }

  /**
   * Disable LinkedIn globally
   */
  async disableLinkedIn(): Promise<Settings> {
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
  async setDefaultEmailCampaign(campaignId: string): Promise<Settings> {
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
  async setDefaultSmsCampaign(campaignId: string): Promise<Settings> {
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

  /**
   * Check if Apify (Google Maps) scraper is configured
   */
  async isApifyConfigured(): Promise<boolean> {
    const settings = await this.getSettings();
    return !!(
      settings.apifySearchTerms && settings.apifySearchTerms.length > 0 &&
      settings.apifyLocations && settings.apifyLocations.length > 0 &&
      settings.apifyIndustries && settings.apifyIndustries.length > 0 &&
      settings.apifyMaxResults
    );
  }

  /**
   * Get Apify (Google Maps) scraper settings
   * Throws error if not properly configured
   */
  async getApifySettings(): Promise<ApifyScraperSettings> {
    const settings = await this.getSettings();
    
    // Validate required fields
    if (!settings.apifySearchTerms || settings.apifySearchTerms.length === 0) {
      throw new AppError(
        'Google Maps scraper not configured: Search terms are required',
        400,
        'APIFY_NOT_CONFIGURED'
      );
    }
    
    if (!settings.apifyLocations || settings.apifyLocations.length === 0) {
      throw new AppError(
        'Google Maps scraper not configured: Locations are required',
        400,
        'APIFY_NOT_CONFIGURED'
      );
    }
    
    if (!settings.apifyIndustries || settings.apifyIndustries.length === 0) {
      throw new AppError(
        'Google Maps scraper not configured: Industries are required',
        400,
        'APIFY_NOT_CONFIGURED'
      );
    }

    if (!settings.apifyMaxResults) {
      throw new AppError(
        'Google Maps scraper not configured: Max results is required',
        400,
        'APIFY_NOT_CONFIGURED'
      );
    }
    
    // Return all settings
    return {
      searchTerms: settings.apifySearchTerms,
      locations: settings.apifyLocations,
      industries: settings.apifyIndustries,
      maxResults: settings.apifyMaxResults,
      minRating: settings.apifyMinRating ?? 0,
      requirePhone: settings.apifyRequirePhone ?? false,
      requireWebsite: settings.apifyRequireWebsite ?? false,
      skipClosed: settings.apifySkipClosed ?? true,
      language: settings.apifyLanguage ?? undefined,
      searchMatching: settings.apifySearchMatching as 'all' | 'exact' | undefined,
      scrapePlaceDetails: settings.apifyScrapePlaceDetails ?? undefined,
      scrapeContacts: settings.apifyScrapeContacts ?? undefined,
      scrapeReviews: settings.apifyScrapeReviews ?? undefined,
      maxReviews: settings.apifyMaxReviews ?? undefined,
      scrapeSocialMedia: settings.apifyScrapeSocialMedia ?? undefined,
      minReviewCount: settings.apifyMinReviewCount ?? undefined,
    };
  }

  /**
   * Update Apify (Google Maps) scraper settings
   */
  async updateApifySettings(data: Partial<ApifyScraperSettings>): Promise<ApifyScraperSettings> {
    try {
      logger.info({ updates: Object.keys(data) }, 'Updating Apify scraper settings');

      await this.getSettings();

      await prisma.settings.update({
        where: { id: DEFAULT_SETTINGS_ID },
        data: {
          apifySearchTerms: data.searchTerms,
          apifyLocations: data.locations,
          apifyIndustries: data.industries,
          apifyMaxResults: data.maxResults,
          apifyMinRating: data.minRating,
          apifyRequirePhone: data.requirePhone,
          apifyRequireWebsite: data.requireWebsite,
          apifySkipClosed: data.skipClosed,
          apifyLanguage: data.language,
          apifySearchMatching: data.searchMatching,
          apifyScrapePlaceDetails: data.scrapePlaceDetails,
          apifyScrapeContacts: data.scrapeContacts,
          apifyScrapeReviews: data.scrapeReviews,
          apifyMaxReviews: data.maxReviews,
          apifyScrapeSocialMedia: data.scrapeSocialMedia,
          apifyMinReviewCount: data.minReviewCount,
          updatedAt: new Date(),
        },
      });

      logger.info('Apify settings updated successfully');
      return this.getApifySettings();
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ error, data }, 'Failed to update Apify settings');
      throw new AppError('Failed to update Apify settings', 500, 'SETTINGS_UPDATE_ERROR');
    }
  }

  /**
   * Check if Apollo scraper is configured
   */
  async isApolloConfigured(): Promise<boolean> {
    const settings = await this.getSettings();
    return !!(
      settings.apolloIndustry &&
      settings.apolloLocations && settings.apolloLocations.length > 0 &&
      settings.apolloPersonTitles && settings.apolloPersonTitles.length > 0 &&
      (settings.apolloSearchKeywords || settings.apolloOrganizationKeywordTags?.length > 0)
    );
  }

  /**
   * Get Apollo scraper settings
   * Throws error if not properly configured
   */
  async getApolloSettings(): Promise<ApolloScraperSettings> {
    const settings = await this.getSettings();
    
    // Validate required fields
    const errors = [];
    
    if (!settings.apolloIndustry) errors.push('Industry');
    if (!settings.apolloLocations || settings.apolloLocations.length === 0) errors.push('Locations');
    if (!settings.apolloPersonTitles || settings.apolloPersonTitles.length === 0) errors.push('Person Titles');
    if (!settings.apolloSearchKeywords && 
        (!settings.apolloOrganizationKeywordTags || settings.apolloOrganizationKeywordTags.length === 0)) {
      errors.push('Search Keywords or Organization Keyword Tags');
    }
    
    if (errors.length > 0) {
      throw new AppError(
        `Apollo scraper not configured. Missing: ${errors.join(', ')}`,
        400,
        'APOLLO_NOT_CONFIGURED'
      );
    }
    
    return {
      industry: settings.apolloIndustry!,
      personTitles: settings.apolloPersonTitles,
      locations: settings.apolloLocations,
      excludeLocations: settings.apolloExcludeLocations || [],
      employeesMin: settings.apolloEmployeesMin,
      employeesMax: settings.apolloEmployeesMax,
      revenueMin: settings.apolloRevenueMin,
      revenueMax: settings.apolloRevenueMax,
      enrichLimit: settings.apolloEnrichLimit ?? 100,
      enrichPhones: settings.apolloEnrichPhones ?? true,
      searchKeywords: settings.apolloSearchKeywords ?? undefined,
      personLocations: settings.apolloPersonLocations || [],
      personSeniorities: settings.apolloPersonSeniorities || [],
      organizationKeywordTags: settings.apolloOrganizationKeywordTags || [],
      negativeKeywordTags: settings.apolloNegativeKeywordTags || [],
      technologies: settings.apolloTechnologies || [],
      industryTagIds: settings.apolloIndustryTagIds || [],
      employeeGrowthRate: settings.apolloEmployeeGrowthRate ?? undefined,
      fundingStage: settings.apolloFundingStage ?? undefined,
      page: settings.apolloPage ?? 1,
      perPage: settings.apolloPerPage ?? 100,
    };
  }

  /**
   * Update Apollo scraper settings
   */
  async updateApolloSettings(data: Partial<ApolloScraperSettings>): Promise<ApolloScraperSettings> {
    try {
      logger.info({ updates: Object.keys(data) }, 'Updating Apollo scraper settings');

      await this.getSettings();

      await prisma.settings.update({
        where: { id: DEFAULT_SETTINGS_ID },
        data: {
          apolloIndustry: data.industry,
          apolloPersonTitles: data.personTitles,
          apolloLocations: data.locations,
          apolloExcludeLocations: data.excludeLocations,
          apolloEmployeesMin: data.employeesMin,
          apolloEmployeesMax: data.employeesMax,
          apolloRevenueMin: data.revenueMin,
          apolloRevenueMax: data.revenueMax,
          apolloEnrichLimit: data.enrichLimit,
          apolloEnrichPhones: data.enrichPhones,
          apolloSearchKeywords: data.searchKeywords,
          apolloPersonLocations: data.personLocations,
          apolloPersonSeniorities: data.personSeniorities,
          apolloOrganizationKeywordTags: data.organizationKeywordTags,
          apolloNegativeKeywordTags: data.negativeKeywordTags,
          apolloTechnologies: data.technologies,
          apolloIndustryTagIds: data.industryTagIds,
          apolloEmployeeGrowthRate: data.employeeGrowthRate,
          apolloFundingStage: data.fundingStage,
          apolloPage: data.page,
          apolloPerPage: data.perPage,
          updatedAt: new Date(),
        },
      });

      logger.info('Apollo settings updated successfully');
      return this.getApolloSettings();
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ error, data }, 'Failed to update Apollo settings');
      throw new AppError('Failed to update Apollo settings', 500, 'SETTINGS_UPDATE_ERROR');
    }
  }

  /**
   * Get all scraper settings
   */
  async getScraperSettings(): Promise<{ apify: ApifyScraperSettings | null; apollo: ApolloScraperSettings | null }> {
    try {
      const [apify, apollo] = await Promise.all([
        this.getApifySettings().catch(() => null),
        this.getApolloSettings().catch(() => null),
      ]);
      return { apify, apollo };
    } catch (error) {
      logger.warn('Failed to get scraper settings, returning null values');
      return { apify: null, apollo: null };
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
      scrapeJobEnabled: settings.scrapeJobEnabled ?? true,
      apolloJobEnabled: settings.apolloJobEnabled ?? true,
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
          scrapeJobEnabled: data.scrapeJobEnabled,
          apolloJobEnabled: data.apolloJobEnabled,
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
      scrapeJobCron: settings.scrapeJobCron || '0 6 * * *',
      apolloJobCron: settings.apolloJobCron || '30 6 * * *',
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
        scrape: cronToHuman(settings.scrapeJobCron || '0 6 * * *'),
        apollo: cronToHuman(settings.apolloJobCron || '30 6 * * *'),
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
        scrapeJobCron: template.schedules.scrapeJobCron,
        apolloJobCron: template.schedules.apolloJobCron,
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
      const cronFields = ['scrapeJobCron', 'apolloJobCron', 'enrichJobCron', 'mergeJobCron', 'validateJobCron', 'enrollJobCron'] as const;
      
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
          scrapeJobCron: data.scrapeJobCron,
          apolloJobCron: data.apolloJobCron,
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
      scrape: settings.scrapeJobCron || '0 6 * * *',
      apollo: settings.apolloJobCron || '30 6 * * *',
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
        enrollJobEnabled: false,
        lastEmergencyStopAt: new Date(),
        lastEmergencyStopBy: stoppedBy,
        updatedAt: new Date(),
      },
    });

    logger.warn('Emergency stop completed - All outreach disabled');
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
        schedulerEnabled: true,
        scrapeJobEnabled: true,
        apolloJobEnabled: true,
        enrichJobEnabled: true,
        mergeJobEnabled: true,
        validateJobEnabled: true,
        enrollJobEnabled: true,
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
  async isJobEnabled(jobType: 'scrape' | 'apollo' | 'enrich' | 'merge' | 'validate' | 'enroll'): Promise<boolean> {
    const settings = await this.getSettings();
    
    // Master switches first
    if (!settings.pipelineEnabled || !settings.schedulerEnabled) {
      return false;
    }

    switch (jobType) {
      case 'scrape':
        return settings.scrapeJobEnabled ?? true;
      case 'apollo':
        return settings.apolloJobEnabled ?? true;
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
}

export const settingsService = new SettingsService();


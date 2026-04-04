import { Request, Response, NextFunction } from 'express';
import { campaignService } from '../services/campaign/campaign.service';
import { emailOutreachService } from '../services/outreach/email.service';
import { linkedInOutreachService } from '../services/outreach/linkedin.service';
import { smsOutreachService } from '../services/outreach/sms.service';
import { settingsService } from '../services/settings/settings.service';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export class CampaignController {
  /**
   * Create a new campaign
   * POST /campaigns
   */
  async createCampaign(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const campaign = await campaignService.createCampaign(req.body, userId);
      sendCreated(res, campaign);
    } catch (error) {
      next(error);
    }
  }

  /**
   * List campaigns
   * GET /campaigns
   */
  async listCampaigns(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const filters = {
        channel: req.query.channel as any,
        status: req.query.status as any,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      };

      const result = await campaignService.listCampaigns(filters, userId);

      const page = Math.floor((filters.offset || 0) / (filters.limit || 50)) + 1;
      const totalPages = Math.ceil(result.total / (filters.limit || 50));

      sendPaginated(res, result.campaigns, {
        total: result.total,
        limit: filters.limit || 50,
        page,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get campaign by ID
   * GET /campaigns/:id
   */
  async getCampaign(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const campaign = await campaignService.getCampaign(req.params.id, userId);

      if (!campaign) {
        throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
      }

      // Get stats
      const stats = await campaignService.getCampaignStats(req.params.id);

      sendSuccess(res, { ...campaign, stats });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update campaign
   * PATCH /campaigns/:id
   */
  async updateCampaign(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const campaign = await campaignService.updateCampaign(
        req.params.id,
        req.body,
        userId
      );
      sendSuccess(res, campaign);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete (archive) campaign
   * DELETE /campaigns/:id
   */
  async deleteCampaign(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      await campaignService.deleteCampaign(req.params.id, userId);
      sendSuccess(res, { message: 'Campaign archived successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Enroll contacts in campaign
   * POST /campaigns/:id/enroll
   */
  async enrollContacts(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { contactIds, options = {} } = req.body;
      const campaignId = req.params.id;

      // Get campaign to determine channel
      const campaign = await campaignService.getCampaign(campaignId);

      if (!campaign) {
        throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
      }

      // Day 7: Check LinkedIn toggle if this is a LinkedIn campaign
      if (campaign.channel === 'LINKEDIN') {
        // Check global setting first
        const globalEnabled = await settingsService.isLinkedInEnabled();
        if (!globalEnabled) {
          throw new AppError(
            'LinkedIn is globally disabled. Enable it in system settings.',
            400,
            'LINKEDIN_GLOBALLY_DISABLED'
          );
        }

        // Then check campaign-level setting
        if (!campaign.linkedinEnabled) {
          throw new AppError(
            'LinkedIn is disabled for this campaign. Enable it in campaign settings.',
            400,
            'LINKEDIN_DISABLED_FOR_CAMPAIGN'
          );
        }
      }

      // First, enroll contacts in the campaign (creates enrollment records)
      const enrollmentResult = await campaignService.enrollContacts(
        campaignId,
        contactIds
      );

      // Then, process based on channel
      let channelResult: any;

      switch (campaign.channel) {
        case 'EMAIL':
          logger.info({ campaignId, channel: 'EMAIL' }, 'Enrolling in Instantly');
          channelResult = await emailOutreachService.enrollInInstantly(
            campaignId,
            contactIds,
            {
              skipIfInWorkspace: options.skipIfInWorkspace,
              skipIfInCampaign: options.skipIfInCampaign,
              customVariables: options.customVariables,
            }
          );
          break;

        case 'LINKEDIN':
          logger.info({ campaignId, channel: 'LINKEDIN' }, 'Exporting to Google Sheets');
          channelResult = await linkedInOutreachService.enrollInPhantomBuster(
            campaignId,
            contactIds,
            {
              customFields: options.customFields,
              clearExisting: options.clearExisting,
            }
          );
          break;

        case 'SMS':
          logger.info({ campaignId, channel: 'SMS' }, 'SMS campaigns must be sent manually');
          channelResult = {
            message: 'SMS enrolled. Use POST /contacts/:id/sms to send messages',
            enrolled: enrollmentResult.enrolled,
          };
          break;

        default:
          throw new AppError('Unsupported campaign channel', 400, 'INVALID_CHANNEL');
      }

      sendSuccess(res, {
        enrollment: enrollmentResult,
        channel: campaign.channel,
        channelResult,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Stop enrollment for specific contact
   * POST /campaigns/:campaignId/stop/:contactId
   */
  async stopEnrollment(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { campaignId, contactId } = req.params;
      const { reason = 'manual_stop' } = req.body || {};

      await campaignService.stopEnrollment(campaignId, contactId, reason);

      sendSuccess(res, { message: 'Enrollment stopped successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get campaign enrollments
   * GET /campaigns/:id/enrollments
   */
  async getEnrollments(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const filters = {
        status: req.query.status as any,
        limit: req.query.limit ? Number(req.query.limit) : undefined,
        offset: req.query.offset ? Number(req.query.offset) : undefined,
      };

      const result = await campaignService.getEnrollments(
        req.params.id,
        filters
      );

      const page = Math.floor((filters.offset || 0) / (filters.limit || 50)) + 1;
      const totalPages = Math.ceil(result.total / (filters.limit || 50));

      sendPaginated(res, result.enrollments, {
        total: result.total,
        limit: filters.limit || 50,
        page,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get campaign statistics
   * GET /campaigns/:id/stats
   */
  async getCampaignStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const stats = await campaignService.getCampaignStats(req.params.id);
      sendSuccess(res, stats);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get aggregated outreach stats by channel
   * GET /campaigns/outreach-stats
   */
  async getOutreachStats(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      const stats = await campaignService.getOutreachStats(userId);
      sendSuccess(res, stats);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Send SMS to a contact
   * POST /contacts/:id/sms
   */
  async sendSMS(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { message, variables } = req.body;
      const contactId = req.params.id;

      const result = await smsOutreachService.sendSMS({
        contactId,
        message,
        variables,
      });

      if (!result.success) {
        throw new AppError(result.error || 'Failed to send SMS', 500, 'SMS_SEND_ERROR');
      }

      sendSuccess(res, {
        messageSid: result.messageSid,
        message: 'SMS sent successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Preview SMS message
   * POST /contacts/:id/sms/preview
   */
  async previewSMS(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { message, variables } = req.body;
      const contactId = req.params.id;

      const preview = await smsOutreachService.previewSMS(
        contactId,
        message,
        variables
      );

      sendSuccess(res, preview);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Sync campaigns from Instantly
   * POST /campaigns/sync/instantly
   */
  async syncFromInstantly(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const userId = req.user?.userId;
      logger.info({ userId }, 'Starting Instantly campaign sync');
      const result = await campaignService.syncFromInstantly(userId);
      sendSuccess(res, {
        message: `Synced ${result.campaigns.length} campaigns from Instantly`,
        created: result.created,
        updated: result.updated,
        campaigns: result.campaigns.map(c => ({
          id: c.id,
          name: c.name,
          channel: c.channel,
          instantlyCampaignId: c.instantlyCampaignId,
          status: c.status,
        })),
      });
    } catch (error) {
      next(error);
    }
  }
}

export const campaignController = new CampaignController();


/**
 * Template Controller
 * API endpoints for managing message templates
 */

import { Request, Response, NextFunction } from 'express';
import { messageTemplateService } from '../services/templates/message-template.service';
import { sendSuccess, sendCreated, sendPaginated } from '../utils/response';
import { logger } from '../utils/logger';

export class TemplateController {
  /**
   * Create a new template
   * POST /templates
   */
  async createTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const template = await messageTemplateService.createTemplate({ ...req.body, userId });
      sendCreated(res, { ...template, message: 'Template created successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get template by ID
   * GET /templates/:id
   */
  async getTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const template = await messageTemplateService.getTemplate(req.params.id);
      sendSuccess(res, template);
    } catch (error) {
      next(error);
    }
  }

  /**
   * List templates
   * GET /templates
   */
  async listTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const filters = {
        channel: req.query.channel as any,
        isActive: req.query.isActive === 'true' ? true : req.query.isActive === 'false' ? false : undefined,
        isDefault: req.query.isDefault === 'true' ? true : req.query.isDefault === 'false' ? false : undefined,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 50,
        offset: req.query.offset ? Number(req.query.offset) : 0,
      };

      const result = await messageTemplateService.listTemplates(filters);

      const page = Math.floor((filters.offset || 0) / (filters.limit || 50)) + 1;
      const totalPages = Math.ceil(result.total / (filters.limit || 50));

      sendPaginated(res, result.templates, {
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
   * Update template
   * PATCH /templates/:id
   */
  async updateTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const template = await messageTemplateService.updateTemplate(req.params.id, req.body);
      sendSuccess(res, { ...template, message: 'Template updated successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete template
   * DELETE /templates/:id
   */
  async deleteTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await messageTemplateService.deleteTemplate(req.params.id);
      sendSuccess(res, { message: 'Template deleted successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Preview template with sample data
   * POST /templates/:id/preview
   */
  async previewTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const preview = await messageTemplateService.previewTemplate(
        req.params.id,
        req.body.sampleData
      );
      sendSuccess(res, preview);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get default template for a channel
   * GET /templates/default/:channel
   */
  async getDefaultTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const channel = req.params.channel.toUpperCase() as 'SMS' | 'EMAIL';
      const template = await messageTemplateService.getDefaultTemplate(channel);

      if (!template) {
        sendSuccess(res, { template: null, message: `No default template for ${channel}` });
        return;
      }

      sendSuccess(res, template);
    } catch (error) {
      next(error);
    }
  }

  /**
   * Set template as default
   * POST /templates/:id/set-default
   */
  async setAsDefault(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const template = await messageTemplateService.updateTemplate(req.params.id, {
        isDefault: true,
      });
      sendSuccess(res, { ...template, message: 'Template set as default' });
    } catch (error) {
      next(error);
    }
  }
}

export const templateController = new TemplateController();


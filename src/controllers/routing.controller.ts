/**
 * Campaign Routing Controller
 * Handles HTTP requests for campaign routing rules
 */

import { Request, Response, NextFunction } from 'express';
import { campaignRoutingService, CreateRoutingRuleData, UpdateRoutingRuleData } from '../services/campaign/routing.service';
import { logger } from '../utils/logger';
import { AppError } from '../utils/errors';

export class RoutingController {
  /**
   * List all routing rules
   * GET /campaigns/routing-rules
   */
  async listRules(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { isActive, campaignId } = req.query;

      const rules = await campaignRoutingService.listRules({
        isActive: isActive !== undefined ? isActive === 'true' : undefined,
        campaignId: campaignId as string | undefined,
      });

      res.json({
        success: true,
        data: rules,
        count: rules.length,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get a single routing rule
   * GET /campaigns/routing-rules/:id
   */
  async getRule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      const rule = await campaignRoutingService.getRule(id);

      if (!rule) {
        throw new AppError('Routing rule not found', 404, 'RULE_NOT_FOUND');
      }

      res.json({
        success: true,
        data: rule,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Create a new routing rule
   * POST /campaigns/routing-rules
   */
  async createRule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data: CreateRoutingRuleData = req.body;

      // Validate required fields
      if (!data.name || !data.campaignId) {
        throw new AppError('Name and campaignId are required', 400, 'VALIDATION_ERROR');
      }

      logger.info({ name: data.name, campaignId: data.campaignId }, 'Creating routing rule');

      const rule = await campaignRoutingService.createRule(data);

      res.status(201).json({
        success: true,
        data: rule,
        message: 'Routing rule created successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Update a routing rule
   * PUT /campaigns/routing-rules/:id
   */
  async updateRule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const data: UpdateRoutingRuleData = req.body;

      logger.info({ ruleId: id }, 'Updating routing rule');

      const rule = await campaignRoutingService.updateRule(id, data);

      res.json({
        success: true,
        data: rule,
        message: 'Routing rule updated successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Delete a routing rule
   * DELETE /campaigns/routing-rules/:id
   */
  async deleteRule(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;

      logger.info({ ruleId: id }, 'Deleting routing rule');

      await campaignRoutingService.deleteRule(id);

      res.json({
        success: true,
        message: 'Routing rule deleted successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Reorder routing rules
   * POST /campaigns/routing-rules/reorder
   */
  async reorderRules(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { ruleIds } = req.body;

      if (!Array.isArray(ruleIds) || ruleIds.length === 0) {
        throw new AppError('ruleIds must be a non-empty array', 400, 'VALIDATION_ERROR');
      }

      logger.info({ ruleCount: ruleIds.length }, 'Reordering routing rules');

      const rules = await campaignRoutingService.reorderRules(ruleIds);

      res.json({
        success: true,
        data: rules,
        message: 'Routing rules reordered successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Test routing for a contact
   * POST /campaigns/routing-rules/test
   */
  async testRouting(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { contactId } = req.body;

      if (!contactId) {
        throw new AppError('contactId is required', 400, 'VALIDATION_ERROR');
      }

      logger.info({ contactId }, 'Testing routing for contact');

      const result = await campaignRoutingService.testRouting(contactId);

      res.json({
        success: true,
        data: {
          campaign: result.campaign,
          matchedRule: result.matchedRule,
          fallbackUsed: result.fallbackUsed,
        },
        message: result.campaign 
          ? `Contact would be routed to campaign: ${result.campaign.name}`
          : 'Contact would not be enrolled (no matching rule or fallback)',
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get filter options for the UI
   * GET /campaigns/routing-rules/filter-options
   */
  async getFilterOptions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const options = await campaignRoutingService.getFilterOptions();

      res.json({
        success: true,
        data: options,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get example contacts for testing routing
   * GET /campaigns/routing-rules/example-contacts
   */
  async getExampleContacts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { limit = '10' } = req.query;
      
      const contacts = await campaignRoutingService.getExampleContacts(
        parseInt(limit as string, 10)
      );
      
      res.json({
        success: true,
        data: contacts,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const routingController = new RoutingController();


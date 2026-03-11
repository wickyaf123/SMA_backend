/**
 * Campaign Routing Service
 * Routes leads to different Instantly campaigns based on configurable rules
 * 
 * Rules are evaluated by priority (highest first). First matching rule wins.
 * Supports AND/OR logic for filter matching.
 */

import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';
import type {
  Campaign,
  CampaignRoutingRule,
  Contact,
  Company,
} from '@prisma/client';

// Types for the routing service
export type MatchMode = 'ALL' | 'ANY';

export interface CreateRoutingRuleData {
  name: string;
  description?: string;
  priority?: number;
  isActive?: boolean;
  matchMode?: MatchMode;
  sourceFilter?: string[];
  industryFilter?: string[];
  stateFilter?: string[];
  countryFilter?: string[];
  tagsFilter?: string[];
  employeesMinFilter?: number | null;
  employeesMaxFilter?: number | null;
  campaignId: string;
}

export interface UpdateRoutingRuleData {
  name?: string;
  description?: string | null;
  priority?: number;
  isActive?: boolean;
  matchMode?: MatchMode;
  sourceFilter?: string[];
  industryFilter?: string[];
  stateFilter?: string[];
  countryFilter?: string[];
  tagsFilter?: string[];
  employeesMinFilter?: number | null;
  employeesMaxFilter?: number | null;
  campaignId?: string;
}

export interface RoutingRuleWithCampaign extends CampaignRoutingRule {
  campaign: Campaign;
}

export interface RouteContactResult {
  campaign: Campaign | null;
  matchedRule: CampaignRoutingRule | null;
  fallbackUsed: boolean;
}

// Contact with company for routing evaluation
type ContactWithCompany = Contact & {
  company?: Company | null;
};

export class CampaignRoutingService {
  /**
   * Route a contact to the appropriate campaign based on routing rules
   * Evaluates rules by priority (highest first), returns first match
   */
  async routeContact(contact: ContactWithCompany): Promise<RouteContactResult> {
    try {
      logger.debug({ contactId: contact.id }, 'Routing contact to campaign');

      // Fetch active rules ordered by priority DESC
      const rules = await prisma.campaignRoutingRule.findMany({
        where: { isActive: true },
        orderBy: { priority: 'desc' },
        include: { campaign: true },
      });

      // Evaluate each rule
      for (const rule of rules) {
        if (this.matchesRule(contact, rule)) {
          logger.info(
            { contactId: contact.id, ruleId: rule.id, ruleName: rule.name, campaignId: rule.campaignId },
            'Contact matched routing rule'
          );
          return {
            campaign: rule.campaign,
            matchedRule: rule,
            fallbackUsed: false,
          };
        }
      }

      // No rule matched - check fallback behavior
      const settings = await prisma.settings.findFirst();
      const fallbackBehavior = settings?.routingFallbackBehavior || 'default_campaign';

      if (fallbackBehavior === 'skip') {
        logger.info({ contactId: contact.id }, 'No routing rule matched, skipping enrollment (fallback: skip)');
        return {
          campaign: null,
          matchedRule: null,
          fallbackUsed: true,
        };
      }

      // Use default campaign
      if (settings?.defaultEmailCampaignId) {
        const defaultCampaign = await prisma.campaign.findUnique({
          where: { id: settings.defaultEmailCampaignId },
        });

        if (defaultCampaign) {
          logger.info(
            { contactId: contact.id, campaignId: defaultCampaign.id },
            'No routing rule matched, using default campaign'
          );
          return {
            campaign: defaultCampaign,
            matchedRule: null,
            fallbackUsed: true,
          };
        }
      }

      logger.info({ contactId: contact.id }, 'No routing rule matched and no default campaign configured');
      return {
        campaign: null,
        matchedRule: null,
        fallbackUsed: true,
      };
    } catch (error) {
      logger.error({ error, contactId: contact.id }, 'Error routing contact');
      throw new AppError('Failed to route contact', 500, 'ROUTING_ERROR');
    }
  }

  /**
   * Check if a contact matches a routing rule
   * Supports ALL (AND) and ANY (OR) match modes
   */
  private matchesRule(contact: ContactWithCompany, rule: CampaignRoutingRule): boolean {
    const matchMode = rule.matchMode as MatchMode;
    const filters: boolean[] = [];

    // Source filter
    if (rule.sourceFilter && rule.sourceFilter.length > 0) {
      const contactSource = (contact.source || '').toLowerCase();
      const sourceMatch = rule.sourceFilter.some(
        (s) => s.toLowerCase() === contactSource
      );
      filters.push(sourceMatch);
    }

    // Industry filter (via company)
    if (rule.industryFilter && rule.industryFilter.length > 0) {
      const contactIndustry = (contact.company?.industry || '').toLowerCase();
      const industryMatch = rule.industryFilter.some(
        (i) => i.toLowerCase() === contactIndustry
      );
      filters.push(industryMatch);
    }

    // State filter
    if (rule.stateFilter && rule.stateFilter.length > 0) {
      const contactState = (contact.state || '').toLowerCase();
      const stateMatch = rule.stateFilter.some(
        (s) => s.toLowerCase() === contactState
      );
      filters.push(stateMatch);
    }

    // Country filter
    if (rule.countryFilter && rule.countryFilter.length > 0) {
      const contactCountry = (contact.country || '').toLowerCase();
      const countryMatch = rule.countryFilter.some(
        (c) => c.toLowerCase() === contactCountry
      );
      filters.push(countryMatch);
    }

    // Tags filter
    if (rule.tagsFilter && rule.tagsFilter.length > 0) {
      const contactTags = (contact.tags || []).map((t) => t.toLowerCase());
      const tagsMatch = rule.tagsFilter.some((tag) =>
        contactTags.includes(tag.toLowerCase())
      );
      filters.push(tagsMatch);
    }

    // Company size filters
    if (rule.employeesMinFilter !== null && rule.employeesMinFilter !== undefined) {
      const companySize = this.parseCompanySize(contact.company?.size);
      if (companySize !== null) {
        filters.push(companySize >= rule.employeesMinFilter);
      } else {
        // If we can't determine company size, don't match on this filter
        filters.push(false);
      }
    }

    if (rule.employeesMaxFilter !== null && rule.employeesMaxFilter !== undefined) {
      const companySize = this.parseCompanySize(contact.company?.size);
      if (companySize !== null) {
        filters.push(companySize <= rule.employeesMaxFilter);
      } else {
        filters.push(false);
      }
    }

    // If no filters are defined, the rule matches everything
    if (filters.length === 0) {
      return true;
    }

    // Apply match mode
    if (matchMode === 'ANY') {
      return filters.some((f) => f);
    }
    
    // Default: ALL (AND)
    return filters.every((f) => f);
  }

  /**
   * Parse company size string to a number
   * Handles various formats like "10-50", "50+", "100", etc.
   */
  private parseCompanySize(size: string | null | undefined): number | null {
    if (!size) return null;
    
    // Try to extract a number
    const cleanSize = size.replace(/[,\s]/g, '');
    
    // Handle range formats like "10-50" - use the upper bound
    if (cleanSize.includes('-')) {
      const parts = cleanSize.split('-');
      const upper = parseInt(parts[1], 10);
      if (!isNaN(upper)) return upper;
    }
    
    // Handle "50+" format
    if (cleanSize.includes('+')) {
      const num = parseInt(cleanSize.replace('+', ''), 10);
      if (!isNaN(num)) return num;
    }
    
    // Try direct parse
    const num = parseInt(cleanSize, 10);
    if (!isNaN(num)) return num;
    
    return null;
  }

  // ==================== CRUD Operations ====================

  /**
   * Create a new routing rule
   */
  async createRule(data: CreateRoutingRuleData): Promise<RoutingRuleWithCampaign> {
    try {
      logger.info({ name: data.name, campaignId: data.campaignId }, 'Creating routing rule');

      // Verify campaign exists and is EMAIL type
      const campaign = await prisma.campaign.findUnique({
        where: { id: data.campaignId },
      });

      if (!campaign) {
        throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
      }

      if (campaign.channel !== 'EMAIL') {
        throw new AppError('Routing rules can only target EMAIL campaigns', 400, 'INVALID_CAMPAIGN_TYPE');
      }

      const rule = await prisma.campaignRoutingRule.create({
        data: {
          name: data.name,
          description: data.description,
          priority: data.priority ?? 0,
          isActive: data.isActive ?? true,
          matchMode: data.matchMode ?? 'ALL',
          sourceFilter: data.sourceFilter ?? [],
          industryFilter: data.industryFilter ?? [],
          stateFilter: data.stateFilter ?? [],
          countryFilter: data.countryFilter ?? [],
          tagsFilter: data.tagsFilter ?? [],
          employeesMinFilter: data.employeesMinFilter,
          employeesMaxFilter: data.employeesMaxFilter,
          campaignId: data.campaignId,
        },
        include: { campaign: true },
      });

      logger.info({ ruleId: rule.id, name: rule.name }, 'Routing rule created');
      return rule;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ error, data }, 'Failed to create routing rule');
      throw new AppError('Failed to create routing rule', 500, 'CREATE_RULE_ERROR');
    }
  }

  /**
   * Update an existing routing rule
   */
  async updateRule(id: string, data: UpdateRoutingRuleData): Promise<RoutingRuleWithCampaign> {
    try {
      logger.info({ ruleId: id, updates: Object.keys(data) }, 'Updating routing rule');

      // Verify rule exists
      const existing = await prisma.campaignRoutingRule.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new AppError('Routing rule not found', 404, 'RULE_NOT_FOUND');
      }

      // If changing campaign, verify it exists and is EMAIL type
      if (data.campaignId && data.campaignId !== existing.campaignId) {
        const campaign = await prisma.campaign.findUnique({
          where: { id: data.campaignId },
        });

        if (!campaign) {
          throw new AppError('Campaign not found', 404, 'CAMPAIGN_NOT_FOUND');
        }

        if (campaign.channel !== 'EMAIL') {
          throw new AppError('Routing rules can only target EMAIL campaigns', 400, 'INVALID_CAMPAIGN_TYPE');
        }
      }

      const rule = await prisma.campaignRoutingRule.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
        include: { campaign: true },
      });

      logger.info({ ruleId: rule.id }, 'Routing rule updated');
      return rule;
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ error, id, data }, 'Failed to update routing rule');
      throw new AppError('Failed to update routing rule', 500, 'UPDATE_RULE_ERROR');
    }
  }

  /**
   * Delete a routing rule
   */
  async deleteRule(id: string): Promise<void> {
    try {
      logger.info({ ruleId: id }, 'Deleting routing rule');

      const existing = await prisma.campaignRoutingRule.findUnique({
        where: { id },
      });

      if (!existing) {
        throw new AppError('Routing rule not found', 404, 'RULE_NOT_FOUND');
      }

      await prisma.campaignRoutingRule.delete({
        where: { id },
      });

      logger.info({ ruleId: id }, 'Routing rule deleted');
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ error, id }, 'Failed to delete routing rule');
      throw new AppError('Failed to delete routing rule', 500, 'DELETE_RULE_ERROR');
    }
  }

  /**
   * Get a single routing rule by ID
   */
  async getRule(id: string): Promise<RoutingRuleWithCampaign | null> {
    return prisma.campaignRoutingRule.findUnique({
      where: { id },
      include: { campaign: true },
    });
  }

  /**
   * List all routing rules
   */
  async listRules(filters?: {
    isActive?: boolean;
    campaignId?: string;
  }): Promise<RoutingRuleWithCampaign[]> {
    const where: any = {};

    if (filters?.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters?.campaignId) {
      where.campaignId = filters.campaignId;
    }

    return prisma.campaignRoutingRule.findMany({
      where,
      orderBy: { priority: 'desc' },
      include: { campaign: true },
    });
  }

  /**
   * Reorder rules by updating their priorities
   * @param ruleIds - Array of rule IDs in desired priority order (first = highest priority)
   */
  async reorderRules(ruleIds: string[]): Promise<RoutingRuleWithCampaign[]> {
    try {
      logger.info({ ruleCount: ruleIds.length }, 'Reordering routing rules');

      // Update priorities based on position in array
      // First item gets highest priority
      const updates = ruleIds.map((id, index) => 
        prisma.campaignRoutingRule.update({
          where: { id },
          data: { 
            priority: (ruleIds.length - index) * 10, // 10, 20, 30, etc.
            updatedAt: new Date(),
          },
        })
      );

      await prisma.$transaction(updates);

      logger.info({ ruleCount: ruleIds.length }, 'Routing rules reordered');

      return this.listRules();
    } catch (error) {
      logger.error({ error, ruleIds }, 'Failed to reorder routing rules');
      throw new AppError('Failed to reorder routing rules', 500, 'REORDER_RULES_ERROR');
    }
  }

  /**
   * Test routing for a specific contact
   * Returns which rule would match (if any) without actually enrolling
   */
  async testRouting(contactId: string): Promise<RouteContactResult> {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { company: true },
    });

    if (!contact) {
      throw new AppError('Contact not found', 404, 'CONTACT_NOT_FOUND');
    }

    return this.routeContact(contact);
  }

  /**
   * Get available filter options for the UI
   * Returns predefined common values merged with distinct values from the database
   * This allows users to create routing rules before importing contacts
   */
  async getFilterOptions(): Promise<{
    sources: string[];
    industries: string[];
    states: string[];
    countries: string[];
    tags: string[];
  }> {
    // Predefined sources (all available integration types)
    const predefinedSources = ['apollo', 'google_maps', 'manual', 'csv', 'scraper'];
    
    // Predefined industries (contractor-focused)
    const predefinedIndustries = [
      'HVAC',
      'Solar',
      'Roofing',
      'Plumbing',
      'Electrical',
      'Construction',
      'General Contractor',
      'Home Improvement',
      'Remodeling',
    ];
    
    // All 50 US states
    const predefinedStates = [
      'Alabama', 'Alaska', 'Arizona', 'Arkansas', 'California',
      'Colorado', 'Connecticut', 'Delaware', 'Florida', 'Georgia',
      'Hawaii', 'Idaho', 'Illinois', 'Indiana', 'Iowa',
      'Kansas', 'Kentucky', 'Louisiana', 'Maine', 'Maryland',
      'Massachusetts', 'Michigan', 'Minnesota', 'Mississippi', 'Missouri',
      'Montana', 'Nebraska', 'Nevada', 'New Hampshire', 'New Jersey',
      'New Mexico', 'New York', 'North Carolina', 'North Dakota', 'Ohio',
      'Oklahoma', 'Oregon', 'Pennsylvania', 'Rhode Island', 'South Carolina',
      'South Dakota', 'Tennessee', 'Texas', 'Utah', 'Vermont',
      'Virginia', 'Washington', 'West Virginia', 'Wisconsin', 'Wyoming',
    ];
    
    // Common countries
    const predefinedCountries = ['United States', 'Canada', 'Mexico'];

    // Get distinct sources from contacts
    const sourcesResult = await prisma.contact.findMany({
      where: { source: { not: null } },
      select: { source: true },
      distinct: ['source'],
    });

    // Get distinct industries from companies
    const industriesResult = await prisma.company.findMany({
      where: { industry: { not: null } },
      select: { industry: true },
      distinct: ['industry'],
    });

    // Get distinct states from contacts
    const statesResult = await prisma.contact.findMany({
      where: { state: { not: null } },
      select: { state: true },
      distinct: ['state'],
    });

    // Get distinct countries from contacts
    const countriesResult = await prisma.contact.findMany({
      where: { country: { not: null } },
      select: { country: true },
      distinct: ['country'],
    });

    // Get distinct tags - this is more complex since tags is an array
    const contactsWithTags = await prisma.contact.findMany({
      where: { tags: { isEmpty: false } },
      select: { tags: true },
    });
    const allTags = new Set<string>();
    contactsWithTags.forEach((c) => c.tags.forEach((t) => allTags.add(t)));

    // Merge predefined values with database values (deduplicate with Set)
    const dbSources = sourcesResult.map((r) => r.source!).filter(Boolean);
    const dbIndustries = industriesResult.map((r) => r.industry!).filter(Boolean);
    const dbStates = statesResult.map((r) => r.state!).filter(Boolean);
    const dbCountries = countriesResult.map((r) => r.country!).filter(Boolean);

    return {
      sources: Array.from(new Set([...predefinedSources, ...dbSources])).sort(),
      industries: Array.from(new Set([...predefinedIndustries, ...dbIndustries])).sort(),
      states: Array.from(new Set([...predefinedStates, ...dbStates])).sort(),
      countries: Array.from(new Set([...predefinedCountries, ...dbCountries])).sort(),
      tags: Array.from(allTags).sort(), // Tags remain database-only (user-defined)
    };
  }

  /**
   * Get example contacts for testing routing
   * Returns a diverse set of contacts with different attributes
   */
  async getExampleContacts(limit: number = 10): Promise<Array<{
    id: string;
    label: string;
    email: string;
    source: string | null;
    industry: string | null;
    state: string | null;
    country: string | null;
    tags: string[];
  }>> {
    const contacts = await prisma.contact.findMany({
      take: limit,
      include: { company: true },
      orderBy: { createdAt: 'desc' },
    });
    
    return contacts.map(contact => {
      const displayName = contact.fullName || contact.email;
      const companyName = contact.company?.name || 'No Company';
      const location = contact.state || 'Unknown State';
      
      return {
        id: contact.id,
        label: `${displayName} - ${companyName} (${location})`,
        email: contact.email || '',
        source: contact.source,
        industry: contact.company?.industry || null,
        state: contact.state,
        country: contact.country,
        tags: contact.tags,
      };
    });
  }
}

export const campaignRoutingService = new CampaignRoutingService();


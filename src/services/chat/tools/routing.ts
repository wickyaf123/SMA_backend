import { ToolDefinition, ToolHandler, ToolRegistry } from './types';
import { campaignRoutingService } from '../../campaign/routing.service';

const definitions: ToolDefinition[] = [
  {
    name: 'list_routing_rules',
    description:
      'List campaign routing rules. Rules determine which campaign a contact is enrolled in based on filters.',
    input_schema: {
      type: 'object',
      properties: {
        isActive: { type: 'boolean', description: 'Filter by active status' },
        campaignId: { type: 'string', description: 'Filter by target campaign ID' },
      },
    },
  },
  {
    name: 'create_routing_rule',
    description:
      'Create a new campaign routing rule. Routes contacts to campaigns based on source, state, industry, tags, and company size filters.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Rule name' },
        description: { type: 'string', description: 'Rule description' },
        priority: { type: 'number', description: 'Priority (higher = evaluated first, default 0)' },
        isActive: { type: 'boolean', description: 'Whether the rule is active (default true)' },
        matchMode: { type: 'string', description: 'Match mode: ALL (AND logic) or ANY (OR logic). Default ALL.' },
        sourceFilter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Match contacts from these sources (e.g., apollo, google_maps)',
        },
        industryFilter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Match contacts in these industries',
        },
        stateFilter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Match contacts in these states',
        },
        countryFilter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Match contacts in these countries',
        },
        tagsFilter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Match contacts with any of these tags',
        },
        employeesMinFilter: { type: 'number', description: 'Minimum company size' },
        employeesMaxFilter: { type: 'number', description: 'Maximum company size' },
        campaignId: { type: 'string', description: 'Target campaign ID to route matching contacts to' },
      },
      required: ['name', 'campaignId'],
    },
  },
  {
    name: 'update_routing_rule',
    description:
      'Update an existing campaign routing rule by ID.',
    input_schema: {
      type: 'object',
      properties: {
        ruleId: { type: 'string', description: 'The routing rule ID to update' },
        name: { type: 'string', description: 'Rule name' },
        description: { type: 'string', description: 'Rule description' },
        priority: { type: 'number', description: 'Priority' },
        isActive: { type: 'boolean', description: 'Active status' },
        matchMode: { type: 'string', description: 'Match mode: ALL or ANY' },
        sourceFilter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Source filter values',
        },
        industryFilter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Industry filter values',
        },
        stateFilter: {
          type: 'array',
          items: { type: 'string' },
          description: 'State filter values',
        },
        countryFilter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Country filter values',
        },
        tagsFilter: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags filter values',
        },
        employeesMinFilter: { type: 'number', description: 'Minimum company size' },
        employeesMaxFilter: { type: 'number', description: 'Maximum company size' },
        campaignId: { type: 'string', description: 'Target campaign ID' },
      },
      required: ['ruleId'],
    },
  },
  {
    name: 'delete_routing_rule',
    description: 'Delete a campaign routing rule by ID.',
    input_schema: {
      type: 'object',
      properties: {
        ruleId: { type: 'string', description: 'The routing rule ID to delete' },
      },
      required: ['ruleId'],
    },
  },
];

const handlers: Record<string, ToolHandler> = {
  list_routing_rules: async (input) => {
    const ruleFilters: Record<string, any> = {};
    if (input.isActive !== undefined) ruleFilters.isActive = input.isActive;
    if (input.campaignId) ruleFilters.campaignId = input.campaignId;

    const rules = await campaignRoutingService.listRules(ruleFilters);

    return {
      success: true,
      data: {
        rules,
        total: rules.length,
      },
    };
  },

  create_routing_rule: async (input) => {
    const newRule = await campaignRoutingService.createRule({
      name: input.name,
      description: input.description,
      priority: input.priority,
      isActive: input.isActive,
      matchMode: input.matchMode,
      sourceFilter: input.sourceFilter,
      industryFilter: input.industryFilter,
      stateFilter: input.stateFilter,
      countryFilter: input.countryFilter,
      tagsFilter: input.tagsFilter,
      employeesMinFilter: input.employeesMinFilter,
      employeesMaxFilter: input.employeesMaxFilter,
      campaignId: input.campaignId,
    });

    return {
      success: true,
      data: {
        rule: newRule,
        message: `Routing rule "${newRule.name}" created and targeting campaign "${newRule.campaign.name}".`,
      },
    };
  },

  update_routing_rule: async (input) => {
    const ruleUpdateData: Record<string, any> = {};
    const allowedRuleFields = [
      'name', 'description', 'priority', 'isActive', 'matchMode',
      'sourceFilter', 'industryFilter', 'stateFilter', 'countryFilter',
      'tagsFilter', 'employeesMinFilter', 'employeesMaxFilter', 'campaignId',
    ];
    for (const field of allowedRuleFields) {
      if (input[field] !== undefined) {
        ruleUpdateData[field] = input[field];
      }
    }

    if (Object.keys(ruleUpdateData).length === 0) {
      return { success: false, error: 'No valid fields provided to update' };
    }

    const updatedRule = await campaignRoutingService.updateRule(
      input.ruleId,
      ruleUpdateData
    );

    return {
      success: true,
      data: {
        rule: updatedRule,
        message: `Routing rule "${updatedRule.name}" updated.`,
      },
    };
  },

  delete_routing_rule: async (input) => {
    await campaignRoutingService.deleteRule(input.ruleId);

    return {
      success: true,
      data: {
        message: `Routing rule ${input.ruleId} deleted successfully.`,
      },
    };
  },
};

export function registerTools(registry: ToolRegistry): void {
  for (const def of definitions) {
    registry.register(def, handlers[def.name]);
  }
}

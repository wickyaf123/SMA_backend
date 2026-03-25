import { ToolDefinition, ToolHandler, ToolRegistry } from './types';
import { messageTemplateService } from '../../templates/message-template.service';

const definitions: ToolDefinition[] = [
  {
    name: 'list_templates',
    description:
      'List message templates with optional channel and active status filters.',
    input_schema: {
      type: 'object',
      properties: {
        channel: {
          type: 'string',
          description: 'Filter by channel (SMS, EMAIL)',
        },
        isActive: {
          type: 'boolean',
          description: 'Filter by active status',
        },
        limit: { type: 'number', description: 'Max templates to return (default 50)' },
      },
    },
  },
  {
    name: 'create_template',
    description:
      'Create a new message template for SMS or Email outreach.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Template name' },
        channel: { type: 'string', description: 'Channel: SMS or EMAIL' },
        subject: { type: 'string', description: 'Email subject line (only for EMAIL channel)' },
        body: { type: 'string', description: 'Message body. Supports {{variable}} placeholders.' },
        description: { type: 'string', description: 'Optional description of the template' },
        isDefault: { type: 'boolean', description: 'Set as default template for this channel' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for organizing templates',
        },
      },
      required: ['name', 'channel', 'body'],
    },
  },
  {
    name: 'update_template',
    description:
      'Update an existing message template by ID.',
    input_schema: {
      type: 'object',
      properties: {
        templateId: { type: 'string', description: 'The template ID to update' },
        name: { type: 'string', description: 'Template name' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Message body' },
        description: { type: 'string', description: 'Template description' },
        isActive: { type: 'boolean', description: 'Active status' },
        isDefault: { type: 'boolean', description: 'Set as default for this channel' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags for organizing templates',
        },
      },
      required: ['templateId'],
    },
  },
  {
    name: 'delete_template',
    description: 'Delete a message template by ID.',
    input_schema: {
      type: 'object',
      properties: {
        templateId: { type: 'string', description: 'The template ID to delete' },
      },
      required: ['templateId'],
    },
  },
];

const handlers: Record<string, ToolHandler> = {
  list_templates: async (input) => {
    const templateFilters: Record<string, any> = {};
    if (input.channel) templateFilters.channel = input.channel;
    if (input.isActive !== undefined) templateFilters.isActive = input.isActive;
    if (input.limit) templateFilters.limit = input.limit;

    const templateResult = await messageTemplateService.listTemplates(templateFilters);

    return {
      success: true,
      data: {
        templates: templateResult.templates,
        total: templateResult.total,
      },
    };
  },

  create_template: async (input) => {
    const newTemplate = await messageTemplateService.createTemplate({
      name: input.name,
      channel: input.channel,
      subject: input.subject,
      body: input.body,
      description: input.description,
      isDefault: input.isDefault,
      tags: input.tags,
    });

    return {
      success: true,
      data: {
        template: newTemplate,
        message: `Template "${newTemplate.name}" created successfully.`,
      },
    };
  },

  update_template: async (input) => {
    const templateUpdateData: Record<string, any> = {};
    const allowedTemplateFields = ['name', 'subject', 'body', 'description', 'isActive', 'isDefault', 'tags'];
    for (const field of allowedTemplateFields) {
      if (input[field] !== undefined) {
        templateUpdateData[field] = input[field];
      }
    }

    if (Object.keys(templateUpdateData).length === 0) {
      return { success: false, error: 'No valid fields provided to update' };
    }

    const updatedTemplate = await messageTemplateService.updateTemplate(
      input.templateId,
      templateUpdateData
    );

    return {
      success: true,
      data: {
        template: updatedTemplate,
        message: `Template updated: ${Object.keys(templateUpdateData).join(', ')}`,
      },
    };
  },

  delete_template: async (input) => {
    await messageTemplateService.deleteTemplate(input.templateId);

    return {
      success: true,
      data: {
        message: `Template ${input.templateId} deleted successfully.`,
      },
    };
  },
};

export function registerTools(registry: ToolRegistry): void {
  for (const def of definitions) {
    registry.register(def, handlers[def.name]);
  }
}

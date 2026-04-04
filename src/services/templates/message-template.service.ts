/**
 * Message Template Service
 * Manages SMS and Email templates for outreach campaigns
 */

import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { AppError } from '../../utils/errors';
import { TemplateChannel } from '@prisma/client';

export interface CreateTemplateData {
  name: string;
  channel: TemplateChannel;
  subject?: string;
  body: string;
  description?: string;
  isDefault?: boolean;
  tags?: string[];
}

export interface UpdateTemplateData {
  name?: string;
  subject?: string;
  body?: string;
  description?: string;
  isDefault?: boolean;
  isActive?: boolean;
  tags?: string[];
}

export interface TemplateFilters {
  channel?: TemplateChannel;
  isActive?: boolean;
  isDefault?: boolean;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface PersonalizedMessage {
  subject?: string;
  body: string;
  variables: Record<string, string>;
}

class MessageTemplateService {
  /**
   * Extract variables from template string
   * Finds all {{variableName}} patterns
   */
  private extractVariables(template: string): string[] {
    const regex = /\{\{\s*(\w+)\s*\}\}/g;
    const variables: Set<string> = new Set();
    let match;
    
    while ((match = regex.exec(template)) !== null) {
      variables.add(match[1]);
    }
    
    return Array.from(variables);
  }

  /**
   * Replace variables in template with actual values
   */
  replaceVariables(template: string, values: Record<string, string>): string {
    let result = template;
    
    Object.entries(values).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'gi');
      result = result.replace(regex, value || '');
    });
    
    return result;
  }

  /**
   * Create a new message template
   */
  async createTemplate(data: CreateTemplateData) {
    try {
      logger.info({ name: data.name, channel: data.channel }, 'Creating message template');

      // Extract variables from body and subject
      const bodyVars = this.extractVariables(data.body);
      const subjectVars = data.subject ? this.extractVariables(data.subject) : [];
      const allVariables = [...new Set([...bodyVars, ...subjectVars])];

      // If setting as default, unset other defaults for this channel
      if (data.isDefault) {
        await prisma.messageTemplate.updateMany({
          where: { channel: data.channel, isDefault: true },
          data: { isDefault: false },
        });
      }

      const template = await prisma.messageTemplate.create({
        data: {
          name: data.name,
          channel: data.channel,
          subject: data.subject,
          body: data.body,
          description: data.description,
          isDefault: data.isDefault ?? false,
          tags: data.tags ?? [],
          variables: allVariables,
          ...((data as any).userId && { userId: (data as any).userId }),
        },
      });

      logger.info({ templateId: template.id }, 'Message template created');
      return template;
    } catch (error) {
      logger.error({ error, data }, 'Failed to create message template');
      throw new AppError('Failed to create template', 500, 'TEMPLATE_CREATE_ERROR');
    }
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId: string) {
    const template = await prisma.messageTemplate.findUnique({
      where: { id: templateId },
    });

    if (!template) {
      throw new AppError('Template not found', 404, 'TEMPLATE_NOT_FOUND');
    }

    return template;
  }

  /**
   * List templates with filters
   */
  async listTemplates(filters: TemplateFilters = {}) {
    const where: any = {};

    if (filters.channel) {
      where.channel = filters.channel;
    }

    if (filters.isActive !== undefined) {
      where.isActive = filters.isActive;
    }

    if (filters.isDefault !== undefined) {
      where.isDefault = filters.isDefault;
    }

    if (filters.tags && filters.tags.length > 0) {
      where.tags = { hasSome: filters.tags };
    }

    const [templates, total] = await Promise.all([
      prisma.messageTemplate.findMany({
        where,
        take: filters.limit || 50,
        skip: filters.offset || 0,
        orderBy: [
          { isDefault: 'desc' },
          { usageCount: 'desc' },
          { createdAt: 'desc' },
        ],
      }),
      prisma.messageTemplate.count({ where }),
    ]);

    return { templates, total };
  }

  /**
   * Update a template
   */
  async updateTemplate(templateId: string, data: UpdateTemplateData) {
    try {
      logger.info({ templateId, updates: Object.keys(data) }, 'Updating message template');

      // Extract variables if body is being updated
      let variables: string[] | undefined;
      if (data.body) {
        const bodyVars = this.extractVariables(data.body);
        const subjectVars = data.subject ? this.extractVariables(data.subject) : [];
        variables = [...new Set([...bodyVars, ...subjectVars])];
      }

      // If setting as default, unset other defaults
      if (data.isDefault) {
        const currentTemplate = await prisma.messageTemplate.findUnique({
          where: { id: templateId },
          select: { channel: true },
        });

        if (currentTemplate) {
          await prisma.messageTemplate.updateMany({
            where: { channel: currentTemplate.channel, isDefault: true, id: { not: templateId } },
            data: { isDefault: false },
          });
        }
      }

      const template = await prisma.messageTemplate.update({
        where: { id: templateId },
        data: {
          ...data,
          ...(variables && { variables }),
        },
      });

      logger.info({ templateId }, 'Message template updated');
      return template;
    } catch (error) {
      logger.error({ error, templateId }, 'Failed to update message template');
      throw new AppError('Failed to update template', 500, 'TEMPLATE_UPDATE_ERROR');
    }
  }

  /**
   * Delete a template
   */
  async deleteTemplate(templateId: string) {
    try {
      logger.info({ templateId }, 'Deleting message template');

      await prisma.messageTemplate.delete({
        where: { id: templateId },
      });

      logger.info({ templateId }, 'Message template deleted');
    } catch (error) {
      logger.error({ error, templateId }, 'Failed to delete message template');
      throw new AppError('Failed to delete template', 500, 'TEMPLATE_DELETE_ERROR');
    }
  }

  /**
   * Get the default template for a channel
   */
  async getDefaultTemplate(channel: TemplateChannel) {
    const template = await prisma.messageTemplate.findFirst({
      where: { channel, isDefault: true, isActive: true },
    });

    return template;
  }

  /**
   * Personalize a template with contact data
   */
  async personalizeTemplate(
    templateId: string,
    contactData: Record<string, string>
  ): Promise<PersonalizedMessage> {
    const template = await this.getTemplate(templateId);

    const personalizedBody = this.replaceVariables(template.body, contactData);
    const personalizedSubject = template.subject
      ? this.replaceVariables(template.subject, contactData)
      : undefined;

    // Update usage stats
    await prisma.messageTemplate.update({
      where: { id: templateId },
      data: {
        usageCount: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });

    return {
      subject: personalizedSubject,
      body: personalizedBody,
      variables: contactData,
    };
  }

  /**
   * Preview a template with sample data
   */
  async previewTemplate(templateId: string, sampleData?: Record<string, string>) {
    const template = await this.getTemplate(templateId);

    // Use sample data or defaults
    const data = sampleData || {
      firstName: 'John',
      lastName: 'Smith',
      fullName: 'John Smith',
      email: 'john@example.com',
      phone: '+1234567890',
      title: 'Owner',
      company: 'ABC Company',
      companyName: 'ABC Company',
    };

    const personalizedBody = this.replaceVariables(template.body, data);
    const personalizedSubject = template.subject
      ? this.replaceVariables(template.subject, data)
      : undefined;

    return {
      template,
      preview: {
        subject: personalizedSubject,
        body: personalizedBody,
      },
      sampleData: data,
      characterCount: personalizedBody.length,
      estimatedSmsSegments: Math.ceil(personalizedBody.length / 160),
    };
  }
}

export const messageTemplateService = new MessageTemplateService();


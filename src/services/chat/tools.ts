import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { campaignService } from '../campaign/campaign.service';
import { campaignRoutingService } from '../campaign/routing.service';
import { smsOutreachService } from '../outreach/sms.service';
import { contactExportService } from '../contact/export.service';
import { messageTemplateService } from '../templates/message-template.service';
import { connectionService } from '../connection/connection.service';
import { settingsService } from '../settings/settings.service';
import { jobLogService } from '../job-log.service';
import { getScheduler } from '../../jobs/scheduler';
import { realieEnrichmentService } from '../enrichment/realie.service';
import { shovelsHomeownerEnrichmentService } from '../enrichment/shovels-homeowner.service';
import { redis } from '../../config/redis';

import { workflowEngine } from '../workflow/workflow.engine';
import { permitPipelineService } from '../permit/permit-pipeline.service';
import { shovelsScraperService } from '../scraper/shovels.service';
import { lookupGeoId } from '../../data/geo-ids';
import { emitJobToConversation, WSEventType } from '../../config/websocket';
import { realtimeEmitter } from '../realtime/event-emitter.service';
import { ghlClient } from '../../integrations/ghl/client';
import { getAllPresets, getPresetById } from '../workflow/workflow-presets';
import { config } from '../../config';
import { validateToolInput } from './tool-schemas';

// Ensure export directory exists on startup
if (!fs.existsSync(config.defaults.exportDir)) {
  fs.mkdirSync(config.defaults.exportDir, { recursive: true });
}

export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, any>;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface ToolContext {
  conversationId?: string;
}

// Tool schemas for Claude API
export const toolDefinitions: ToolDefinition[] = [
  // ==================== EXISTING TOOLS ====================
  {
    name: 'search_permits',
    description:
      'Search for building permits by type, city, and date range. Creates a permit search job.',
    input_schema: {
      type: 'object',
      properties: {
        permitType: {
          type: 'string',
          description:
            'Type of permit (e.g., hvac, plumbing, electrical, roofing, solar)',
        },
        city: { type: 'string', description: 'City to search in' },
        geoId: {
          type: 'string',
          description: 'Geographic ID for the search area',
        },
        startDate: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        endDate: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format',
        },
      },
      required: ['permitType', 'city'],
    },
  },
  {
    name: 'get_permit_searches',
    description: 'Get recent permit search results and their status',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of searches to return (default 10)',
        },
        status: {
          type: 'string',
          description:
            'Filter by status (PENDING, SEARCHING, ENRICHING, COMPLETED, FAILED)',
        },
      },
    },
  },
  {
    name: 'list_contacts',
    description:
      'List contacts from the database with optional filters. Returns contractors/leads.',
    input_schema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Search by name, email, or company',
        },
        status: {
          type: 'string',
          description:
            'Filter by status (NEW, VALIDATED, IN_SEQUENCE, REPLIED, etc.)',
        },
        city: { type: 'string', description: 'Filter by city' },
        state: { type: 'string', description: 'Filter by state' },
        hasReplied: {
          type: 'boolean',
          description: 'Filter by whether contact has replied',
        },
        hasEmail: {
          type: 'boolean',
          description: 'Filter by whether contact has an email address',
        },
        hasPhone: {
          type: 'boolean',
          description: 'Filter by whether contact has a phone number',
        },
        emailValidationStatus: {
          type: 'string',
          description: 'Filter by email validation status (PENDING, VALID, INVALID, CATCH_ALL, UNKNOWN, DISPOSABLE)',
        },
        phoneValidationStatus: {
          type: 'string',
          description: 'Filter by phone validation status (PENDING, VALID_MOBILE, VALID_LANDLINE, INVALID, UNKNOWN)',
        },
        page: { type: 'number', description: 'Page number (default 1)' },
        limit: {
          type: 'number',
          description: 'Results per page (default 20)',
        },
      },
    },
  },
  {
    name: 'get_contact',
    description: 'Get detailed information about a specific contact by ID',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
      },
      required: ['contactId'],
    },
  },
  {
    name: 'list_campaigns',
    description:
      'List email/outreach campaigns with their status and stats',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description:
            'Filter by status (DRAFT, ACTIVE, PAUSED, COMPLETED)',
        },
        channel: {
          type: 'string',
          description: 'Filter by channel (EMAIL, SMS, LINKEDIN)',
        },
        limit: {
          type: 'number',
          description: 'Number of campaigns to return',
        },
      },
    },
  },
  {
    name: 'get_campaign_analytics',
    description:
      'Get analytics for campaigns. If campaignId is provided, returns stats for that campaign. If omitted, returns aggregate stats across all campaigns.',
    input_schema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', description: 'The campaign ID (optional - omit for aggregate stats)' },
      },
    },
  },
  {
    name: 'list_homeowners',
    description:
      'List homeowners pulled from permit data with optional filters',
    input_schema: {
      type: 'object',
      properties: {
        search: {
          type: 'string',
          description: 'Search by name, email, or address',
        },
        city: { type: 'string', description: 'Filter by city' },
        state: { type: 'string', description: 'Filter by state' },
        status: { type: 'string', description: 'Filter by status' },
        page: { type: 'number', description: 'Page number' },
        limit: { type: 'number', description: 'Results per page' },
      },
    },
  },
  {
    name: 'get_metrics',
    description:
      'Get daily metrics and analytics for the outreach pipeline',
    input_schema: {
      type: 'object',
      properties: {
        days: {
          type: 'number',
          description:
            'Number of days of metrics to retrieve (default 7)',
        },
      },
    },
  },
  {
    name: 'get_activity_log',
    description:
      'Get recent activity log entries showing what happened in the system',
    input_schema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          description: 'Number of activities to return (default 20)',
        },
        action: {
          type: 'string',
          description: 'Filter by action type',
        },
        contactId: {
          type: 'string',
          description: 'Filter by contact ID',
        },
      },
    },
  },
  {
    name: 'get_settings',
    description:
      'Get current system settings including pipeline controls, scraper settings, and schedule configuration',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'update_settings',
    description:
      'Update system settings. Can toggle pipeline controls, update scraper settings, etc.',
    input_schema: {
      type: 'object',
      properties: {
        pipelineEnabled: {
          type: 'boolean',
          description: 'Enable/disable the entire pipeline',
        },
        emailOutreachEnabled: {
          type: 'boolean',
          description: 'Enable/disable email outreach',
        },
        smsOutreachEnabled: {
          type: 'boolean',
          description: 'Enable/disable SMS outreach',
        },
        schedulerEnabled: {
          type: 'boolean',
          description: 'Enable/disable the job scheduler',
        },
        scrapeJobEnabled: {
          type: 'boolean',
          description: 'Enable/disable the scraper job',
        },
        enrichJobEnabled: {
          type: 'boolean',
          description: 'Enable/disable the enrichment job',
        },
        shovelsPermitTypes: {
          type: 'array',
          items: { type: 'string' },
          description: 'Permit types to search for',
        },
        shovelsLocations: {
          type: 'array',
          items: { type: 'string' },
          description: 'Locations to search permits in',
        },
      },
    },
  },
  {
    name: 'get_pipeline_status',
    description:
      'Get the current status of the data pipeline including which jobs are running and their progress',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_contact_stats',
    description:
      'Get aggregate statistics about contacts (total, by status, validation rates, etc.)',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },

  // ==================== CONTACT TOOLS (7 new) ====================
  {
    name: 'create_contact',
    description:
      'Create a new contact/lead in the database with the provided information.',
    input_schema: {
      type: 'object',
      properties: {
        firstName: { type: 'string', description: 'First name of the contact' },
        lastName: { type: 'string', description: 'Last name of the contact' },
        email: { type: 'string', description: 'Email address' },
        phone: { type: 'string', description: 'Phone number' },
        city: { type: 'string', description: 'City' },
        state: { type: 'string', description: 'State' },
        source: { type: 'string', description: 'Lead source (e.g., manual, csv, apollo)' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to assign to the contact',
        },
      },
      required: ['firstName', 'lastName'],
    },
  },
  {
    name: 'update_contact',
    description:
      'Update an existing contact by ID. Only provided fields will be updated.',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID to update' },
        firstName: { type: 'string', description: 'First name' },
        lastName: { type: 'string', description: 'Last name' },
        email: { type: 'string', description: 'Email address' },
        phone: { type: 'string', description: 'Phone number' },
        city: { type: 'string', description: 'City' },
        state: { type: 'string', description: 'State' },
        title: { type: 'string', description: 'Job title' },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tags to assign',
        },
        status: {
          type: 'string',
          description: 'Contact status (NEW, VALIDATED, IN_SEQUENCE, REPLIED, etc.)',
        },
      },
      required: ['contactId'],
    },
  },
  {
    name: 'delete_contact',
    description: 'Delete a contact from the database by ID.',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID to delete' },
      },
      required: ['contactId'],
    },
  },
  {
    name: 'export_contacts',
    description:
      'Export contacts to CSV format. Returns a summary with record count and the CSV data.',
    input_schema: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by contact status',
        },
        city: { type: 'string', description: 'Filter by city' },
        state: { type: 'string', description: 'Filter by state' },
        hasReplied: {
          type: 'boolean',
          description: 'Filter by reply status',
        },
        tags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Filter by tags',
        },
      },
    },
  },
  {
    name: 'get_contact_replies',
    description:
      'Get all replies received from a specific contact, including channel and content.',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
        limit: { type: 'number', description: 'Max replies to return (default 20)' },
      },
      required: ['contactId'],
    },
  },
  {
    name: 'get_contact_activity',
    description:
      'Get activity log entries for a specific contact showing all interactions and events.',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
        limit: { type: 'number', description: 'Max activities to return (default 50)' },
      },
      required: ['contactId'],
    },
  },
  {
    name: 'send_sms',
    description:
      'Send an SMS message to a contact via GoHighLevel. Supports {{variable}} template placeholders.',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID to send SMS to' },
        message: { type: 'string', description: 'The SMS message body. Supports {{firstName}}, {{lastName}}, {{company}} variables.' },
        campaignId: { type: 'string', description: 'Optional campaign ID to associate with the message' },
      },
      required: ['contactId', 'message'],
    },
  },

  // ==================== CAMPAIGN TOOLS (4 new) ====================
  {
    name: 'enroll_contacts',
    description:
      'Enroll one or more contacts into a campaign. Skips already-enrolled and ineligible contacts.',
    input_schema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', description: 'The campaign ID to enroll contacts in' },
        contactIds: {
          type: 'array',
          items: { type: 'string' },
          description: 'Array of contact IDs to enroll',
        },
      },
      required: ['campaignId', 'contactIds'],
    },
  },
  {
    name: 'stop_enrollment',
    description:
      'Stop a specific contact\'s enrollment in a campaign.',
    input_schema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', description: 'The campaign ID' },
        contactId: { type: 'string', description: 'The contact ID to stop enrollment for' },
        reason: { type: 'string', description: 'Reason for stopping (default: manual_stop)' },
      },
      required: ['campaignId', 'contactId'],
    },
  },
  {
    name: 'get_campaign_enrollments',
    description:
      'Get enrollments for a campaign with optional status filter.',
    input_schema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', description: 'The campaign ID' },
        status: {
          type: 'string',
          description: 'Filter by enrollment status (ENROLLED, SENT, OPENED, CLICKED, REPLIED, BOUNCED, STOPPED, UNSUBSCRIBED)',
        },
        limit: { type: 'number', description: 'Max enrollments to return (default 50)' },
      },
      required: ['campaignId'],
    },
  },
  {
    name: 'sync_campaigns',
    description:
      'Sync campaigns from Instantly. Creates local records for new Instantly campaigns and updates existing ones.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },

  // ==================== TEMPLATE TOOLS (4 new) ====================
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

  // ==================== ROUTING RULE TOOLS (4 new) ====================
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

  // ==================== JOB/PIPELINE TOOLS (4 new) ====================
  {
    name: 'trigger_job',
    description:
      'Manually trigger a pipeline job. Jobs include: shovels (permit scraping), homeowner (homeowner scraping), connection (resolve contractor-homeowner connections), enrich, merge, validate, enroll (auto-enrollment).',
    input_schema: {
      type: 'object',
      properties: {
        jobName: {
          type: 'string',
          description: 'Job to trigger: shovels, homeowner, connection, enrich, merge, validate, or enroll',
        },
        useQueue: {
          type: 'boolean',
          description: 'If true, adds to background queue and returns immediately. If false, runs synchronously (default false).',
        },
      },
      required: ['jobName'],
    },
  },
  {
    name: 'emergency_stop',
    description:
      'Emergency stop: immediately disables all outreach, pipeline, and scheduled jobs. Use only when something needs to be stopped urgently.',
    input_schema: {
      type: 'object',
      properties: {
        stoppedBy: {
          type: 'string',
          description: 'Who/what triggered the stop (default: jerry_ai)',
        },
      },
    },
  },
  {
    name: 'resume_pipeline',
    description:
      'Resume the pipeline after an emergency stop. Re-enables outreach, scheduling, and all jobs.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_job_history',
    description:
      'Get execution history of automation jobs. Shows recent runs with status, record counts, and timing.',
    input_schema: {
      type: 'object',
      properties: {
        jobType: {
          type: 'string',
          description: 'Filter by job type: SHOVELS_SCRAPE, HOMEOWNER_SCRAPE, CONNECTION_RESOLVE, ENRICH, MERGE, VALIDATE, AUTO_ENROLL',
        },
        limit: { type: 'number', description: 'Max entries to return (default 50)' },
      },
    },
  },

  // ==================== HOMEOWNER/CONNECTION TOOLS (4 new) ====================
  {
    name: 'delete_homeowner',
    description: 'Delete a homeowner record from the database by ID.',
    input_schema: {
      type: 'object',
      properties: {
        homeownerId: { type: 'string', description: 'The homeowner ID to delete' },
      },
      required: ['homeownerId'],
    },
  },
  {
    name: 'enrich_homeowners',
    description:
      'Trigger Realie property enrichment for homeowners that haven\'t been enriched yet. Enriches property data like assessed value, AVM, bedrooms, etc.',
    input_schema: {
      type: 'object',
      properties: {
        batchSize: {
          type: 'number',
          description: 'Number of homeowners to enrich in this batch (default 50)',
        },
      },
    },
  },
  {
    name: 'enrich_homeowner_contacts',
    description:
      'Find email and phone for homeowners via Shovels resident data. Looks up residents at the homeowner\'s permit address and matches by name to populate contact details and demographics.',
    input_schema: {
      type: 'object',
      properties: {
        batchSize: {
          type: 'number',
          description: 'Number of homeowners to enrich in this batch (default 50)',
        },
      },
    },
  },
  {
    name: 'list_connections',
    description:
      'List contractor-homeowner connections (links between contacts and homeowners via permits).',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search by name, email, or address' },
        permitType: { type: 'string', description: 'Filter by permit type' },
        city: { type: 'string', description: 'Filter by city' },
        state: { type: 'string', description: 'Filter by state' },
        page: { type: 'number', description: 'Page number (default 1)' },
        limit: { type: 'number', description: 'Results per page (default 25)' },
      },
    },
  },
  {
    name: 'resolve_connections',
    description:
      'Resolve contractor-homeowner connections by matching permits to contractors in the database. Processes homeowners that don\'t yet have connections.',
    input_schema: {
      type: 'object',
      properties: {
        batchSize: {
          type: 'number',
          description: 'Number of homeowners to process (default 50)',
        },
      },
    },
  },

  // ==================== SYSTEM TOOLS (2 new) ====================
  {
    name: 'check_system_health',
    description:
      'Check the health of system integrations including database, Redis, and pipeline status.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'toggle_linkedin',
    description:
      'Enable or disable LinkedIn outreach globally across all campaigns.',
    input_schema: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          description: 'True to enable LinkedIn, false to disable',
        },
      },
      required: ['enabled'],
    },
  },

  // ==================== WORKFLOW TOOLS (3 new - Phase 3E) ====================
  {
    name: 'create_workflow',
    description:
      'Create and start a multi-step workflow. Each step can perform an action with parameters, handle failures, and have conditions.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Workflow name' },
        steps: {
          type: 'array',
          description: 'Array of workflow steps to execute in order',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Step name' },
              action: { type: 'string', description: 'Action to perform (tool name or custom action)' },
              params: {
                type: 'object',
                description: 'Parameters for the action',
              },
              onFailure: {
                type: 'string',
                description: 'What to do on failure: skip, stop, or retry (default: stop)',
              },
              condition: {
                type: 'string',
                description: 'Optional condition expression to evaluate before running this step',
              },
            },
            required: ['name', 'action'],
          },
        },
      },
      required: ['name', 'steps'],
    },
  },
  {
    name: 'get_workflow_status',
    description:
      'Get the status and step details of a workflow by ID.',
    input_schema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string', description: 'The workflow ID' },
      },
      required: ['workflowId'],
    },
  },
  {
    name: 'cancel_workflow',
    description: 'Cancel a running workflow by ID.',
    input_schema: {
      type: 'object',
      properties: {
        workflowId: { type: 'string', description: 'The workflow ID to cancel' },
      },
      required: ['workflowId'],
    },
  },

  // ==================== BATCH TOOLS (2 new - Phase 2B) ====================
  {
    name: 'batch_create_contacts',
    description: 'Create multiple contacts at once. Accepts an array of contact objects (max 100). Returns created count, skipped (duplicate email), and errors.',
    input_schema: {
      type: 'object',
      properties: {
        contacts: {
          type: 'array',
          description: 'Array of contact objects to create',
          items: {
            type: 'object',
            properties: {
              email: { type: 'string', description: 'Contact email (required)' },
              firstName: { type: 'string' },
              lastName: { type: 'string' },
              phone: { type: 'string' },
              company: { type: 'string' },
              title: { type: 'string' },
              city: { type: 'string' },
              state: { type: 'string' },
              tags: { type: 'array', items: { type: 'string' } },
            },
            required: ['email'],
          },
        },
      },
      required: ['contacts'],
    },
  },
  {
    name: 'batch_enroll_contacts',
    description: 'Enroll multiple contacts into a campaign at once. Accepts a campaign ID and an array of contact IDs.',
    input_schema: {
      type: 'object',
      properties: {
        campaignId: { type: 'string', description: 'Campaign ID to enroll contacts into' },
        contactIds: {
          type: 'array',
          description: 'Array of contact IDs to enroll',
          items: { type: 'string' },
        },
      },
      required: ['campaignId', 'contactIds'],
    },
  },

  // ==================== GEO ID LOOKUP TOOL (Phase 2C) ====================
  {
    name: 'lookup_geo_id',
    description: 'Look up a FIPS GeoID code for a US city or county. Useful when the user mentions a city not in the hardcoded list. Supports fuzzy matching and common abbreviations (e.g., "LA" for Los Angeles).',
    input_schema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City or county name' },
        state: { type: 'string', description: 'State name or abbreviation (e.g., "CA" or "California")' },
      },
      required: ['city'],
    },
  },

  // ==================== CONTACT LABEL TOOLS (Jerry $900 Scope) ====================
  {
    name: 'add_contact_label',
    description: 'Add a structured label to a contact',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
        name: { type: 'string', description: 'Label name (e.g., "Hot", "Warm", "Cold", "Customer", "DNC")' },
        color: { type: 'string', description: 'Optional hex or tailwind color name (e.g., "#22c55e")' },
      },
      required: ['contactId', 'name'],
    },
  },
  {
    name: 'remove_contact_label',
    description: 'Remove a label from a contact',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
        name: { type: 'string', description: 'Label name to remove' },
      },
      required: ['contactId', 'name'],
    },
  },
  {
    name: 'list_contact_labels',
    description: 'List all labels on a contact',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
      },
      required: ['contactId'],
    },
  },

  // ==================== CONTACT NOTE TOOL (Jerry $900 Scope) ====================
  {
    name: 'add_contact_note',
    description: 'Add a note to a contact',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
        note: { type: 'string', description: 'The note content to add' },
      },
      required: ['contactId', 'note'],
    },
  },

  // ==================== TAG TOOLS (Jerry $900 Scope) ====================
  {
    name: 'add_contact_tag',
    description: 'Add a tag to a contact',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
        tag: { type: 'string', description: 'The tag to add' },
      },
      required: ['contactId', 'tag'],
    },
  },
  {
    name: 'remove_contact_tag',
    description: 'Remove a tag from a contact',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
        tag: { type: 'string', description: 'The tag to remove' },
      },
      required: ['contactId', 'tag'],
    },
  },

  // ==================== HOMEOWNER/CONTRACTOR TOOLS (Jerry $900 Scope) ====================
  {
    name: 'lookup_homeowner_by_address',
    description: 'Look up homeowners by address',
    input_schema: {
      type: 'object',
      properties: {
        address: { type: 'string', description: 'Street address to search for' },
        city: { type: 'string', description: 'City to narrow search' },
        state: { type: 'string', description: 'State to narrow search' },
      },
      required: ['address'],
    },
  },
  {
    name: 'get_contractor_brief',
    description: 'Get a comprehensive pre-call brief for a contractor',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
      },
      required: ['contactId'],
    },
  },

  // ==================== MARK AS CUSTOMER (Jerry $900 Scope) ====================
  {
    name: 'mark_as_customer',
    description: 'Mark a contact as a customer - stops all enrollments and adds Customer label',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
      },
      required: ['contactId'],
    },
  },

  // ==================== WORKFLOW PRESET TOOLS (Jerry $900 Scope) ====================
  {
    name: 'list_workflow_presets',
    description: 'List available workflow presets with descriptions and trigger hints',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'run_workflow_preset',
    description: 'Run a workflow preset by ID with optional parameters',
    input_schema: {
      type: 'object',
      properties: {
        presetId: { type: 'string', description: 'The preset ID to run (e.g., "weekly-prospecting", "monthly-review")' },
        params: {
          type: 'object',
          description: 'Optional override parameters for step params (e.g., city, geoId, batchSize)',
        },
      },
      required: ['presetId'],
    },
  },

  // ==================== GHL OPPORTUNITY TOOL (Jerry $900 Scope) ====================
  {
    name: 'create_ghl_opportunity',
    description: 'Create a GHL opportunity for a contact in the sales pipeline',
    input_schema: {
      type: 'object',
      properties: {
        contactId: { type: 'string', description: 'The contact ID' },
        name: { type: 'string', description: 'Opportunity name (e.g., "Solar Install - John Smith")' },
        monetaryValue: { type: 'number', description: 'Optional monetary value of the opportunity' },
        pipelineId: { type: 'string', description: 'Optional pipeline ID (uses default from settings if not provided)' },
        stageId: { type: 'string', description: 'Optional stage ID (uses default from settings if not provided)' },
      },
      required: ['contactId', 'name'],
    },
  },
];

// Tool execution map
export async function executeTool(
  name: string,
  input: Record<string, any>,
  context?: ToolContext
): Promise<ToolResult> {
  logger.info(`Executing tool: ${name}`, { input });

  try {
    // Validate input against Zod schema
    const validatedInput = validateToolInput(name, input);
    // Use validatedInput for all operations below
    input = validatedInput;

    switch (name) {
      // ==================== EXISTING TOOLS ====================

      case 'search_permits': {
        const startDate = input.startDate || new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString().split('T')[0];
        const endDate = input.endDate || new Date().toISOString().split('T')[0];

        // Parse city and state from input (supports "Austin, TX" or separate fields)
        let cityName = input.city || '';
        let stateAbbr = '';
        const geoResult = lookupGeoId(cityName);
        let resolvedGeoId = input.geoId || '';

        if (geoResult && !Array.isArray(geoResult)) {
          resolvedGeoId = geoResult.geoId;
          stateAbbr = geoResult.stateAbbr;
        } else if (Array.isArray(geoResult) && geoResult.length > 0) {
          resolvedGeoId = geoResult[0].geoId;
          stateAbbr = geoResult[0].stateAbbr;
        }

        // Extract state from "City, ST" format if not resolved
        if (!stateAbbr && cityName.includes(',')) {
          const parts = cityName.split(',').map(s => s.trim());
          cityName = parts[0];
          stateAbbr = parts[1]?.toUpperCase() || '';
        }

        if (!cityName) {
          return { success: false, error: 'city is required for permit search' };
        }

        const dateRangeDays = Math.ceil(
          (new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000
        );

        // Create the record first so we can return the ID immediately
        const search = await prisma.permitSearch.create({
          data: {
            permitType: input.permitType,
            city: cityName,
            geoId: resolvedGeoId || `${cityName.toLowerCase().replace(/\s+/g, '-')}-${stateAbbr.toLowerCase()}`,
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            status: 'PENDING',
            conversationId: context?.conversationId || null,
          },
        });

        // Use scrapeByCity for multi-tier fallback (slug → zip expansion → FIPS)
        const runSearch = async () => {
          await prisma.permitSearch.update({
            where: { id: search.id },
            data: { status: 'SEARCHING' },
          });

          realtimeEmitter.emitJobEvent({
            jobId: search.id,
            jobType: 'permit:search',
            status: 'started',
          });

          if (search.conversationId) {
            emitJobToConversation(search.conversationId, WSEventType.JOB_STARTED, {
              jobId: search.id,
              jobType: 'permit:search',
              status: 'started',
              result: { permitType: input.permitType, city: cityName },
            });
          }

          let result;
          if (stateAbbr) {
            result = await shovelsScraperService.scrapeByCity(
              input.permitType, cityName, stateAbbr,
              dateRangeDays, 100, true
            );
          } else {
            result = await shovelsScraperService.scrapeByPermitTypeAndGeo(
              input.permitType, resolvedGeoId, cityName,
              dateRangeDays, 100, true
            );
          }

          if (result.totalScraped === 0) {
            const baseMsg = result.errors.length > 0
              ? `Search failed: ${result.errors.join('; ')}`
              : `No ${input.permitType} contractors found in ${cityName}${stateAbbr ? ', ' + stateAbbr : ''} for the selected date range. Tried ${result.searchesRun} geo format(s).`;
            const diagnosticMsg = result.diagnostics
              ? `${baseMsg} | Diagnostics: ${result.diagnostics}`
              : baseMsg;

            await prisma.permitSearch.update({
              where: { id: search.id },
              data: {
                status: result.errors.length > 0 ? 'FAILED' : 'COMPLETED',
                totalFound: 0,
              },
            });

            const eventType = result.errors.length > 0 ? WSEventType.JOB_FAILED : WSEventType.JOB_COMPLETED;
            realtimeEmitter.emitJobEvent({
              jobId: search.id,
              jobType: 'permit:search',
              status: result.errors.length > 0 ? 'failed' : 'completed',
              result: { total: 0, message: diagnosticMsg, searchesRun: result.searchesRun },
            });

            if (search.conversationId) {
              emitJobToConversation(search.conversationId, eventType, {
                jobId: search.id,
                jobType: 'permit:search',
                status: result.errors.length > 0 ? 'failed' : 'completed',
                result: { total: 0, message: diagnosticMsg, searchesRun: result.searchesRun },
              });
            }
            return;
          }

          // Scraping done — link contacts, update status, then enrich (skip re-scrape)
          await prisma.permitSearch.update({
            where: { id: search.id },
            data: { status: 'ENRICHING', totalFound: result.totalImported },
          });

          await prisma.contact.updateMany({
            where: {
              source: 'shovels',
              permitType: input.permitType,
              permitCity: cityName,
              permitSearchId: null,
              createdAt: { gte: new Date(Date.now() - 3600000) },
            },
            data: { permitSearchId: search.id },
          });

          // Try Clay enrichment (non-blocking)
          permitPipelineService.sendToClayEnrichment(search.id).catch((err) => {
            logger.warn({ err: err.message, searchId: search.id }, 'Clay enrichment skipped or failed');
          });

          // Mark as ready for review
          await prisma.permitSearch.update({
            where: { id: search.id },
            data: { status: 'READY_FOR_REVIEW' },
          });

          realtimeEmitter.emitJobEvent({
            jobId: search.id,
            jobType: 'permit:search',
            status: 'completed',
            result: { total: result.totalImported, scraped: result.totalScraped, filtered: result.filtered },
          });

          if (search.conversationId) {
            emitJobToConversation(search.conversationId, WSEventType.JOB_COMPLETED, {
              jobId: search.id,
              jobType: 'permit:search',
              status: 'completed',
              result: { total: result.totalImported, scraped: result.totalScraped, filtered: result.filtered },
            });
          }
        };

        try {
          await runSearch();
        } catch (err: any) {
          logger.error({ err: err.message, searchId: search.id }, 'Permit search pipeline failed');
          await prisma.permitSearch.update({
            where: { id: search.id },
            data: { status: 'FAILED' },
          }).catch(() => {});
          if (context?.conversationId) {
            emitJobToConversation(context.conversationId, WSEventType.JOB_FAILED, {
              jobId: search.id,
              jobType: 'permit:search',
              status: 'failed',
              error: err.message,
            });
          }
          return {
            success: false,
            error: `Permit search failed: ${err.message}`,
            data: { searchId: search.id },
          };
        }

        const finalSearch = await prisma.permitSearch.findUnique({
          where: { id: search.id },
          select: { status: true, totalFound: true },
        });

        return {
          success: true,
          data: {
            searchId: search.id,
            status: finalSearch?.status || 'COMPLETED',
            totalFound: finalSearch?.totalFound || 0,
            message: `Permit search for ${input.permitType} permits in ${cityName}${stateAbbr ? ', ' + stateAbbr : ''} completed with ${finalSearch?.totalFound || 0} results.`,
          },
        };
      }

      case 'get_permit_searches': {
        const limit = input.limit || 10;
        const where: Record<string, any> = {};
        if (input.status) {
          where.status = input.status;
        }
        const searches = await prisma.permitSearch.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          select: {
            id: true,
            permitType: true,
            city: true,
            geoId: true,
            status: true,
            totalFound: true,
            totalEnriched: true,
            startDate: true,
            endDate: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        return { success: true, data: searches };
      }

      case 'list_contacts': {
        const page = input.page || 1;
        const limit = input.limit || 20;
        const skip = (page - 1) * limit;
        const where: Record<string, any> = {};

        if (input.search) {
          where.OR = [
            { firstName: { contains: input.search, mode: 'insensitive' } },
            { lastName: { contains: input.search, mode: 'insensitive' } },
            { email: { contains: input.search, mode: 'insensitive' } },
            {
              company: {
                name: { contains: input.search, mode: 'insensitive' },
              },
            },
          ];
        }
        if (input.status) where.status = input.status;
        if (input.city) where.city = input.city;
        if (input.state) where.state = input.state;
        if (input.hasReplied !== undefined) where.hasReplied = input.hasReplied;
        if (input.hasEmail === true) where.email = { not: null };
        if (input.hasEmail === false) where.email = null;
        if (input.hasPhone === true) where.phone = { not: null };
        if (input.hasPhone === false) where.phone = null;
        if (input.emailValidationStatus) where.emailValidationStatus = input.emailValidationStatus;
        if (input.phoneValidationStatus) where.phoneValidationStatus = input.phoneValidationStatus;

        const [contacts, total] = await Promise.all([
          prisma.contact.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            include: { company: true },
          }),
          prisma.contact.count({ where }),
        ]);

        return {
          success: true,
          data: {
            contacts,
            pagination: {
              page,
              limit,
              total,
              totalPages: Math.ceil(total / limit),
            },
          },
        };
      }

      case 'get_contact': {
        const contact = await prisma.contact.findUnique({
          where: { id: input.contactId },
          include: {
            company: true,
            activityLogs: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        });
        if (!contact) {
          return {
            success: false,
            error: `Contact not found with ID: ${input.contactId}`,
          };
        }
        return { success: true, data: contact };
      }

      case 'list_campaigns': {
        const where: Record<string, any> = {};
        if (input.status) where.status = input.status;
        if (input.channel) where.channel = input.channel;

        const campaigns = await prisma.campaign.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: input.limit || 20,
          include: {
            _count: {
              select: { enrollments: true },
            },
          },
        });
        return { success: true, data: campaigns };
      }

      case 'get_campaign_analytics': {
        if (input.campaignId) {
          // Single campaign analytics
          const campaign = await prisma.campaign.findUnique({
            where: { id: input.campaignId },
            include: {
              _count: {
                select: { enrollments: true },
              },
            },
          });
          if (!campaign) {
            return {
              success: false,
              error: `Campaign not found with ID: ${input.campaignId}`,
            };
          }

          const enrollmentStats = await prisma.campaignEnrollment.groupBy({
            by: ['status'],
            where: { campaignId: input.campaignId },
            _count: { status: true },
          });

          return {
            success: true,
            data: {
              campaign,
              enrollmentStats: enrollmentStats.map((s: any) => ({
                status: s.status,
                count: s._count.status,
              })),
            },
          };
        } else {
          // Aggregate analytics across all campaigns
          const campaigns = await prisma.campaign.findMany({
            include: {
              _count: { select: { enrollments: true } },
            },
          });

          const enrollmentStats = await prisma.campaignEnrollment.groupBy({
            by: ['status'],
            _count: { status: true },
          });

          const totalEnrolled = campaigns.reduce((sum, c) => sum + c._count.enrollments, 0);

          return {
            success: true,
            data: {
              totalCampaigns: campaigns.length,
              activeCampaigns: campaigns.filter(c => c.status === 'ACTIVE').length,
              totalEnrolled,
              campaigns: campaigns.map(c => ({
                id: c.id,
                name: c.name,
                channel: c.channel,
                status: c.status,
                enrolled: c._count.enrollments,
              })),
              enrollmentStats: enrollmentStats.map((s: any) => ({
                status: s.status,
                count: s._count.status,
              })),
            },
          };
        }
      }

      case 'list_homeowners': {
        const page = input.page || 1;
        const limit = input.limit || 20;
        const skip = (page - 1) * limit;
        const where: Record<string, any> = {};

        if (input.search) {
          where.OR = [
            { firstName: { contains: input.search, mode: 'insensitive' } },
            { lastName: { contains: input.search, mode: 'insensitive' } },
            { email: { contains: input.search, mode: 'insensitive' } },
            { street: { contains: input.search, mode: 'insensitive' } },
          ];
        }
        if (input.city) where.city = input.city;
        if (input.state) where.state = input.state;
        if (input.status) where.status = input.status;

        const [homeowners, total] = await Promise.all([
          prisma.homeowner.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
          prisma.homeowner.count({ where }),
        ]);

        return {
          success: true,
          data: {
            homeowners,
            pagination: {
              page,
              limit,
              total,
              totalPages: Math.ceil(total / limit),
            },
          },
        };
      }

      case 'get_metrics': {
        const days = input.days || 7;
        const since = new Date();
        since.setDate(since.getDate() - days);

        const metrics = await prisma.dailyMetrics.findMany({
          where: { date: { gte: since } },
          orderBy: { date: 'desc' },
        });
        return { success: true, data: metrics };
      }

      case 'get_activity_log': {
        const limit = input.limit || 20;
        const where: Record<string, any> = {};
        if (input.action) where.action = input.action;
        if (input.contactId) where.contactId = input.contactId;

        const activities = await prisma.activityLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: { contact: true },
        });
        return { success: true, data: activities };
      }

      case 'get_settings': {
        const settings = await prisma.settings.findFirst();
        if (!settings) {
          return { success: false, error: 'No settings found' };
        }
        return { success: true, data: settings };
      }

      case 'update_settings': {
        const settings = await prisma.settings.findFirst();
        if (!settings) {
          return { success: false, error: 'No settings found to update' };
        }

        const updateData: Record<string, any> = {};
        const allowedFields = [
          'pipelineEnabled',
          'emailOutreachEnabled',
          'smsOutreachEnabled',
          'schedulerEnabled',
          'scrapeJobEnabled',
          'enrichJobEnabled',
          'shovelsPermitTypes',
          'shovelsLocations',
        ];

        for (const field of allowedFields) {
          if (input[field] !== undefined) {
            updateData[field] = input[field];
          }
        }

        if (Object.keys(updateData).length === 0) {
          return { success: false, error: 'No valid fields provided to update' };
        }

        const updated = await prisma.settings.update({
          where: { id: settings.id },
          data: updateData,
        });

        return {
          success: true,
          data: {
            updated,
            message: `Settings updated: ${Object.keys(updateData).join(', ')}`,
          },
        };
      }

      case 'get_pipeline_status': {
        const settings = await prisma.settings.findFirst();
        const recentMetrics = await prisma.dailyMetrics.findFirst({
          orderBy: { date: 'desc' },
        });
        const recentSearches = await prisma.permitSearch.findMany({
          where: {
            status: { in: ['PENDING', 'SEARCHING', 'ENRICHING'] },
          },
          orderBy: { createdAt: 'desc' },
          take: 5,
        });

        return {
          success: true,
          data: {
            controls: {
              pipelineEnabled: settings?.pipelineEnabled ?? false,
              emailOutreachEnabled: settings?.emailOutreachEnabled ?? false,
              smsOutreachEnabled: settings?.smsOutreachEnabled ?? false,
              schedulerEnabled: settings?.schedulerEnabled ?? false,
              scrapeJobEnabled: settings?.scrapeJobEnabled ?? false,
              enrichJobEnabled: settings?.enrichJobEnabled ?? false,
            },
            latestMetrics: recentMetrics,
            activeSearches: recentSearches,
          },
        };
      }

      case 'get_contact_stats': {
        const [total, byStatus, repliedCount, validatedCount] =
          await Promise.all([
            prisma.contact.count(),
            prisma.contact.groupBy({
              by: ['status'],
              _count: { status: true },
            }),
            prisma.contact.count({ where: { hasReplied: true } }),
            prisma.contact.count({
              where: { status: 'VALIDATED' },
            }),
          ]);

        return {
          success: true,
          data: {
            total,
            byStatus: byStatus.map((s) => ({
              status: s.status,
              count: s._count.status,
            })),
            repliedCount,
            validatedCount,
            replyRate: total > 0 ? ((repliedCount / total) * 100).toFixed(1) + '%' : '0%',
            validationRate:
              total > 0 ? ((validatedCount / total) * 100).toFixed(1) + '%' : '0%',
          },
        };
      }

      // ==================== CONTACT TOOLS ====================

      case 'create_contact': {
        const contactData: Record<string, any> = {
          firstName: input.firstName,
          lastName: input.lastName,
          fullName: `${input.firstName} ${input.lastName}`.trim(),
          status: 'NEW',
        };
        if (input.email) contactData.email = input.email;
        if (input.phone) contactData.phone = input.phone;
        if (input.city) contactData.city = input.city;
        if (input.state) contactData.state = input.state;
        if (input.source) contactData.source = input.source;
        if (input.tags) contactData.tags = input.tags;

        const newContact = await prisma.contact.create({
          data: contactData,
        });

        // Log the creation
        await prisma.activityLog.create({
          data: {
            contactId: newContact.id,
            action: 'CONTACT_CREATED',
            description: `Contact ${newContact.fullName} created via Jerry AI`,
            actorType: 'ai',
          },
        });

        return {
          success: true,
          data: {
            contact: newContact,
            message: `Contact ${newContact.fullName} created successfully.`,
          },
        };
      }

      case 'update_contact': {
        const existing = await prisma.contact.findUnique({
          where: { id: input.contactId },
        });
        if (!existing) {
          return { success: false, error: `Contact not found with ID: ${input.contactId}` };
        }

        const updateFields: Record<string, any> = {};
        const allowedContactFields = [
          'firstName', 'lastName', 'email', 'phone', 'city', 'state', 'title', 'tags', 'status',
        ];
        for (const field of allowedContactFields) {
          if (input[field] !== undefined) {
            updateFields[field] = input[field];
          }
        }
        // Update fullName if first or last name changed
        if (input.firstName || input.lastName) {
          updateFields.fullName = `${input.firstName ?? existing.firstName ?? ''} ${input.lastName ?? existing.lastName ?? ''}`.trim();
        }

        if (Object.keys(updateFields).length === 0) {
          return { success: false, error: 'No valid fields provided to update' };
        }

        const updatedContact = await prisma.contact.update({
          where: { id: input.contactId },
          data: updateFields,
        });

        await prisma.activityLog.create({
          data: {
            contactId: input.contactId,
            action: 'CONTACT_UPDATED',
            description: `Contact updated fields: ${Object.keys(updateFields).join(', ')}`,
            actorType: 'ai',
            metadata: updateFields,
          },
        });

        return {
          success: true,
          data: {
            contact: updatedContact,
            message: `Contact updated: ${Object.keys(updateFields).join(', ')}`,
          },
        };
      }

      case 'delete_contact': {
        const toDelete = await prisma.contact.findUnique({
          where: { id: input.contactId },
          select: { id: true, fullName: true, email: true },
        });
        if (!toDelete) {
          return { success: false, error: `Contact not found with ID: ${input.contactId}` };
        }

        await prisma.contact.delete({ where: { id: input.contactId } });

        return {
          success: true,
          data: {
            message: `Contact ${toDelete.fullName || toDelete.email || input.contactId} deleted successfully.`,
          },
        };
      }

      case 'export_contacts': {
        const filters: Record<string, any> = {};
        if (input.status) filters.status = [input.status];
        if (input.city) filters.search = input.city;
        if (input.state) filters.search = input.state;
        if (input.hasReplied !== undefined) filters.hasReplied = input.hasReplied;
        if (input.tags) filters.tags = input.tags;

        const csv = await contactExportService.exportToCSV(filters);
        const lineCount = csv.split('\n').length - 1; // subtract header

        // Write CSV to temp file for download
        const exportDir = config.defaults.exportDir;
        const filename = `${randomUUID()}.csv`;
        const filePath = path.join(exportDir, filename);
        fs.writeFileSync(filePath, csv);

        // Auto-delete after 10 minutes
        setTimeout(() => {
          try { fs.unlinkSync(filePath); } catch {}
        }, 10 * 60 * 1000);

        // Return download URL instead of CSV content
        return {
          success: true,
          data: {
            downloadUrl: `/api/v1/chat/exports/${filename}`,
            fileName: `contacts_export_${new Date().toISOString().split('T')[0]}.csv`,
            rowCount: lineCount,
            preview: csv.split('\n').slice(0, 6).join('\n'), // First 5 rows as preview
          },
        };
      }

      case 'get_contact_replies': {
        const replies = await prisma.reply.findMany({
          where: { contactId: input.contactId },
          orderBy: { receivedAt: 'desc' },
          take: input.limit || 20,
        });

        return {
          success: true,
          data: {
            replies,
            total: replies.length,
            contactId: input.contactId,
          },
        };
      }

      case 'get_contact_activity': {
        const contactActivities = await prisma.activityLog.findMany({
          where: { contactId: input.contactId },
          orderBy: { createdAt: 'desc' },
          take: input.limit || 50,
        });

        return {
          success: true,
          data: {
            activities: contactActivities,
            total: contactActivities.length,
            contactId: input.contactId,
          },
        };
      }

      case 'send_sms': {
        if (!ghlClient.isConfigured()) {
          return { success: false, error: 'GoHighLevel is not configured. Set GHL_API_KEY and GHL_LOCATION_ID to enable SMS sending.' };
        }
        // Pre-validate: check contact has phone
        const smsContact = await prisma.contact.findUnique({
          where: { id: input.contactId },
          select: { phone: true },
        });
        if (!smsContact) {
          return { success: false, error: `Contact not found with ID: ${input.contactId}` };
        }
        if (!smsContact.phone) {
          return { success: false, error: `Contact ${input.contactId} has no phone number. Cannot send SMS.` };
        }
        const smsResult = await smsOutreachService.sendSMS({
          contactId: input.contactId,
          message: input.message,
          campaignId: input.campaignId,
        });

        if (!smsResult.success) {
          return { success: false, error: smsResult.error || 'Failed to send SMS' };
        }

        // Log activity
        await prisma.activityLog.create({
          data: {
            contactId: input.contactId,
            action: 'SMS_SENT',
            channel: 'SMS',
            description: `SMS sent via Jerry AI`,
            actorType: 'ai',
            metadata: {
              conversationId: smsResult.conversationId,
              messageId: smsResult.messageId,
            },
          },
        });

        return {
          success: true,
          data: {
            conversationId: smsResult.conversationId,
            messageId: smsResult.messageId,
            message: 'SMS sent successfully.',
          },
        };
      }

      // ==================== CAMPAIGN TOOLS ====================

      case 'enroll_contacts': {
        // Pre-validate: check campaign exists and is active
        const campaign = await prisma.campaign.findUnique({
          where: { id: input.campaignId },
          select: { status: true, name: true },
        });
        if (!campaign) {
          return { success: false, error: `Campaign not found with ID: ${input.campaignId}` };
        }
        if (campaign.status === 'DRAFT' || campaign.status === 'COMPLETED') {
          return { success: false, error: `Cannot enroll contacts in campaign "${campaign.name}" — status is ${campaign.status}. Campaign must be ACTIVE or SCHEDULED.` };
        }
        const enrollResult = await campaignService.enrollContacts(
          input.campaignId,
          input.contactIds
        );

        return {
          success: true,
          data: {
            enrolled: enrollResult.enrolled,
            skipped: enrollResult.skipped,
            errors: enrollResult.errors,
            message: `Enrolled ${enrollResult.enrolled} contacts, skipped ${enrollResult.skipped}.`,
          },
        };
      }

      case 'stop_enrollment': {
        if (!input.campaignId || !input.contactId) {
          return { success: false, error: 'Both campaignId and contactId are required to stop enrollment.' };
        }
        try {
          await campaignService.stopEnrollment(
            input.campaignId,
            input.contactId,
            input.reason || 'manual_stop'
          );

          return {
            success: true,
            data: {
              message: `Enrollment stopped for contact ${input.contactId} in campaign ${input.campaignId}.`,
            },
          };
        } catch (err: any) {
          return { success: false, error: `Failed to stop enrollment: ${err.message}` };
        }
      }

      case 'get_campaign_enrollments': {
        const enrollmentResult = await campaignService.getEnrollments(
          input.campaignId,
          {
            status: input.status,
            limit: input.limit || 50,
          }
        );

        return {
          success: true,
          data: {
            enrollments: enrollmentResult.enrollments,
            total: enrollmentResult.total,
            campaignId: input.campaignId,
          },
        };
      }

      case 'sync_campaigns': {
        const syncResult = await campaignService.syncFromInstantly();

        return {
          success: true,
          data: {
            created: syncResult.created,
            updated: syncResult.updated,
            totalCampaigns: syncResult.campaigns.length,
            campaigns: syncResult.campaigns.map((c) => ({
              id: c.id,
              name: c.name,
              status: c.status,
              channel: c.channel,
            })),
            message: `Synced ${syncResult.campaigns.length} campaigns from Instantly (${syncResult.created} new, ${syncResult.updated} updated).`,
          },
        };
      }

      // ==================== TEMPLATE TOOLS ====================

      case 'list_templates': {
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
      }

      case 'create_template': {
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
      }

      case 'update_template': {
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
      }

      case 'delete_template': {
        await messageTemplateService.deleteTemplate(input.templateId);

        return {
          success: true,
          data: {
            message: `Template ${input.templateId} deleted successfully.`,
          },
        };
      }

      // ==================== ROUTING RULE TOOLS ====================

      case 'list_routing_rules': {
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
      }

      case 'create_routing_rule': {
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
      }

      case 'update_routing_rule': {
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
      }

      case 'delete_routing_rule': {
        await campaignRoutingService.deleteRule(input.ruleId);

        return {
          success: true,
          data: {
            message: `Routing rule ${input.ruleId} deleted successfully.`,
          },
        };
      }

      // ==================== JOB/PIPELINE TOOLS ====================

      case 'trigger_job': {
        const validJobs = ['shovels', 'homeowner', 'connection', 'enrich', 'merge', 'validate', 'enroll'];
        if (!validJobs.includes(input.jobName)) {
          return {
            success: false,
            error: `Invalid job name: ${input.jobName}. Valid jobs: ${validJobs.join(', ')}`,
          };
        }

        const scheduler = getScheduler();
        if (!scheduler) {
          return { success: false, error: 'Scheduler is not initialized. The system may still be starting up.' };
        }

        try {
          const jobResult = await scheduler.triggerJob(
            input.jobName as any,
            { useQueue: input.useQueue || false }
          );

          if (input.useQueue && jobResult.queued) {
            return {
              success: true,
              data: {
                queued: true,
                jobId: jobResult.jobId,
                message: `Job "${input.jobName}" added to queue. It will run in the background.`,
              },
            };
          }

          return {
            success: true,
            data: {
              result: jobResult,
              message: `Job "${input.jobName}" executed successfully.`,
            },
          };
        } catch (err: any) {
          return { success: false, error: `Failed to trigger job "${input.jobName}": ${err.message}` };
        }
      }

      case 'emergency_stop': {
        const stoppedBy = input.stoppedBy || 'jerry_ai';
        const stopResult = await settingsService.emergencyStop(stoppedBy);

        return {
          success: true,
          data: {
            controls: stopResult,
            message: `EMERGENCY STOP executed by ${stoppedBy}. All outreach, pipeline, and scheduled jobs have been disabled.`,
          },
        };
      }

      case 'resume_pipeline': {
        const resumeResult = await settingsService.resumePipeline();

        return {
          success: true,
          data: {
            controls: resumeResult,
            message: 'Pipeline resumed. All outreach and jobs have been re-enabled.',
          },
        };
      }

      case 'get_job_history': {
        const jobHistory = await jobLogService.getJobHistory(
          input.jobType as any,
          input.limit || 50
        );

        return {
          success: true,
          data: {
            history: jobHistory,
            total: jobHistory.length,
          },
        };
      }

      // ==================== HOMEOWNER/CONNECTION TOOLS ====================

      case 'delete_homeowner': {
        const homeowner = await prisma.homeowner.findUnique({
          where: { id: input.homeownerId },
          select: { id: true, fullName: true, email: true },
        });
        if (!homeowner) {
          return { success: false, error: `Homeowner not found with ID: ${input.homeownerId}` };
        }

        await prisma.homeowner.delete({ where: { id: input.homeownerId } });

        return {
          success: true,
          data: {
            message: `Homeowner ${homeowner.fullName || homeowner.email || input.homeownerId} deleted successfully.`,
          },
        };
      }

      case 'enrich_homeowners': {
        const batchSize = input.batchSize || 50;
        const enrichResult = await realieEnrichmentService.enrichPendingHomeowners(batchSize);

        return {
          success: true,
          data: {
            total: enrichResult.total,
            enriched: enrichResult.enriched,
            notFound: enrichResult.notFound,
            errors: enrichResult.errors,
            message: `Enriched ${enrichResult.enriched} of ${enrichResult.total} homeowners. ${enrichResult.notFound} not found in Realie, ${enrichResult.errors} errors.`,
          },
        };
      }

      case 'enrich_homeowner_contacts': {
        const contactBatchSize = input.batchSize || 50;
        const contactEnrichResult = await shovelsHomeownerEnrichmentService.enrichPendingHomeowners(contactBatchSize);

        return {
          success: true,
          data: {
            total: contactEnrichResult.total,
            enriched: contactEnrichResult.enriched,
            notFound: contactEnrichResult.notFound,
            noAddressId: contactEnrichResult.noAddressId,
            errors: contactEnrichResult.errors,
            message: `Contact enrichment complete: ${contactEnrichResult.enriched} of ${contactEnrichResult.total} homeowners got email/phone. ${contactEnrichResult.notFound} had no contact data in Shovels, ${contactEnrichResult.noAddressId} had no address ID, ${contactEnrichResult.errors} errors.`,
          },
        };
      }

      case 'list_connections': {
        const connResult = await connectionService.list({
          search: input.search,
          permitType: input.permitType,
          city: input.city,
          state: input.state,
          page: input.page || 1,
          limit: input.limit || 25,
        });

        return {
          success: true,
          data: {
            connections: connResult.data,
            pagination: connResult.pagination,
          },
        };
      }

      case 'resolve_connections': {
        const resolveResult = await connectionService.resolveConnections(
          input.batchSize || 50
        );

        return {
          success: true,
          data: {
            total: resolveResult.total,
            connected: resolveResult.connected,
            noContractor: resolveResult.noContractor,
            errors: resolveResult.errors,
            durationMs: resolveResult.duration,
            message: `Processed ${resolveResult.total} homeowners: ${resolveResult.connected} connected, ${resolveResult.noContractor} no contractor found, ${resolveResult.errors} errors.`,
          },
        };
      }

      // ==================== SYSTEM TOOLS ====================

      case 'check_system_health': {
        const healthChecks: Record<string, any> = {};

        // Check database
        try {
          await prisma.$queryRaw`SELECT 1`;
          healthChecks.database = { status: 'healthy', message: 'Connected' };
        } catch (dbErr: any) {
          healthChecks.database = { status: 'unhealthy', message: dbErr.message };
        }

        // Check Redis
        try {
          const redisPing = await redis.ping();
          healthChecks.redis = { status: redisPing === 'PONG' ? 'healthy' : 'unhealthy', message: redisPing };
        } catch (redisErr: any) {
          healthChecks.redis = { status: 'unhealthy', message: redisErr.message };
        }

        // Check pipeline settings
        const healthSettings = await prisma.settings.findFirst();
        healthChecks.pipeline = {
          enabled: healthSettings?.pipelineEnabled ?? false,
          schedulerEnabled: healthSettings?.schedulerEnabled ?? false,
          emailOutreachEnabled: healthSettings?.emailOutreachEnabled ?? false,
          smsOutreachEnabled: healthSettings?.smsOutreachEnabled ?? false,
          maintenanceMode: healthSettings?.maintenanceMode ?? false,
        };

        // Check scheduler
        const healthScheduler = getScheduler();
        healthChecks.scheduler = {
          initialized: !!healthScheduler,
          ...(healthScheduler ? healthScheduler.getStatus() : { isRunning: false, jobs: [] }),
        };

        // Check recent job activity
        const recentJobs = await prisma.importJob.findMany({
          where: { status: 'PROCESSING' },
          select: { id: true, type: true, status: true, startedAt: true },
          take: 5,
        });
        healthChecks.activeJobs = recentJobs;

        const allHealthy = healthChecks.database.status === 'healthy' && healthChecks.redis.status === 'healthy';

        return {
          success: true,
          data: {
            overall: allHealthy ? 'healthy' : 'degraded',
            checks: healthChecks,
          },
        };
      }

      case 'toggle_linkedin': {
        if (input.enabled) {
          await settingsService.enableLinkedIn();
        } else {
          await settingsService.disableLinkedIn();
        }

        return {
          success: true,
          data: {
            linkedinEnabled: input.enabled,
            message: `LinkedIn outreach ${input.enabled ? 'enabled' : 'disabled'} globally.`,
          },
        };
      }

      // ==================== WORKFLOW TOOLS (Phase 3E) ====================

      case 'create_workflow': {
        const workflow = await workflowEngine.createWorkflow({
          conversationId: input.conversationId,
          name: input.name,
          description: input.description,
          steps: (input.steps || []).map((step: any) => ({
            name: step.name,
            action: step.action,
            params: step.params || {},
            onFailure: step.onFailure || 'skip',
            condition: step.condition || undefined,
          })),
        });

        return {
          success: true,
          data: {
            workflowId: workflow.id,
            name: workflow.name,
            status: workflow.status,
            totalSteps: workflow.totalSteps,
            message: `Workflow "${workflow.name}" created with ${workflow.totalSteps} steps and queued for execution. ID: ${workflow.id}`,
          },
        };
      }

      case 'get_workflow_status': {
        const workflowStatus = await workflowEngine.getWorkflowStatus(input.workflowId);
        if (!workflowStatus) {
          return { success: false, error: `Workflow not found with ID: ${input.workflowId}` };
        }

        return {
          success: true,
          data: { workflow: workflowStatus },
        };
      }

      case 'cancel_workflow': {
        const cancelledWorkflow = await workflowEngine.cancelWorkflow(input.workflowId);
        if (!cancelledWorkflow) {
          return { success: false, error: `Workflow not found with ID: ${input.workflowId}` };
        }

        return {
          success: true,
          data: {
            workflowId: cancelledWorkflow.id,
            name: cancelledWorkflow.name,
            status: cancelledWorkflow.status,
            message: `Workflow "${cancelledWorkflow.name}" cancelled successfully.`,
          },
        };
      }

      // ==================== BATCH TOOLS (Phase 2B) ====================

      case 'batch_create_contacts': {
        const { contacts } = input;
        if (!Array.isArray(contacts) || contacts.length === 0) {
          return { success: false, error: 'contacts must be a non-empty array' };
        }
        if (contacts.length > 100) {
          return { success: false, error: 'Maximum 100 contacts per batch' };
        }

        let created = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const contact of contacts) {
          try {
            if (!contact.email) {
              errors.push(`Missing email for contact: ${JSON.stringify(contact)}`);
              continue;
            }

            // Check for existing contact
            const existing = await prisma.contact.findUnique({
              where: { email: contact.email.toLowerCase().trim() },
            });

            if (existing) {
              skipped++;
              continue;
            }

            await prisma.contact.create({
              data: {
                email: contact.email.toLowerCase().trim(),
                firstName: contact.firstName || null,
                lastName: contact.lastName || null,
                fullName: [contact.firstName, contact.lastName].filter(Boolean).join(' ') || null,
                phone: contact.phone || null,
                title: contact.title || null,
                city: contact.city || null,
                state: contact.state || null,
                tags: contact.tags || [],
                source: 'batch_import',
              },
            });
            created++;
          } catch (err: any) {
            if (err.code === 'P2002') {
              skipped++;
            } else {
              errors.push(`Error creating ${contact.email}: ${err.message}`);
            }
          }
        }

        return {
          success: true,
          data: {
            total: contacts.length,
            created,
            skipped,
            errors: errors.length > 0 ? errors : undefined,
          },
        };
      }

      case 'batch_enroll_contacts': {
        const { campaignId, contactIds } = input;
        if (!campaignId) return { success: false, error: 'campaignId is required' };
        if (!Array.isArray(contactIds) || contactIds.length === 0) {
          return { success: false, error: 'contactIds must be a non-empty array' };
        }

        const batchCampaign = await prisma.campaign.findUnique({
          where: { id: campaignId },
          include: {
            _count: { select: { enrollments: true } },
          },
        });
        if (!batchCampaign) return { success: false, error: `Campaign not found: ${campaignId}` };

        // Pre-enrollment validation
        const eligible: any[] = [];
        const skippedContacts: Array<{ contactId: string; contactName: string | null; reason: string }> = [];

        // Fetch all contacts in one query for efficiency
        const contacts = await prisma.contact.findMany({
          where: { id: { in: contactIds } },
          select: {
            id: true,
            fullName: true,
            email: true,
            status: true,
            emailValidationStatus: true,
            campaignEnrollments: {
              where: { campaignId, status: 'ENROLLED' },
              select: { id: true },
            },
          },
        });

        const contactMap = new Map(contacts.map((c) => [c.id, c]));

        for (const contactId of contactIds) {
          const contact = contactMap.get(contactId);
          if (!contact) {
            skippedContacts.push({ contactId, contactName: null, reason: 'not_found' });
            continue;
          }

          // Check already enrolled in same campaign
          if (contact.campaignEnrollments.length > 0) {
            skippedContacts.push({ contactId, contactName: contact.fullName, reason: 'already_enrolled' });
            continue;
          }

          // Check unsubscribed
          if (contact.status === 'UNSUBSCRIBED') {
            skippedContacts.push({ contactId, contactName: contact.fullName, reason: 'unsubscribed' });
            continue;
          }

          // Check customer
          if (contact.status === 'CUSTOMER') {
            skippedContacts.push({ contactId, contactName: contact.fullName, reason: 'customer' });
            continue;
          }

          // Check bounced
          if (contact.status === 'BOUNCED') {
            skippedContacts.push({ contactId, contactName: contact.fullName, reason: 'bounced' });
            continue;
          }

          // Check invalid email
          if (!contact.email || contact.emailValidationStatus === 'INVALID') {
            skippedContacts.push({ contactId, contactName: contact.fullName, reason: 'invalid_email' });
            continue;
          }

          eligible.push(contact);
        }

        // Enroll eligible contacts
        let enrolled = 0;
        const enrollErrors: string[] = [];

        for (const contact of eligible) {
          try {
            await prisma.campaignEnrollment.create({
              data: {
                campaignId,
                contactId: contact.id,
                status: 'ENROLLED',
              },
            });
            enrolled++;
          } catch (err: any) {
            if (err.code === 'P2002') {
              skippedContacts.push({ contactId: contact.id, contactName: contact.fullName, reason: 'already_enrolled' });
            } else {
              enrollErrors.push(`Error enrolling ${contact.id}: ${err.message}`);
            }
          }
        }

        return {
          success: true,
          data: {
            campaignId,
            campaignName: batchCampaign.name,
            total: contactIds.length,
            eligible: eligible.length,
            enrolled,
            skipped: skippedContacts,
            skippedCount: skippedContacts.length,
            errors: enrollErrors.length > 0 ? enrollErrors : undefined,
            message: `Enrolled ${enrolled} of ${contactIds.length} contacts into "${batchCampaign.name}". ${skippedContacts.length} skipped.`,
          },
        };
      }

      // ==================== GEO ID LOOKUP TOOL (Phase 2C) ====================

      case 'lookup_geo_id': {
        const { city, state } = input;
        if (!city) return { success: false, error: 'city is required' };

        const result = lookupGeoId(city, state);

        if (!result) {
          return {
            success: true,
            data: {
              found: false,
              message: `No GeoID found for "${city}${state ? ', ' + state : ''}". The city may not be in our database. Please ask the user for their county FIPS code.`,
            },
          };
        }

        if (Array.isArray(result)) {
          return {
            success: true,
            data: {
              found: true,
              multiple: true,
              city,
              message: `Multiple matches found for "${city}". Please confirm which one:`,
              matches: result.map(r => ({
                geoId: r.geoId,
                county: r.county,
                state: r.state,
                stateAbbr: r.stateAbbr,
              })),
            },
          };
        }

        return {
          success: true,
          data: {
            found: true,
            geoId: result.geoId,
            city,
            county: result.county,
            state: result.state,
            stateAbbr: result.stateAbbr,
          },
        };
      }

      // ==================== CONTACT LABEL TOOLS (Jerry $900 Scope) ====================

      case 'add_contact_label': {
        try {
          const label = await prisma.contactLabel.create({
            data: {
              contactId: input.contactId,
              name: input.name,
              ...(input.color && { color: input.color }),
            },
          });

          return {
            success: true,
            data: {
              label,
              message: `Label "${input.name}" added to contact ${input.contactId}.`,
            },
          };
        } catch (err: any) {
          // Handle unique constraint violation (label already exists)
          if (err.code === 'P2002') {
            return {
              success: true,
              data: {
                message: `Label "${input.name}" already exists on contact ${input.contactId}.`,
                alreadyExists: true,
              },
            };
          }
          throw err;
        }
      }

      case 'remove_contact_label': {
        await prisma.contactLabel.deleteMany({
          where: {
            contactId: input.contactId,
            name: input.name,
          },
        });

        return {
          success: true,
          data: {
            message: `Label "${input.name}" removed from contact ${input.contactId}.`,
          },
        };
      }

      case 'list_contact_labels': {
        const labels = await prisma.contactLabel.findMany({
          where: { contactId: input.contactId },
        });

        return {
          success: true,
          data: {
            labels,
            total: labels.length,
            contactId: input.contactId,
          },
        };
      }

      // ==================== CONTACT NOTE TOOL (Jerry $900 Scope) ====================

      case 'add_contact_note': {
        const noteContact = await prisma.contact.findUnique({
          where: { id: input.contactId },
          select: { id: true, ghlContactId: true, fullName: true },
        });

        if (!noteContact) {
          return { success: false, error: `Contact not found with ID: ${input.contactId}` };
        }

        // Sync note to GHL if contact is linked and GHL is configured
        if (noteContact.ghlContactId && ghlClient.isConfigured()) {
          try {
            await ghlClient.addContactNote(noteContact.ghlContactId, input.note);
          } catch (ghlErr: any) {
            logger.warn(
              { contactId: input.contactId, ghlContactId: noteContact.ghlContactId, error: ghlErr.message },
              'Failed to sync note to GHL, continuing with local log'
            );
          }
        }

        // Log to ActivityLog
        await prisma.activityLog.create({
          data: {
            contactId: input.contactId,
            action: 'NOTE_ADDED',
            description: input.note,
            actorType: 'ai',
          },
        });

        return {
          success: true,
          data: {
            message: `Note added to contact ${noteContact.fullName || input.contactId}.${noteContact.ghlContactId ? ' Also synced to GHL.' : ''}`,
            syncedToGhl: !!noteContact.ghlContactId,
          },
        };
      }

      // ==================== TAG TOOLS (Jerry $900 Scope) ====================

      case 'add_contact_tag': {
        const tagContact = await prisma.contact.findUnique({
          where: { id: input.contactId },
          select: { id: true, tags: true },
        });

        if (!tagContact) {
          return { success: false, error: `Contact not found with ID: ${input.contactId}` };
        }

        // Check if tag already exists to avoid duplicates
        if (tagContact.tags.includes(input.tag)) {
          return {
            success: true,
            data: {
              message: `Tag "${input.tag}" already exists on contact ${input.contactId}.`,
              alreadyExists: true,
            },
          };
        }

        const tagUpdated = await prisma.contact.update({
          where: { id: input.contactId },
          data: { tags: { push: input.tag } },
        });

        return {
          success: true,
          data: {
            tags: tagUpdated.tags,
            message: `Tag "${input.tag}" added to contact ${input.contactId}.`,
          },
        };
      }

      case 'remove_contact_tag': {
        const removeTagContact = await prisma.contact.findUnique({
          where: { id: input.contactId },
          select: { id: true, tags: true },
        });

        if (!removeTagContact) {
          return { success: false, error: `Contact not found with ID: ${input.contactId}` };
        }

        const filteredTags = removeTagContact.tags.filter((t) => t !== input.tag);

        const tagRemovedContact = await prisma.contact.update({
          where: { id: input.contactId },
          data: { tags: filteredTags },
        });

        return {
          success: true,
          data: {
            tags: tagRemovedContact.tags,
            message: `Tag "${input.tag}" removed from contact ${input.contactId}.`,
          },
        };
      }

      // ==================== HOMEOWNER/CONTRACTOR TOOLS (Jerry $900 Scope) ====================

      case 'lookup_homeowner_by_address': {
        const addressWhere: Record<string, any> = {
          street: { contains: input.address, mode: 'insensitive' },
        };
        if (input.city) {
          addressWhere.city = { contains: input.city, mode: 'insensitive' };
        }
        if (input.state) {
          addressWhere.state = { contains: input.state, mode: 'insensitive' };
        }

        const homeowners = await prisma.homeowner.findMany({
          where: addressWhere,
          include: { connections: true },
          take: 20,
        });

        return {
          success: true,
          data: {
            homeowners,
            total: homeowners.length,
            message: homeowners.length > 0
              ? `Found ${homeowners.length} homeowner(s) matching "${input.address}".`
              : `No homeowners found matching "${input.address}".`,
          },
        };
      }

      case 'get_contractor_brief': {
        const contractor = await prisma.contact.findUnique({
          where: { id: input.contactId },
          include: {
            activityLogs: {
              take: 10,
              orderBy: { createdAt: 'desc' },
            },
            replies: true,
            campaignEnrollments: {
              include: { campaign: true },
            },
            labels: true,
          },
        });

        if (!contractor) {
          return { success: false, error: `Contact not found with ID: ${input.contactId}` };
        }

        return {
          success: true,
          data: {
            contact: {
              id: contractor.id,
              fullName: contractor.fullName,
              firstName: contractor.firstName,
              lastName: contractor.lastName,
              email: contractor.email,
              phone: contractor.phone,
              phoneFormatted: contractor.phoneFormatted,
              title: contractor.title,
              city: contractor.city,
              state: contractor.state,
              status: contractor.status,
              tags: contractor.tags,
              source: contractor.source,
              hasReplied: contractor.hasReplied,
              repliedAt: contractor.repliedAt,
              lastContactedAt: contractor.lastContactedAt,
              ghlContactId: contractor.ghlContactId,
              permitType: contractor.permitType,
              permitCity: contractor.permitCity,
              licenseNumber: contractor.licenseNumber,
              avgJobValue: contractor.avgJobValue,
              totalJobValue: contractor.totalJobValue,
              permitCount: contractor.permitCount,
              revenue: contractor.revenue,
              employeeCount: contractor.employeeCount,
              website: contractor.website,
              rating: contractor.rating,
              reviewCount: contractor.reviewCount,
              seniorityLevel: contractor.seniorityLevel,
              department: contractor.department,
              createdAt: contractor.createdAt,
              updatedAt: contractor.updatedAt,
            },
            labels: contractor.labels,
            recentActivity: contractor.activityLogs,
            replies: contractor.replies,
            campaignEnrollments: contractor.campaignEnrollments.map((e) => ({
              id: e.id,
              campaignId: e.campaignId,
              campaignName: e.campaign.name,
              status: e.status,
              enrolledAt: e.enrolledAt,
              stoppedAt: e.stoppedAt,
              stoppedReason: e.stoppedReason,
            })),
          },
        };
      }

      // ==================== MARK AS CUSTOMER (Jerry $900 Scope) ====================

      case 'mark_as_customer': {
        const custContact = await prisma.contact.findUnique({
          where: { id: input.contactId },
          select: { id: true, fullName: true, status: true },
        });

        if (!custContact) {
          return { success: false, error: `Contact not found with ID: ${input.contactId}` };
        }

        // 1. Update contact status to CUSTOMER
        await prisma.contact.update({
          where: { id: input.contactId },
          data: { status: 'CUSTOMER' },
        });

        // 2. Stop all active campaign enrollments
        const stoppedEnrollments = await prisma.campaignEnrollment.updateMany({
          where: { contactId: input.contactId, status: 'ENROLLED' },
          data: { status: 'STOPPED', stoppedAt: new Date(), stoppedReason: 'marked_as_customer' },
        });

        // 3. Add Customer label (catch if already exists)
        try {
          await prisma.contactLabel.create({
            data: {
              contactId: input.contactId,
              name: 'Customer',
              color: '#22c55e',
            },
          });
        } catch (labelErr: any) {
          if (labelErr.code !== 'P2002') throw labelErr;
          // Label already exists, that's fine
        }

        // 4. Log to ActivityLog
        await prisma.activityLog.create({
          data: {
            contactId: input.contactId,
            action: 'MARKED_AS_CUSTOMER',
            description: 'Marked as customer — removed from all active sequences',
            actorType: 'ai',
          },
        });

        return {
          success: true,
          data: {
            contactId: input.contactId,
            contactName: custContact.fullName,
            previousStatus: custContact.status,
            newStatus: 'CUSTOMER',
            enrollmentsStopped: stoppedEnrollments.count,
            message: `${custContact.fullName || input.contactId} marked as customer. ${stoppedEnrollments.count} active enrollment(s) stopped, Customer label added.`,
          },
        };
      }

      // ==================== WORKFLOW PRESET TOOLS (Jerry $900 Scope) ====================

      case 'list_workflow_presets': {
        const presets = getAllPresets();

        return {
          success: true,
          data: {
            presets: presets.map((p) => ({
              id: p.id,
              name: p.name,
              description: p.description,
              triggerHints: p.triggerHints,
              stepCount: p.steps.length,
            })),
            total: presets.length,
          },
        };
      }

      case 'run_workflow_preset': {
        const preset = getPresetById(input.presetId);
        if (!preset) {
          return {
            success: false,
            error: `Workflow preset not found with ID: "${input.presetId}". Use list_workflow_presets to see available presets.`,
          };
        }

        // Merge any override params into step params
        const stepsWithOverrides = preset.steps.map((step) => {
          const mergedParams = { ...step.params };
          if (input.params) {
            // Apply override params to any step that has matching keys
            for (const [key, value] of Object.entries(input.params)) {
              if (key in mergedParams) {
                (mergedParams as Record<string, any>)[key] = value;
              }
            }
          }
          return {
            name: step.name,
            action: step.action,
            params: mergedParams,
            onFailure: step.onFailure || 'skip',
          };
        });

        // Return the preset plan for Jerry to show as a confirmation card
        // Don't auto-execute — let Jerry confirm first
        return {
          success: true,
          data: {
            presetId: preset.id,
            presetName: preset.name,
            description: preset.description,
            steps: stepsWithOverrides.map((s, i) => ({
              order: i + 1,
              name: s.name,
              action: s.action,
              params: s.params,
              onFailure: s.onFailure,
            })),
            totalSteps: stepsWithOverrides.length,
            message: `Workflow preset "${preset.name}" ready to execute with ${stepsWithOverrides.length} steps. Use create_workflow to start it.`,
          },
        };
      }

      // ==================== GHL OPPORTUNITY TOOL (Jerry $900 Scope) ====================

      case 'create_ghl_opportunity': {
        if (!ghlClient.isConfigured()) {
          return { success: false, error: 'GoHighLevel is not configured. Set GHL_API_KEY and GHL_LOCATION_ID to enable opportunity creation.' };
        }
        const oppContact = await prisma.contact.findUnique({
          where: { id: input.contactId },
          select: { id: true, ghlContactId: true, fullName: true },
        });

        if (!oppContact) {
          return { success: false, error: `Contact not found with ID: ${input.contactId}` };
        }

        if (!oppContact.ghlContactId) {
          return { success: false, error: 'Contact not synced to GHL. The contact must have a ghlContactId to create an opportunity.' };
        }

        // Get pipelineId/stageId from params or fall back to Settings
        let pipelineId = input.pipelineId;
        let stageId = input.stageId;

        if (!pipelineId || !stageId) {
          const settings = await prisma.settings.findFirst();
          if (!pipelineId) pipelineId = settings?.ghlPipelineId;
          if (!stageId) stageId = settings?.ghlDefaultStageId;
        }

        if (!pipelineId) {
          return { success: false, error: 'No pipelineId provided and no default pipeline configured in settings.' };
        }
        if (!stageId) {
          return { success: false, error: 'No stageId provided and no default stage configured in settings.' };
        }

        const opportunity = await ghlClient.createOpportunity({
          pipelineId,
          stageId,
          contactId: oppContact.ghlContactId,
          name: input.name,
          ...(input.monetaryValue !== undefined && { monetaryValue: input.monetaryValue }),
        });

        // Log to ActivityLog
        await prisma.activityLog.create({
          data: {
            contactId: input.contactId,
            action: 'GHL_OPPORTUNITY_CREATED',
            description: `GHL opportunity created: "${input.name}"`,
            actorType: 'ai',
            metadata: {
              opportunityId: opportunity.id,
              pipelineId,
              stageId,
              monetaryValue: input.monetaryValue,
            },
          },
        });

        return {
          success: true,
          data: {
            opportunity,
            message: `GHL opportunity "${input.name}" created for ${oppContact.fullName || input.contactId}.`,
          },
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error(`Tool execution failed: ${name}`, { error: message, input });
    return { success: false, error: message };
  }
}

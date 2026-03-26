import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { ToolDefinition, ToolHandler, ToolRegistry, ToolErrorCode } from './types';
import { prisma } from '../../../config/database';
import { redis } from '../../../config/redis';
import { config } from '../../../config';
import { settingsService } from '../../settings/settings.service';
import { jobLogService } from '../../job-log.service';
import { getScheduler } from '../../../jobs/scheduler';
import { contactExportService } from '../../contact/export.service';
import { ghlClient } from '../../../integrations/ghl/client';

// Ensure export directory exists on startup
if (!fs.existsSync(config.defaults.exportDir)) {
  fs.mkdirSync(config.defaults.exportDir, { recursive: true });
}

const definitions: ToolDefinition[] = [
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
    name: 'check_system_health',
    description:
      'Check the health of system integrations including database, Redis, and pipeline status.',
    input_schema: {
      type: 'object',
      properties: {},
    },
  },
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

const handlers: Record<string, ToolHandler> = {
  get_settings: async () => {
    const settings = await prisma.settings.findFirst();
    if (!settings) {
      return { success: false, error: 'No settings found', code: 'PRECONDITION' as ToolErrorCode };
    }
    return { success: true, data: settings };
  },

  update_settings: async (input) => {
    const settings = await prisma.settings.findFirst();
    if (!settings) {
      return { success: false, error: 'No settings found to update', code: 'PRECONDITION' as ToolErrorCode };
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
      return { success: false, error: 'No valid fields provided to update', code: 'VALIDATION' as ToolErrorCode };
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
  },

  get_metrics: async (input) => {
    const days = input.days || 7;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const metrics = await prisma.dailyMetrics.findMany({
      where: { date: { gte: since } },
      orderBy: { date: 'desc' },
    });
    return { success: true, data: metrics };
  },

  get_activity_log: async (input) => {
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
  },

  check_system_health: async () => {
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
  },

  trigger_job: async (input) => {
    const validJobs = ['shovels', 'homeowner', 'connection', 'enrich', 'merge', 'validate', 'enroll'];
    if (!validJobs.includes(input.jobName)) {
      return {
        success: false,
        error: `Invalid job name: ${input.jobName}. Valid jobs: ${validJobs.join(', ')}`,
        code: 'VALIDATION' as ToolErrorCode,
      };
    }

    const scheduler = getScheduler();
    if (!scheduler) {
      return { success: false, error: 'Scheduler is not initialized. The system may still be starting up.', code: 'INTEGRATION' as ToolErrorCode };
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
      return { success: false, error: `Failed to trigger job "${input.jobName}": ${err.message}`, code: 'SERVICE' as ToolErrorCode };
    }
  },

  emergency_stop: async (input) => {
    const stoppedBy = input.stoppedBy || 'jerry_ai';
    const stopResult = await settingsService.emergencyStop(stoppedBy);

    return {
      success: true,
      data: {
        controls: stopResult,
        message: `EMERGENCY STOP executed by ${stoppedBy}. All outreach, pipeline, and scheduled jobs have been disabled.`,
      },
    };
  },

  resume_pipeline: async () => {
    const resumeResult = await settingsService.resumePipeline();

    return {
      success: true,
      data: {
        controls: resumeResult,
        message: 'Pipeline resumed. All outreach and jobs have been re-enabled.',
      },
    };
  },

  get_job_history: async (input) => {
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
  },

  toggle_linkedin: async (input) => {
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
  },

  export_contacts: async (input) => {
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
  },

  create_ghl_opportunity: async (input) => {
    if (!ghlClient.isConfigured()) {
      return { success: false, error: 'GoHighLevel is not configured. Set GHL_API_KEY and GHL_LOCATION_ID to enable opportunity creation.', code: 'INTEGRATION' as ToolErrorCode };
    }
    const oppContact = await prisma.contact.findUnique({
      where: { id: input.contactId },
      select: { id: true, ghlContactId: true, fullName: true },
    });

    if (!oppContact) {
      return { success: false, error: `Contact not found with ID: ${input.contactId}`, code: 'PRECONDITION' as ToolErrorCode };
    }

    if (!oppContact.ghlContactId) {
      return { success: false, error: 'Contact not synced to GHL. The contact must have a ghlContactId to create an opportunity.', code: 'PRECONDITION' as ToolErrorCode };
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
      return { success: false, error: 'No pipelineId provided and no default pipeline configured in settings.', code: 'PRECONDITION' as ToolErrorCode };
    }
    if (!stageId) {
      return { success: false, error: 'No stageId provided and no default stage configured in settings.', code: 'PRECONDITION' as ToolErrorCode };
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
  },
};

export function registerTools(registry: ToolRegistry): void {
  for (const def of definitions) {
    registry.register(def, handlers[def.name]);
  }
}

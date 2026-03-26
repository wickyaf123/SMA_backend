import { z } from 'zod';
import { logger } from '../../utils/logger';

// Reusable schemas
const uuidField = z.string().uuid('Must be a valid UUID');
const optionalUuid = z.string().uuid('Must be a valid UUID').optional();
const emailField = z.string().email('Must be a valid email').optional();
const phoneField = z.string().min(7).max(20).optional();
const stringField = z.string().max(500);
const shortString = z.string().max(200);

// AI-friendly coercion helpers
const coerceInt = (min?: number, max?: number) => {
  let schema = z.coerce.number().int();
  if (min !== undefined) schema = schema.min(min);
  if (max !== undefined) schema = schema.max(max);
  return schema;
};

// Tool input schemas -- one per registered tool (61 total)
const toolSchemas: Record<string, z.ZodSchema> = {
  // ── permit.ts (4 tools) ──────────────────────────────────────────────

  search_permits: z.object({
    permitType: z.string().min(1).max(100),
    city: z.string().min(1).max(200),
    geoId: z.string().max(100).nullish(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').nullish(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').nullish(),
    maxResults: coerceInt(1, 500).optional(),
    limit: coerceInt(1, 500).optional(),
  }),

  get_permit_searches: z.object({
    limit: coerceInt(1, 100).optional(),
    status: z.string().max(50).nullish(),
  }),

  lookup_geo_id: z.object({
    city: z.string().min(1).max(200),
    state: z.string().min(1).max(100).nullish(),
  }),

  get_pipeline_status: z.object({}),

  // ── contact.ts (18 tools) ────────────────────────────────────────────

  list_contacts: z.object({
    search: shortString.nullish(),
    status: z.string().max(50).nullish(),
    city: shortString.nullish(),
    state: z.string().max(50).nullish(),
    hasReplied: z.boolean().nullish(),
    hasEmail: z.boolean().nullish(),
    hasPhone: z.boolean().nullish(),
    emailValidationStatus: z.string().max(50).nullish(),
    phoneValidationStatus: z.string().max(50).nullish(),
    filter: z.enum(['missing_email', 'invalid_phone', 'duplicates', 'no_engagement']).nullish(),
    page: coerceInt(1).optional(),
    limit: coerceInt(1, 100).optional(),
  }),

  get_contact: z.object({
    contactId: uuidField,
  }),

  create_contact: z.object({
    firstName: shortString.nullish(),
    lastName: shortString.nullish(),
    email: z.string().email('Must be a valid email').nullish(),
    phone: z.string().min(7).max(20).nullish(),
    city: shortString.nullish(),
    state: z.string().max(50).nullish(),
    source: z.string().max(100).nullish(),
    tags: z.array(z.string().max(100)).max(50).nullish(),
  }),

  update_contact: z.object({
    contactId: uuidField,
    firstName: shortString.nullish(),
    lastName: shortString.nullish(),
    email: z.string().email('Must be a valid email').nullish(),
    phone: z.string().min(7).max(20).nullish(),
    city: shortString.nullish(),
    state: z.string().max(50).nullish(),
    title: shortString.nullish(),
    status: z.string().max(50).nullish(),
    tags: z.array(z.string().max(100)).max(50).nullish(),
  }),

  delete_contact: z.object({
    contactId: uuidField,
  }),

  get_contact_stats: z.object({}),

  get_contact_replies: z.object({
    contactId: optionalUuid,
    limit: coerceInt(1, 100).optional(),
  }),

  get_contact_activity: z.object({
    contactId: uuidField,
    limit: coerceInt(1, 500).optional(),
  }),

  add_contact_label: z.object({
    contactId: uuidField,
    name: shortString,
    color: z.string().max(50).nullish(),
  }),

  remove_contact_label: z.object({
    contactId: uuidField,
    name: shortString,
  }),

  list_contact_labels: z.object({
    contactId: uuidField,
  }),

  add_contact_note: z.object({
    contactId: uuidField,
    note: z.string().min(1).max(2000),
  }),

  add_contact_tag: z.object({
    contactId: uuidField,
    tag: z.string().min(1).max(100),
  }),

  remove_contact_tag: z.object({
    contactId: uuidField,
    tag: z.string().min(1).max(100),
  }),

  batch_create_contacts: z.object({
    contacts: z.array(z.object({
      email: z.string().email('Must be a valid email'),
      firstName: shortString.nullish(),
      lastName: shortString.nullish(),
      phone: z.string().min(7).max(20).nullish(),
      company: shortString.nullish(),
      title: shortString.nullish(),
      city: shortString.nullish(),
      state: z.string().max(50).nullish(),
      tags: z.array(z.string().max(100)).max(50).nullish(),
    })).min(1).max(100),
  }),

  get_contractor_brief: z.object({
    contactId: uuidField,
  }),

  mark_as_customer: z.object({
    contactId: uuidField,
  }),

  lookup_homeowner_by_address: z.object({
    address: z.string().min(1).max(500),
    city: shortString.nullish(),
    state: z.string().max(50).nullish(),
  }),

  // ── campaign.ts (7 tools) ────────────────────────────────────────────

  list_campaigns: z.object({
    status: z.string().max(50).nullish(),
    channel: z.string().max(50).nullish(),
    limit: coerceInt(1, 100).optional(),
  }),

  get_campaign_analytics: z.object({
    campaignId: optionalUuid,
  }),

  enroll_contacts: z.object({
    campaignId: uuidField,
    contactIds: z.array(uuidField).min(1).max(500),
  }),

  stop_enrollment: z.object({
    campaignId: uuidField,
    contactId: uuidField,
    reason: z.string().max(200).nullish(),
  }),

  get_campaign_enrollments: z.object({
    campaignId: uuidField,
    status: z.string().max(50).nullish(),
    limit: coerceInt(1, 100).optional(),
  }),

  sync_campaigns: z.object({}),

  batch_enroll_contacts: z.object({
    campaignId: uuidField,
    contactIds: z.array(uuidField).min(1).max(500),
  }),

  // ── outreach.ts (1 tool) ─────────────────────────────────────────────

  send_sms: z.object({
    contactId: uuidField,
    message: z.string().min(1).max(1600),
    campaignId: optionalUuid,
  }),

  // ── template.ts (4 tools) ────────────────────────────────────────────

  list_templates: z.object({
    channel: z.string().max(50).nullish(),
    isActive: z.boolean().nullish(),
    limit: coerceInt(1, 100).optional(),
  }),

  create_template: z.object({
    name: shortString,
    channel: z.string().max(50),
    subject: z.string().max(500).nullish(),
    body: z.string().min(1).max(5000),
    description: z.string().max(1000).nullish(),
    isDefault: z.boolean().nullish(),
    tags: z.array(z.string().max(100)).max(20).nullish(),
  }),

  update_template: z.object({
    templateId: uuidField,
    name: shortString.nullish(),
    subject: z.string().max(500).nullish(),
    body: z.string().min(1).max(5000).nullish(),
    description: z.string().max(1000).nullish(),
    isActive: z.boolean().nullish(),
    isDefault: z.boolean().nullish(),
    tags: z.array(z.string().max(100)).max(20).nullish(),
  }),

  delete_template: z.object({
    templateId: uuidField,
  }),

  // ── routing.ts (4 tools) ─────────────────────────────────────────────

  list_routing_rules: z.object({
    isActive: z.boolean().nullish(),
    campaignId: optionalUuid,
  }),

  create_routing_rule: z.object({
    name: shortString,
    description: z.string().max(1000).nullish(),
    priority: coerceInt().optional(),
    isActive: z.boolean().nullish(),
    matchMode: z.string().max(10).nullish(),
    sourceFilter: z.array(z.string().max(100)).nullish(),
    industryFilter: z.array(z.string().max(100)).nullish(),
    stateFilter: z.array(z.string().max(100)).nullish(),
    countryFilter: z.array(z.string().max(100)).nullish(),
    tagsFilter: z.array(z.string().max(100)).nullish(),
    employeesMinFilter: coerceInt(0).nullish(),
    employeesMaxFilter: coerceInt(0).nullish(),
    campaignId: uuidField,
  }),

  update_routing_rule: z.object({
    ruleId: uuidField,
    name: shortString.nullish(),
    description: z.string().max(1000).nullish(),
    priority: coerceInt().optional(),
    isActive: z.boolean().nullish(),
    matchMode: z.string().max(10).nullish(),
    sourceFilter: z.array(z.string().max(100)).nullish(),
    industryFilter: z.array(z.string().max(100)).nullish(),
    stateFilter: z.array(z.string().max(100)).nullish(),
    countryFilter: z.array(z.string().max(100)).nullish(),
    tagsFilter: z.array(z.string().max(100)).nullish(),
    employeesMinFilter: coerceInt(0).nullish(),
    employeesMaxFilter: coerceInt(0).nullish(),
    campaignId: optionalUuid,
  }),

  delete_routing_rule: z.object({
    ruleId: uuidField,
  }),

  // ── workflow.ts (5 tools) ─────────────────────────────────────────────

  create_workflow: z.object({
    name: shortString,
    description: z.string().max(1000).nullish(),
    conversationId: z.string().max(200).nullish(),
    steps: z.array(z.object({
      name: z.string().max(200),
      action: z.string().max(200),
      params: z.record(z.any()).nullish(),
      onFailure: z.enum(['skip', 'stop', 'retry']).nullish(),
      condition: z.string().max(500).nullish(),
    })).min(1),
  }),

  get_workflow_status: z.object({
    workflowId: z.string().min(1).max(200),
  }),

  cancel_workflow: z.object({
    workflowId: z.string().min(1).max(200),
  }),

  list_workflow_presets: z.object({}),

  run_workflow_preset: z.object({
    presetId: z.string().min(1).max(100),
    params: z.record(z.any()).nullish(),
  }),

  // ── homeowner.ts (6 tools) ───────────────────────────────────────────

  list_homeowners: z.object({
    search: shortString.nullish(),
    city: shortString.nullish(),
    state: z.string().max(50).nullish(),
    status: z.string().max(50).nullish(),
    page: coerceInt(1).optional(),
    limit: coerceInt(1, 100).optional(),
  }),

  delete_homeowner: z.object({
    homeownerId: uuidField,
  }),

  enrich_homeowners: z.object({
    batchSize: coerceInt(1, 1000).optional(),
  }),

  enrich_homeowner_contacts: z.object({
    batchSize: coerceInt(1, 1000).optional(),
  }),

  list_connections: z.object({
    search: shortString.nullish(),
    permitType: z.string().max(100).nullish(),
    city: shortString.nullish(),
    state: z.string().max(50).nullish(),
    page: coerceInt(1).optional(),
    limit: coerceInt(1, 100).optional(),
  }),

  resolve_connections: z.object({
    batchSize: coerceInt(1, 1000).optional(),
  }),

  // ── settings.ts (12 tools) ───────────────────────────────────────────

  get_settings: z.object({}),

  update_settings: z.object({
    pipelineEnabled: z.boolean().nullish(),
    emailOutreachEnabled: z.boolean().nullish(),
    smsOutreachEnabled: z.boolean().nullish(),
    schedulerEnabled: z.boolean().nullish(),
    scrapeJobEnabled: z.boolean().nullish(),
    enrichJobEnabled: z.boolean().nullish(),
    shovelsPermitTypes: z.array(z.string().max(100)).nullish(),
    shovelsLocations: z.array(z.string().max(200)).nullish(),
  }),

  get_metrics: z.object({
    days: coerceInt(1, 365).optional(),
  }),

  get_activity_log: z.object({
    limit: coerceInt(1, 500).optional(),
    action: z.string().max(100).nullish(),
    contactId: optionalUuid,
  }),

  check_system_health: z.object({}),

  trigger_job: z.object({
    jobName: z.enum(['shovels', 'homeowner', 'connection', 'enrich', 'merge', 'validate', 'enroll']),
    useQueue: z.boolean().nullish(),
  }),

  emergency_stop: z.object({
    stoppedBy: z.string().max(200).nullish(),
  }),

  resume_pipeline: z.object({}),

  get_job_history: z.object({
    jobType: z.string().max(100).nullish(),
    limit: coerceInt(1, 500).optional(),
  }),

  toggle_linkedin: z.object({
    enabled: z.boolean(),
  }),

  export_contacts: z.object({
    status: z.string().max(50).nullish(),
    city: shortString.nullish(),
    state: z.string().max(50).nullish(),
    hasReplied: z.boolean().nullish(),
    tags: z.array(z.string().max(100)).max(50).nullish(),
  }),

  create_ghl_opportunity: z.object({
    contactId: uuidField,
    name: z.string().min(1).max(200),
    pipelineId: z.string().max(200).nullish(),
    stageId: z.string().max(200).nullish(),
    monetaryValue: z.coerce.number().nullish(),
  }),
};

/**
 * Validate tool input against its Zod schema.
 * Returns the parsed (and potentially coerced) input, or throws a descriptive error.
 */
export function validateToolInput(toolName: string, input: Record<string, any>): Record<string, any> {
  const schema = toolSchemas[toolName];
  if (!schema) {
    // Warn when a tool has no schema so future tools get flagged
    logger.warn(`No validation schema defined for tool "${toolName}" -- passing through unvalidated input`);
    return input;
  }

  const result = schema.safeParse(input);
  if (!result.success) {
    const issues = result.error.issues.map(
      (i) => `${i.path.join('.')}: ${i.message}`
    ).join('; ');
    throw new Error(`Invalid input for tool "${toolName}": ${issues}`);
  }

  return result.data;
}

/** Expose schema count for testing/verification */
export const TOOL_SCHEMA_COUNT = Object.keys(toolSchemas).length;

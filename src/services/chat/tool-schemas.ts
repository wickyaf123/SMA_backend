import { z } from 'zod';

// Reusable schemas
const uuidField = z.string().uuid('Must be a valid UUID');
const optionalUuid = z.string().uuid('Must be a valid UUID').optional();
const emailField = z.string().email('Must be a valid email').optional();
const phoneField = z.string().min(7).max(20).optional();
const stringField = z.string().max(500);
const shortString = z.string().max(200);

// Tool input schemas
const toolSchemas: Record<string, z.ZodSchema> = {
  search_permits: z.object({
    permitType: z.string().min(1).max(100),
    city: z.string().min(1).max(200),
    geoId: z.string().max(100).optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
    endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD').optional(),
    maxResults: z.number().int().min(1).max(500).optional(),
    limit: z.coerce.number().int().min(1).max(500).optional(),
  }),

  get_permit_searches: z.object({
    limit: z.number().int().min(1).max(100).optional(),
    status: z.string().max(50).optional(),
  }),

  list_contacts: z.object({
    search: shortString.optional(),
    status: z.string().max(50).optional(),
    city: shortString.optional(),
    state: z.string().max(50).optional(),
    hasReplied: z.boolean().optional(),
    hasEmail: z.boolean().optional(),
    hasPhone: z.boolean().optional(),
    emailValidationStatus: z.string().max(50).optional(),
    phoneValidationStatus: z.string().max(50).optional(),
    filter: z.enum(['missing_email', 'invalid_phone', 'duplicates', 'no_engagement']).optional(),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  }),

  get_contact: z.object({
    contactId: uuidField,
  }),

  create_contact: z.object({
    firstName: shortString.optional(),
    lastName: shortString.optional(),
    email: emailField,
    phone: phoneField,
    companyName: shortString.optional(),
    city: shortString.optional(),
    state: z.string().max(50).optional(),
    tags: z.array(z.string().max(100)).max(50).optional(),
  }),

  update_contact: z.object({
    contactId: uuidField,
    firstName: shortString.optional(),
    lastName: shortString.optional(),
    email: emailField,
    phone: phoneField,
    status: z.string().max(50).optional(),
    tags: z.array(z.string().max(100)).max(50).optional(),
  }),

  delete_contact: z.object({
    contactId: uuidField,
  }),

  list_campaigns: z.object({
    status: z.string().max(50).optional(),
    channel: z.string().max(50).optional(),
    page: z.number().int().min(1).optional(),
    limit: z.number().int().min(1).max(100).optional(),
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
    reason: z.string().max(200).optional(),
  }),

  send_sms: z.object({
    contactId: uuidField,
    message: z.string().min(1).max(1600),
    campaignId: optionalUuid,
  }),

  create_ghl_opportunity: z.object({
    contactId: uuidField,
    name: z.string().min(1).max(200),
    pipelineId: z.string().max(200).optional(),
    stageId: z.string().max(200).optional(),
    monetaryValue: z.number().optional(),
  }),

  export_contacts: z.object({
    status: z.string().max(50).optional(),
    city: shortString.optional(),
    state: z.string().max(50).optional(),
    hasReplied: z.boolean().optional(),
    tags: z.array(z.string().max(100)).max(50).optional(),
  }),

  get_metrics: z.object({
    period: z.string().max(50).optional(),
    days: z.number().int().min(1).max(365).optional(),
  }),

  get_contact_stats: z.object({}),

  get_contact_replies: z.object({
    contactId: optionalUuid,
  }),

  lookup_geo_id: z.object({
    city: z.string().min(1).max(200),
    state: z.string().min(1).max(100).optional(),
  }),

  enrich_homeowners: z.object({
    batchSize: z.number().int().min(1).max(1000).optional(),
    geoId: z.string().max(100).optional(),
    city: shortString.optional(),
  }),

  batch_create_contacts: z.object({
    contacts: z.array(z.object({
      firstName: shortString.optional(),
      lastName: shortString.optional(),
      email: emailField,
      phone: phoneField,
      companyName: shortString.optional(),
    })).min(1).max(500),
  }),

  batch_enroll_contacts: z.object({
    campaignId: uuidField,
    contactIds: z.array(uuidField).min(1).max(500),
  }),

  trigger_workflow: z.object({
    presetId: z.string().min(1).max(100).optional(),
    name: shortString.optional(),
    steps: z.array(z.any()).optional(),
  }),

  add_contact_to_workflow: z.object({
    contactId: uuidField,
    workflowId: z.string().min(1).max(200),
  }),
};

/**
 * Validate tool input against its Zod schema.
 * Returns the parsed (and potentially coerced) input, or throws a descriptive error.
 */
export function validateToolInput(toolName: string, input: Record<string, any>): Record<string, any> {
  const schema = toolSchemas[toolName];
  if (!schema) {
    // No schema defined for this tool — pass through without validation
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

import type { AgentDomain } from '../../tools/types';

export type AgentId =
  | 'permit_discovery'
  | 'contact_mgmt'
  | 'campaign_routing'
  | 'outreach_exec'
  | 'workflow_orch'
  | 'system_admin';

export const AGENT_DOMAIN_MAP: Record<AgentId, AgentDomain> = {
  permit_discovery: 'permit',
  contact_mgmt: 'contact',
  campaign_routing: 'campaign',
  outreach_exec: 'outreach',
  workflow_orch: 'workflow',
  system_admin: 'system',
};

export const AGENT_MODEL_MAP: Record<AgentId, 'sonnet' | 'haiku'> = {
  permit_discovery: 'sonnet',
  contact_mgmt: 'sonnet',
  campaign_routing: 'sonnet',
  outreach_exec: 'sonnet',
  workflow_orch: 'haiku',
  system_admin: 'haiku',
};

export const AGENT_TOOL_MAP: Record<AgentId, string[]> = {
  permit_discovery: [
    'search_permits',
    'get_permit_searches',
    'lookup_geo_id',
    'cancel_permit_search',
    'search_homeowners',
    'list_homeowners',
    'delete_homeowner',
    'enrich_homeowners',
    'enrich_homeowner_contacts',
    'list_connections',
    'resolve_connections',
    'update_conversation_title',
  ],
  contact_mgmt: [
    'list_contacts',
    'get_contact',
    'create_contact',
    'update_contact',
    'delete_contact',
    'get_contact_stats',
    'get_contact_replies',
    'get_contact_activity',
    'add_contact_label',
    'remove_contact_label',
    'list_contact_labels',
    'add_contact_note',
    'add_contact_tag',
    'remove_contact_tag',
    'batch_create_contacts',
    'get_contractor_brief',
    'mark_as_customer',
    'lookup_homeowner_by_address',
  ],
  campaign_routing: [
    'list_campaigns',
    'get_campaign_analytics',
    'enroll_contacts',
    'stop_enrollment',
    'get_campaign_enrollments',
    'sync_campaigns',
    'list_routing_rules',
    'create_routing_rule',
    'update_routing_rule',
    'delete_routing_rule',
  ],
  outreach_exec: [
    'send_sms',
    'list_templates',
    'create_template',
    'update_template',
    'delete_template',
  ],
  workflow_orch: [
    'create_workflow',
    'get_workflow_status',
    'cancel_workflow',
    'list_workflow_presets',
    'run_workflow_preset',
  ],
  system_admin: [
    'get_settings',
    'update_settings',
    'get_metrics',
    'get_activity_log',
    'check_system_health',
    'trigger_job',
    'emergency_stop',
    'resume_pipeline',
    'get_job_history',
    'toggle_linkedin',
    'export_contacts',
    'create_ghl_opportunity',
    'pipeline_health',
  ],
};

export function getAgentForTool(toolName: string): AgentId | null {
  for (const [agentId, tools] of Object.entries(AGENT_TOOL_MAP) as [AgentId, string[]][]) {
    if (tools.includes(toolName)) return agentId;
  }
  return null;
}

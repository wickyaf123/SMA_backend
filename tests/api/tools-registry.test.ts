import { describe, it, expect } from 'vitest';
import { toolDefinitions, executeTool } from '../../src/services/chat/tools/index';

// Expected tool names in domain registration order (permit, contact, campaign, outreach, template, routing, workflow, homeowner, settings)
const EXPECTED_PERMIT_TOOLS = ['search_permits', 'get_permit_searches', 'lookup_geo_id', 'get_pipeline_status', 'cancel_permit_search'];
const EXPECTED_CONTACT_TOOLS = [
  'list_contacts', 'get_contact', 'create_contact', 'update_contact', 'delete_contact',
  'get_contact_stats', 'get_contact_replies', 'get_contact_activity',
  'add_contact_label', 'remove_contact_label', 'list_contact_labels',
  'add_contact_note', 'add_contact_tag', 'remove_contact_tag',
  'batch_create_contacts', 'get_contractor_brief', 'mark_as_customer', 'lookup_homeowner_by_address',
];
const EXPECTED_CAMPAIGN_TOOLS = [
  'list_campaigns', 'get_campaign_analytics', 'enroll_contacts', 'stop_enrollment',
  'get_campaign_enrollments', 'sync_campaigns', 'batch_enroll_contacts',
];
const EXPECTED_OUTREACH_TOOLS = ['send_sms'];
const EXPECTED_TEMPLATE_TOOLS = ['list_templates', 'create_template', 'update_template', 'delete_template'];
const EXPECTED_ROUTING_TOOLS = ['list_routing_rules', 'create_routing_rule', 'update_routing_rule', 'delete_routing_rule'];
const EXPECTED_WORKFLOW_TOOLS = ['create_workflow', 'get_workflow_status', 'cancel_workflow', 'list_workflow_presets', 'run_workflow_preset'];
const EXPECTED_HOMEOWNER_TOOLS = ['list_homeowners', 'delete_homeowner', 'enrich_homeowners', 'enrich_homeowner_contacts', 'list_connections', 'resolve_connections'];
const EXPECTED_SETTINGS_TOOLS = [
  'get_settings', 'update_settings', 'get_metrics', 'get_activity_log',
  'check_system_health', 'trigger_job', 'emergency_stop', 'resume_pipeline',
  'get_job_history', 'toggle_linkedin', 'export_contacts', 'create_ghl_opportunity',
];

const ALL_EXPECTED_TOOLS = [
  ...EXPECTED_PERMIT_TOOLS,
  ...EXPECTED_CONTACT_TOOLS,
  ...EXPECTED_CAMPAIGN_TOOLS,
  ...EXPECTED_OUTREACH_TOOLS,
  ...EXPECTED_TEMPLATE_TOOLS,
  ...EXPECTED_ROUTING_TOOLS,
  ...EXPECTED_WORKFLOW_TOOLS,
  ...EXPECTED_HOMEOWNER_TOOLS,
  ...EXPECTED_SETTINGS_TOOLS,
];

describe('Tool Registry', () => {
  it('should have all 62 tools registered', () => {
    expect(toolDefinitions.length).toBe(62);
  });

  it('should have unique tool names', () => {
    const names = toolDefinitions.map(t => t.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('every definition should have required fields', () => {
    for (const def of toolDefinitions) {
      expect(def.name).toBeTruthy();
      expect(def.description).toBeTruthy();
      expect(def.input_schema).toBeDefined();
    }
  });

  it('should contain all expected tool names', () => {
    const registeredNames = new Set(toolDefinitions.map(t => t.name));
    const missing = ALL_EXPECTED_TOOLS.filter(name => !registeredNames.has(name));
    expect(missing).toEqual([]);
  });

  it('should preserve domain registration order (permit first, settings last)', () => {
    const names = toolDefinitions.map(t => t.name);
    const permitIndex = names.indexOf('search_permits');
    const contactIndex = names.indexOf('list_contacts');
    const campaignIndex = names.indexOf('list_campaigns');
    const settingsIndex = names.indexOf('get_settings');

    expect(permitIndex).toBeLessThan(contactIndex);
    expect(contactIndex).toBeLessThan(campaignIndex);
    expect(campaignIndex).toBeLessThan(settingsIndex);
  });

  it('should return error for unknown tool', async () => {
    const result = await executeTool('nonexistent_tool', {});
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown tool');
  });

  it('backward-compatible import from tools.ts shim should work', async () => {
    // Import from the shim path (what consumers use)
    const shim = await import('../../src/services/chat/tools');
    expect(shim.toolDefinitions).toBeDefined();
    expect(shim.executeTool).toBeDefined();
    expect(shim.toolDefinitions.length).toBe(toolDefinitions.length);
  });
});

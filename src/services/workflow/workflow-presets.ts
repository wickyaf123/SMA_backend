/**
 * Workflow Presets
 * Pre-defined multi-step workflows that can be triggered by natural language hints.
 *
 * Each preset maps to a sequence of tool actions using the WorkflowPlanStep format
 * from workflow.engine.ts. Step outputs are chained via $ref syntax so that
 * downstream steps can consume upstream results automatically.
 *
 * Values injected at execution (e.g. warm-lead IDs) use `{ $runtimeParam: 'name' }`
 * — see WorkflowRuntimeParamRef / WorkflowPlanParamValue in workflow.engine.ts.
 */

import type { WorkflowPlanStep } from './workflow.engine';

// ==================== TYPES ====================

export interface WorkflowPreset {
  id: string;
  name: string;
  description: string;
  /** Phrases that suggest this preset should be invoked */
  triggerHints: string[];
  steps: Array<WorkflowPlanStep & {
    /** Additional metadata for display / planning (not consumed by engine) */
    _meta?: Record<string, any>;
  }>;
}

// ==================== PRESETS ====================

export const WORKFLOW_PRESETS: WorkflowPreset[] = [
  // ----------------------------------------------------------------
  // Preset 1: End of Month Performance Review
  // ----------------------------------------------------------------
  {
    id: 'monthly-review',
    name: 'End of Month Performance Review',
    description:
      'Pulls campaign analytics, system metrics, contact stats, and reply data so Claude can summarize reply rates, open rates, contacts reached, warm leads, enrichment credits used, and cost per warm lead.',
    triggerHints: ["how'd we do", 'monthly review', 'performance', 'end of month'],
    steps: [
      {
        name: 'Get campaign analytics',
        action: 'get_campaign_analytics',
        params: {},
        onFailure: 'skip',
      },
      {
        name: 'Get system metrics',
        action: 'get_metrics',
        params: { days: 30 },
        onFailure: 'skip',
      },
      {
        name: 'Get contact stats',
        action: 'get_contact_stats',
        params: {},
        onFailure: 'skip',
      },
      {
        name: 'Get contact replies',
        action: 'get_contact_replies',
        // No contactId — returns recent replies across all contacts (contactId is optional)
        params: { limit: 20 },
        onFailure: 'skip',
      },
    ],
  },

  // ----------------------------------------------------------------
  // Preset 2: Bad Data Cleanup
  // ----------------------------------------------------------------
  {
    id: 'bad-data-cleanup',
    name: 'Bad Data Cleanup',
    description:
      'Scans contacts for missing emails, invalid phone numbers, duplicates, and 90-day no-engagement records. Shows counts before any destructive action so the user can confirm.',
    triggerHints: ['cleanup', 'bad data', 'duplicates', 'data quality'],
    steps: [
      {
        name: 'Find contacts missing email',
        action: 'list_contacts',
        params: { filter: 'missing_email' },
        onFailure: 'skip',
        _meta: { confirmationGated: true, label: 'Missing email', intent: 'Filter results for contacts with no/empty email address' },
      },
      {
        name: 'Find contacts with invalid phone',
        action: 'list_contacts',
        params: { filter: 'invalid_phone' },
        onFailure: 'skip',
        _meta: { confirmationGated: true, label: 'Invalid phone', intent: 'Filter results for contacts with no phone, empty phone, or invalid phone' },
      },
      {
        name: 'Find duplicate contacts',
        action: 'list_contacts',
        params: { filter: 'duplicates' },
        onFailure: 'skip',
        _meta: { confirmationGated: true, label: 'Duplicates', intent: 'Find contacts sharing the same email address' },
      },
      {
        name: 'Find contacts with no engagement',
        action: 'list_contacts',
        params: { filter: 'no_engagement' },
        onFailure: 'skip',
        _meta: { confirmationGated: true, label: 'No engagement', intent: 'Find contacts enrolled 14+ days with zero replies' },
      },
    ],
  },

  // ----------------------------------------------------------------
  // Preset 3: New Market Test Run
  // ----------------------------------------------------------------
  {
    id: 'new-market-test',
    name: 'New Market Test Run',
    description:
      'Quick feasibility check for a new market: looks up the geo, pulls a small sample of 25 permits (no enrichment), lists resulting contacts, and calculates data fill rates.',
    triggerHints: ['new market', 'test run', 'try a new city', 'sample'],
    steps: [
      {
        name: 'Lookup geo ID',
        action: 'lookup_geo_id',
        params: {
          city: '',
          state: '',
        },
        onFailure: 'abort',
      },
      {
        name: 'Search permits (sample)',
        action: 'search_permits',
        params: {
          geoId: { $ref: 'step_1.output.geoId' },
          city: { $ref: 'step_1.output.city' },
          permitType: '', // Filled by caller via run_workflow_preset param overrides
          maxResults: 25,
        },
        onFailure: 'abort',
      },
      {
        name: 'List contacts from sample',
        action: 'list_contacts',
        params: {
          status: 'NEW',
          city: { $ref: 'step_1.output.city' },
        },
        onFailure: 'skip',
      },
      {
        name: 'Calculate fill rates',
        action: 'get_metrics',
        params: {},
        onFailure: 'skip',
        _meta: {
          summarize: true,
          summaryPrompt:
            'Summarize fill rates for the sample: how many had email, phone, mailing address. Recommend whether this market is worth a full run.',
        },
      },
    ],
  },

  // ----------------------------------------------------------------
  // Preset 4: Warm Lead Fast-Track
  // ----------------------------------------------------------------
  {
    id: 'warm-lead-fast-track',
    name: 'Warm Lead Fast-Track',
    description:
      'Immediately acts on a warm/hot lead: stops any current campaign enrollment, creates a GHL opportunity, sends an SMS with a Calendly booking link, and flags the contact as hot.',
    triggerHints: ['warm lead', 'hot lead', 'fast track', 'book a call'],
    steps: [
      {
        name: 'Stop current enrollment',
        action: 'stop_enrollment',
        params: {
          campaignId: { $runtimeParam: 'campaignId' },
          contactId: { $runtimeParam: 'contactId' },
          reason: 'warm_lead_fast_track',
        },
        onFailure: 'skip', // May not be enrolled; that's fine
      },
      {
        name: 'Create GHL opportunity',
        action: 'create_ghl_opportunity',
        params: {
          contactId: { $runtimeParam: 'contactId' },
          name: 'Warm Lead',
          stageId: '', // Falls back to settings default if empty
        },
        onFailure: 'skip',
      },
      {
        name: 'Send Calendly SMS',
        action: 'send_sms',
        params: {
          contactId: { $runtimeParam: 'contactId' },
          message:
            "Hi {{firstName}}, I'd love to connect! Here's a link to book a quick call: {{calendlyLink}}",
        },
        onFailure: 'retry',
        maxRetries: 2,
      },
      {
        name: 'Tag contact as hot lead',
        action: 'add_contact_tag',
        params: {
          contactId: { $runtimeParam: 'contactId' },
          tag: 'hot-lead',
        },
        onFailure: 'skip',
      },
      {
        name: 'Update contact status',
        action: 'update_contact',
        params: {
          contactId: { $runtimeParam: 'contactId' },
          status: 'REPLIED',
        },
        onFailure: 'skip',
      },
    ],
  },
];

// ==================== HELPERS ====================

/**
 * Look up a preset by its unique ID.
 */
export function getPresetById(id: string): WorkflowPreset | undefined {
  return WORKFLOW_PRESETS.find((p) => p.id === id);
}

/**
 * Find the best-matching preset for a natural-language query.
 * Uses a simple scoring approach: each trigger hint is checked against
 * the query (case-insensitive). The preset with the highest number of
 * matching hints wins. Returns undefined if nothing matches.
 */
export function findPresetByHint(query: string): WorkflowPreset | undefined {
  const normalised = query.toLowerCase().trim();
  if (!normalised) return undefined;

  let bestPreset: WorkflowPreset | undefined;
  let bestScore = 0;

  for (const preset of WORKFLOW_PRESETS) {
    let score = 0;

    for (const hint of preset.triggerHints) {
      const normHint = hint.toLowerCase();

      // Exact substring match in the query is worth 2 points
      if (normalised.includes(normHint)) {
        score += 2;
        continue;
      }

      // Fuzzy: check if every word in the hint appears somewhere in the query
      const hintWords = normHint.split(/\s+/);
      const allWordsMatch = hintWords.every((word) => normalised.includes(word));
      if (allWordsMatch) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestPreset = preset;
    }
  }

  return bestScore > 0 ? bestPreset : undefined;
}

/**
 * Return all available presets.
 */
export function getAllPresets(): WorkflowPreset[] {
  return WORKFLOW_PRESETS;
}

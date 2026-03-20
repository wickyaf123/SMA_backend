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
  // Preset 1: Weekly Prospecting Run
  // ----------------------------------------------------------------
  {
    id: 'weekly-prospecting',
    name: 'Weekly Prospecting Run',
    description:
      'End-to-end weekly lead generation: looks up the target geo, pulls recent permits from the last 7 days, enriches homeowner data, filters to net-new contacts, and surfaces a summary.',
    triggerHints: ['new leads', 'weekly run', 'prospecting', "what's new"],
    steps: [
      {
        name: 'Lookup geo ID',
        action: 'lookup_geo_id',
        params: {
          // The caller supplies city/state; these are filled at runtime
          city: '',
          state: '',
        },
        onFailure: 'abort',
      },
      {
        name: 'Search recent permits',
        action: 'search_permits',
        params: {
          geoId: { $ref: 'step_1.output.geoId' },
          city: { $ref: 'step_1.output.city' },
          permitType: '', // Supplied at runtime (e.g. 'residential', 'solar')
        },
        onFailure: 'abort',
      },
      {
        name: 'Enrich homeowners',
        action: 'enrich_homeowners',
        params: {
          batchSize: 50,
        },
        onFailure: 'skip',
      },
      {
        name: 'List net-new contacts',
        action: 'list_contacts',
        params: {
          status: 'NEW',
          city: { $ref: 'step_1.output.city' },
        },
        onFailure: 'skip',
      },
      {
        name: 'Surface summary',
        action: 'get_metrics',
        params: {
          days: 7,
        },
        onFailure: 'skip',
        _meta: {
          summarize: true,
          summaryPrompt:
            'Summarize the prospecting run: total permits found, homeowners enriched, net-new contacts, and fill rates.',
        },
      },
    ],
  },

  // ----------------------------------------------------------------
  // Preset 2: End of Month Performance Review
  // ----------------------------------------------------------------
  {
    id: 'monthly-review',
    name: 'End of Month Performance Review',
    description:
      'Pulls campaign analytics, system metrics, contact stats, and reply data so Claude can summarize reply rates, open rates, contacts reached, warm leads, Clay credits used, and cost per warm lead.',
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
        params: {},
        onFailure: 'skip',
      },
    ],
  },

  // ----------------------------------------------------------------
  // Preset 3: Bad Data Cleanup
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
        params: { hasEmail: false },
        onFailure: 'skip',
        _meta: { confirmationGated: true, label: 'Missing email', intent: 'Filter results for contacts with no email address' },
      },
      {
        name: 'Find contacts with invalid phone',
        action: 'list_contacts',
        params: { phoneValidationStatus: 'INVALID' },
        onFailure: 'skip',
        _meta: { confirmationGated: true, label: 'Invalid phone', intent: 'Filter results for contacts with invalid phone numbers' },
      },
      {
        name: 'Find contacts with invalid email',
        action: 'list_contacts',
        params: { emailValidationStatus: 'INVALID' },
        onFailure: 'skip',
        _meta: { confirmationGated: true, label: 'Invalid email', intent: 'Identify contacts with invalid email addresses' },
      },
      {
        name: 'Find stale contacts (90-day no engagement)',
        action: 'list_contacts',
        params: {
          status: 'NEW',
        },
        onFailure: 'skip',
        _meta: { confirmationGated: true, label: '90-day no engagement', intent: 'Find contacts with status NEW that have had no engagement in 90+ days' },
      },
    ],
  },

  // ----------------------------------------------------------------
  // Preset 4: New Market Test Run
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
          permitType: '', // Supplied at runtime
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
  // Preset 5: Warm Lead Fast-Track
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

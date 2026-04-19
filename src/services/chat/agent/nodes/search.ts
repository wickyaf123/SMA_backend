import { SystemMessage, AIMessage, HumanMessage } from '@langchain/core/messages';
import { JerryState, type JerryStateType, type JerryStateUpdate, type SearchContext } from '../state';
import { getSearchPrompt } from '../prompts/search';
import { getAgentModel } from '../model';
import { logger } from '../../../../utils/logger';
import { logIssue } from '../../../observability/issue-log.service';

const SEARCH_READY_RE = /SYSTEM_EVENT:(contractor_search_ready|homeowner_search_ready):/;

/**
 * Map wizard city slugs (e.g. "phoenix_az") to "City, ST" format the search
 * tool expects. Falls back to replacing underscores with spaces if unknown.
 */
const CITY_SLUG_MAP: Record<string, string> = {
  scottsdale_az: 'Scottsdale, AZ',
  phoenix_az: 'Phoenix, AZ',
  los_angeles_ca: 'Los Angeles, CA',
  austin_tx: 'Austin, TX',
  miami_fl: 'Miami, FL',
};

function resolveCity(slugOrName: string | undefined): string {
  if (!slugOrName) return '';
  const cleaned = String(slugOrName).trim();
  if (CITY_SLUG_MAP[cleaned]) return CITY_SLUG_MAP[cleaned];
  // If it already looks like "City, ST", pass through.
  if (/,\s*[A-Z]{2}$/i.test(cleaned)) return cleaned;
  // Otherwise de-slug: "phoenix_az" → "Phoenix AZ" (tool will try to parse)
  return cleaned.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Convert wizard dateRange labels ("10-15years", "7-10years", "12months") into
 * a `yearsBack` number for search_permits. Picks the upper bound of aging
 * ranges so we don't miss older permits the user explicitly asked about.
 */
function dateRangeToYearsBack(labels: string[] | undefined): number | undefined {
  if (!labels?.length) return undefined;
  const label = String(labels[0]).toLowerCase();
  // "N-Myears" → take M (upper bound)
  const yearsRange = label.match(/^(\d+)-(\d+)\s*years?/);
  if (yearsRange) return Number(yearsRange[2]);
  // "Nyears"
  const years = label.match(/^(\d+)\s*years?/);
  if (years) return Number(years[1]);
  // Month ranges: 30days, 90days, 6months, 12months → translate to years (~)
  if (/30\s*days?/.test(label)) return 1;
  if (/90\s*days?/.test(label)) return 1;
  if (/6\s*months?/.test(label)) return 1;
  if (/12\s*months?/.test(label)) return 1;
  return undefined;
}

/**
 * Parse a SYSTEM_EVENT:<kind>:<json> payload and produce a synthetic hint
 * the LLM can use to call the right tool with correctly-shaped args. The
 * LLM still does the tool call (so its reasoning can override on edge
 * cases), but it starts with deterministic, tool-schema-compatible values
 * instead of having to translate wizard slugs.
 */
function buildSearchReadyHint(trigger: string): string | null {
  const idx = trigger.indexOf(':', 'SYSTEM_EVENT:'.length);
  if (idx < 0) return null;
  const kind = trigger.substring('SYSTEM_EVENT:'.length, idx);
  const jsonBlob = trigger.substring(idx + 1);
  let payload: Record<string, any>;
  try {
    payload = JSON.parse(jsonBlob);
  } catch {
    return null;
  }

  const city = resolveCity(payload.city);
  const permitTypes: string[] = Array.isArray(payload.permitTypes) ? payload.permitTypes.map(String) : [];
  const yearsBack = dateRangeToYearsBack(payload.dateRanges);
  const maxResults = typeof payload.maxResults === 'number' ? payload.maxResults : 250;

  if (kind === 'contractor_search_ready') {
    const firstType = permitTypes[0] || payload.trade || '';
    return [
      '## DETERMINISTIC SEARCH HINT (from wizard payload)',
      'The user just completed the contractor wizard. Call `search_permits` NOW with the following args.',
      'Do NOT ask any further clarifying questions.',
      '',
      '```json',
      JSON.stringify({
        permitType: firstType,
        city,
        ...(yearsBack ? { yearsBack } : {}),
        maxResults,
      }, null, 2),
      '```',
      permitTypes.length > 1
        ? `If needed, additional permit types to run as follow-ups: ${permitTypes.slice(1).join(', ')}`
        : '',
    ].filter(Boolean).join('\n');
  }

  if (kind === 'homeowner_search_ready') {
    return [
      '## DETERMINISTIC SEARCH HINT (from wizard payload)',
      'The user just completed the homeowner wizard. Call `search_homeowners` NOW with the following args.',
      'Do NOT ask any further clarifying questions.',
      '',
      '```json',
      JSON.stringify({
        trade: payload.trade,
        targetingMode: payload.targetingMode || 'aging',
        permitTypes,
        city,
        ...(payload.geoId ? { geoId: payload.geoId } : {}),
        ...(Array.isArray(payload.dateRanges) && payload.dateRanges.length
          ? { dateRanges: payload.dateRanges }
          : {}),
        ...(payload.propertyValueRange ? { propertyValueRange: payload.propertyValueRange } : {}),
        ...(payload.channels ? { channels: payload.channels } : {}),
        maxResults,
      }, null, 2),
      '```',
    ].filter(Boolean).join('\n');
  }

  return null;
}

export async function searchNode(state: JerryStateType): Promise<JerryStateUpdate> {
  const prompt = getSearchPrompt(state.searchContext ?? null);
  const model = getAgentModel();

  // Detect wizard-committed search and inject a deterministic hint so the
  // LLM doesn't have to translate wizard slugs into tool schema. This is
  // the root cause of "Find Contractors/Homeowners shows no job UI" —
  // the LLM sometimes replied with text instead of a tool call because
  // the translation was non-obvious.
  //
  // IMPORTANT: Only inject the hint / diagnostic if this is the FIRST agent
  // turn after the wizard event — i.e. the SYSTEM_EVENT HumanMessage is the
  // *last* message. On subsequent passes through this node (after tools
  // ran and returned ToolMessages) we must NOT re-inject the hint or the
  // LLM will try to call the tool again. We also must NOT fire the "Jerry
  // did not call a tool" IssueEvent on those subsequent passes (that was
  // the false-positive causing WORKFLOW_UI_MISSING logs even on successful
  // searches).
  const lastMsg = state.messages.at(-1);
  const isFirstTurnAfterEvent = lastMsg instanceof HumanMessage
    && typeof lastMsg.content === 'string'
    && SEARCH_READY_RE.test(lastMsg.content);
  const lastHumanText = isFirstTurnAfterEvent && typeof lastMsg.content === 'string' ? lastMsg.content : '';
  const hint = isFirstTurnAfterEvent ? buildSearchReadyHint(lastHumanText) : null;

  // Anthropic's API only accepts ONE system message at position 0, so we
  // concatenate the wizard hint into the base prompt rather than emit two.
  const finalSystemPrompt = hint ? `${prompt}\n\n${hint}` : prompt;
  const messagesForModel = [new SystemMessage(finalSystemPrompt), ...state.messages];

  const res: AIMessage = await model.invoke(messagesForModel);

  const update: JerryStateUpdate = {
    messages: [res],
    activeFlow:
      state.activeFlow === 'contractor_search' || state.activeFlow === 'homeowner_search'
        ? state.activeFlow
        : 'contractor_search',
  };

  const toolCalls = (res as any).tool_calls as Array<{ name: string; args: any }> | undefined;
  if (toolCalls?.length) {
    const patch: SearchContext = {};
    for (const tc of toolCalls) {
      if (tc.name === 'search_permits' || tc.name === 'search_homeowners') {
        if (tc.args?.permitType) patch.trade = String(tc.args.permitType);
        if (tc.args?.trade) patch.trade = String(tc.args.trade);
        if (tc.args?.city) patch.city = String(tc.args.city);
        if (tc.args?.state) patch.state = String(tc.args.state);
        if (tc.args?.geoId) patch.geoId = String(tc.args.geoId);
        if (typeof tc.args?.maxResults === 'number') patch.maxResults = tc.args.maxResults;
      }
      if (tc.name === 'lookup_geo_id' && tc.args?.city) {
        patch.city = String(tc.args.city);
        if (tc.args?.state) patch.state = String(tc.args.state);
      }
    }
    if (Object.keys(patch).length) update.searchContext = patch;
  } else if (hint) {
    // The LLM produced no tool call despite the deterministic hint — this
    // is the failure mode that leaves the user with no job UI.
    logger.error(
      { conversationId: state.conversationId, preview: lastHumanText.slice(0, 200) },
      'Search node: wizard SYSTEM_EVENT received with deterministic hint but LLM did not call a search tool'
    );
    void logIssue({
      category: 'WORKFLOW_UI_MISSING',
      severity: 'ERROR',
      message: 'Wizard committed a search and deterministic hint was injected, but Jerry did not call search_permits/search_homeowners — no job UI will appear',
      conversationId: state.conversationId ?? null,
      payload: { trigger: lastHumanText.slice(0, 500) },
    });
  }

  return update;
}

export const _state = JerryState; // keep reference alive for tree-shaking sanity

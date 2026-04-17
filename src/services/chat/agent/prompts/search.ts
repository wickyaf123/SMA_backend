import { getJerrySystemPrompt } from '../../system-prompt';
import type { SearchContext } from '../state';

/**
 * Search-flow prompt. Wraps the base Jerry prompt with a preamble that
 * injects the persisted searchContext so Jerry never re-asks for parameters
 * already collected by the wizard or an earlier turn.
 */
export function getSearchPrompt(searchContext: SearchContext | null): string {
  const contextBlock = searchContext && Object.keys(searchContext).length > 0
    ? `\n\n## ACTIVE SEARCH CONTEXT (from persisted state)\nYou have the following search context already collected. DO NOT re-ask for any of these fields — use them directly. Apply user modifications on top of this context rather than starting from scratch.\n\n${formatContext(searchContext)}\n`
    : '';

  const preamble = `## CURRENT FLOW: SEARCH\nYou are handling a contractor or homeowner search turn. Priority behaviors:\n- Remember searchContext between turns. For follow-ups ("try HVAC instead", "try last year"), modify only the field the user changed and execute immediately.\n- For SYSTEM_EVENT:contractor_search_ready / SYSTEM_EVENT:homeowner_search_ready, parse the JSON payload and execute the search without additional questions.\n- For freeform search requests missing parameters, emit [OPEN_WIZARD:contractor] or [OPEN_WIZARD:homeowner] to open the frontend wizard.\n- After job:completed events, present the structured summary stats and offer Q8-Q11 campaign build (unless channels === "data_only").\n${contextBlock}`;

  return `${preamble}\n\n${getJerrySystemPrompt()}`;
}

function formatContext(ctx: SearchContext): string {
  return Object.entries(ctx)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `- ${k}: ${Array.isArray(v) ? JSON.stringify(v) : String(v)}`)
    .join('\n');
}

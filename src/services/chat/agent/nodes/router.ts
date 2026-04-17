import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { JerryState, type JerryStateType, type JerryStateUpdate } from '../state';
import { ROUTER_PROMPT } from '../prompts/router';
import { getRouterModel } from '../model';
import { logger } from '../../../../utils/logger';

/**
 * Protocol-message regexes — handled deterministically without invoking an LLM.
 */
const SYSTEM_EVENT_RE = /^SYSTEM_EVENT:/;
const CONFIRM_RE = /^CONFIRM:/;
const BUTTON_RE = /^BUTTON:/;
const FORM_RE = /^FORM:/;

export async function routerNode(state: JerryStateType): Promise<JerryStateUpdate> {
  const lastMsg = state.messages[state.messages.length - 1];
  const content = typeof lastMsg?.content === 'string' ? lastMsg.content : '';

  // --- Deterministic protocol routing ---
  if (SYSTEM_EVENT_RE.test(content)) {
    // Search-completion / search-ready events flow to the search node; other
    // system events (job_completed for enrollment, workflow_completed) go to
    // the event node which then hands back to the right downstream node.
    if (/contractor_search_ready|homeowner_search_ready/.test(content)) {
      return {
        nextNode: 'search',
        activeFlow: /contractor_search_ready/.test(content)
          ? 'contractor_search'
          : 'homeowner_search',
      };
    }
    return { nextNode: 'event' };
  }

  if (CONFIRM_RE.test(content)) {
    return { nextNode: 'confirm' };
  }

  if (BUTTON_RE.test(content) || FORM_RE.test(content)) {
    // Button/form responses continue the active flow. If we're in a campaign
    // build, stay there; if we're in a search flow, let search handle it;
    // otherwise treat as general.
    if (state.activeFlow === 'campaign_build') return { nextNode: 'campaign' };
    if (state.activeFlow === 'contractor_search' || state.activeFlow === 'homeowner_search') {
      return { nextNode: 'search' };
    }
    return { nextNode: 'general' };
  }

  // --- Sticky-flow heuristic: stay in the active flow unless the user
  //     clearly pivots. The LLM classifier is the tiebreaker. ---
  if (state.activeFlow === 'campaign_build') {
    return { nextNode: 'campaign' };
  }

  // --- LLM classification (haiku, one-token output) ---
  try {
    const res = await getRouterModel().invoke([
      new SystemMessage(ROUTER_PROMPT),
      new HumanMessage(content || '(empty message)'),
    ]);
    const label = String(res.content).trim().toLowerCase();
    if (label.startsWith('search')) return { nextNode: 'search' };
    if (label.startsWith('campaign')) return { nextNode: 'campaign' };
    return { nextNode: 'general' };
  } catch (err) {
    logger.warn({ err }, 'Router LLM classification failed — falling back to general');
    return { nextNode: 'general' };
  }
}

export function routeFromRouter(state: JerryStateType): string {
  return state.nextNode ?? 'general';
}

export const JERRY_STATE = JerryState; // re-export for convenience

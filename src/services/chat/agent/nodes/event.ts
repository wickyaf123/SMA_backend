import { type JerryStateType, type JerryStateUpdate, type SearchContext } from '../state';
import { logger } from '../../../../utils/logger';

/**
 * Handles SYSTEM_EVENT messages (job_completed, workflow_completed, job_failed).
 * Parses the payload, updates state, and flags which downstream node should
 * continue the conversation via `nextNode`.
 */
export async function eventNode(state: JerryStateType): Promise<JerryStateUpdate> {
  const lastMsg = state.messages[state.messages.length - 1];
  const content = typeof lastMsg?.content === 'string' ? lastMsg.content : '';

  // SYSTEM_EVENT:<type>:<payload-json-or-string>
  const colonIdx = content.indexOf(':', 'SYSTEM_EVENT:'.length);
  const eventType = colonIdx === -1
    ? content.substring('SYSTEM_EVENT:'.length)
    : content.substring('SYSTEM_EVENT:'.length, colonIdx);
  const payloadRaw = colonIdx === -1 ? '' : content.substring(colonIdx + 1);

  let payload: any = null;
  try { payload = JSON.parse(payloadRaw); } catch { payload = payloadRaw; }

  logger.info({ eventType, hasPayload: !!payload }, 'LangGraph eventNode handling system event');

  const update: JerryStateUpdate = {};

  switch (eventType) {
    case 'job_completed': {
      // Search job finished — hand off to search node with result stats in
      // searchContext so it can present the summary.
      const patch: SearchContext = {};
      if (payload?.searchId) patch.searchId = String(payload.searchId);
      if (typeof payload?.resultCount === 'number') patch.resultCount = payload.resultCount;
      if (payload?.status) patch.searchStatus = String(payload.status);
      if (Object.keys(patch).length) update.searchContext = patch;
      update.nextNode = 'search';
      break;
    }
    case 'workflow_completed': {
      // Workflow / enrollment completion — route to general so Jerry can
      // summarise the outcome in natural language.
      update.nextNode = 'general';
      break;
    }
    case 'job_failed': {
      if (payload?.searchId || payload?.status) {
        update.searchContext = {
          searchId: payload?.searchId,
          searchStatus: payload?.status ?? 'failed',
        };
      }
      update.nextNode = 'search';
      break;
    }
    default:
      update.nextNode = 'general';
  }

  return update;
}

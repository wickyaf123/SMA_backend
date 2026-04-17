import { SystemMessage, AIMessage } from '@langchain/core/messages';
import { JerryState, type JerryStateType, type JerryStateUpdate, type SearchContext } from '../state';
import { getSearchPrompt } from '../prompts/search';
import { getAgentModel } from '../model';

export async function searchNode(state: JerryStateType): Promise<JerryStateUpdate> {
  const prompt = getSearchPrompt(state.searchContext ?? null);
  const model = getAgentModel();

  const res: AIMessage = await model.invoke([
    new SystemMessage(prompt),
    ...state.messages,
  ]);

  const update: JerryStateUpdate = {
    messages: [res],
    activeFlow:
      state.activeFlow === 'contractor_search' || state.activeFlow === 'homeowner_search'
        ? state.activeFlow
        : 'contractor_search',
  };

  // If this turn kicked off search tools, try to capture searchId / params
  // into searchContext so follow-up turns have them in state (not just in the
  // message log).
  const toolCalls = (res as any).tool_calls as Array<{ name: string; args: any }> | undefined;
  if (toolCalls?.length) {
    const patch: SearchContext = {};
    for (const tc of toolCalls) {
      if (tc.name === 'search_permits' || tc.name === 'search_homeowners') {
        if (tc.args?.permitType) patch.trade = String(tc.args.permitType);
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
  }

  return update;
}

export const _state = JerryState; // keep reference alive for tree-shaking sanity

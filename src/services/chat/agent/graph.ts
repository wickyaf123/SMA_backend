import { END, START, StateGraph } from '@langchain/langgraph';
// tsconfig uses moduleResolution:node which doesn't honour the "exports"
// field, so TS can't resolve the subpath. Node DOES honour exports at
// runtime. We suppress the type error and cast to the known API.
// @ts-expect-error subpath export is runtime-resolved via package.json exports
// eslint-disable-next-line import/no-unresolved
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { AIMessage } from '@langchain/core/messages';
import { JerryState, type JerryStateType } from './state';
import { routerNode, routeFromRouter } from './nodes/router';
import { searchNode } from './nodes/search';
import { campaignNode } from './nodes/campaign';
import { generalNode } from './nodes/general';
import { eventNode } from './nodes/event';
import { confirmNode } from './nodes/confirm';
import { getLangGraphTools } from './tools-adapter';
import { getCheckpointer } from './memory/checkpointer';

/**
 * Track the "caller" node so after ToolNode runs we return to the same agent
 * node (search, campaign, or general) rather than falling into a fixed path.
 */
function agentHasToolCalls(state: JerryStateType): boolean {
  const last = state.messages[state.messages.length - 1];
  if (!last) return false;
  if (!(last instanceof AIMessage)) {
    // LangChain AIMessage duck-typed
    const anyLast = last as any;
    return Array.isArray(anyLast.tool_calls) && anyLast.tool_calls.length > 0;
  }
  return Array.isArray((last as any).tool_calls) && (last as any).tool_calls.length > 0;
}

function routeAfterSearch(state: JerryStateType): string {
  if (state.pendingConfirmation) return 'confirm';
  if (agentHasToolCalls(state)) return 'tools_search';
  return END;
}

function routeAfterCampaign(state: JerryStateType): string {
  if (state.pendingConfirmation) return 'confirm';
  if (agentHasToolCalls(state)) return 'tools_campaign';
  return END;
}

function routeAfterGeneral(state: JerryStateType): string {
  if (state.pendingConfirmation) return 'confirm';
  if (agentHasToolCalls(state)) return 'tools_general';
  return END;
}

function routeAfterEvent(state: JerryStateType): string {
  return state.nextNode ?? 'general';
}

function routeAfterConfirm(_state: JerryStateType): string {
  // After executing (or cancelling) a confirmed action, run general to let
  // Jerry summarise the outcome.
  return 'general';
}

let compiledGraph: any | null = null;

export async function getJerryGraph() {
  if (compiledGraph) return compiledGraph;

  try {
    const checkpointer = await getCheckpointer();
    const tools = getLangGraphTools();

    // Separate ToolNode instances per caller-node lets us return to the right
    // agent node after tool execution (search -> tools_search -> search, etc.).
    const toolNodeSearch = new ToolNode(tools);
    const toolNodeCampaign = new ToolNode(tools);
    const toolNodeGeneral = new ToolNode(tools);

    const builder = new StateGraph(JerryState)
      .addNode('router', routerNode)
      .addNode('search', searchNode)
      .addNode('campaign', campaignNode)
      .addNode('general', generalNode)
      .addNode('event', eventNode)
      .addNode('confirm', confirmNode)
      .addNode('tools_search', toolNodeSearch)
      .addNode('tools_campaign', toolNodeCampaign)
      .addNode('tools_general', toolNodeGeneral)

      .addEdge(START, 'router')
      .addConditionalEdges('router', routeFromRouter, {
        search: 'search',
        campaign: 'campaign',
        general: 'general',
        event: 'event',
        confirm: 'confirm',
        end: END,
      })

      .addConditionalEdges('search', routeAfterSearch, {
        tools_search: 'tools_search',
        confirm: 'confirm',
        [END]: END,
      })
      .addEdge('tools_search', 'search')

      .addConditionalEdges('campaign', routeAfterCampaign, {
        tools_campaign: 'tools_campaign',
        confirm: 'confirm',
        [END]: END,
      })
      .addEdge('tools_campaign', 'campaign')

      .addConditionalEdges('general', routeAfterGeneral, {
        tools_general: 'tools_general',
        confirm: 'confirm',
        [END]: END,
      })
      .addEdge('tools_general', 'general')

      .addConditionalEdges('event', routeAfterEvent, {
        search: 'search',
        campaign: 'campaign',
        general: 'general',
      })

      .addConditionalEdges('confirm', routeAfterConfirm, {
        general: 'general',
      });

    compiledGraph = builder.compile({ checkpointer });
    return compiledGraph;
  } catch (err) {
    // Reset singleton so the next call retries instead of caching the failure
    compiledGraph = null;
    throw err;
  }
}

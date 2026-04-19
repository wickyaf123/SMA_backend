import { tool } from '@langchain/core/tools';
import { toolDefinitions, executeTool } from '../tools/index';
import type { AgentDomain, ToolDefinition } from '../tools/types';
import type { AgentId } from './agents/registry';
import { AGENT_DOMAIN_MAP } from './agents/registry';
import { logger } from '../../../utils/logger';

type BuiltTool = ReturnType<typeof toBoundTool>;

// Tools that emit realtime job events and MUST have conversationId to render
// in the UI. Without conversationId these searches run silently and no job
// card appears — matches the "Find contractors / Find homeowners" bug.
const EVENT_EMITTING_TOOLS = new Set([
  'search_permits',
  'search_homeowners',
  'import_contractors',
  'import_homeowners',
  'enrich_contacts',
  'validate_emails',
]);

function toBoundTool(def: ToolDefinition) {
  return tool(
    async (input: Record<string, any>, runtime: any) => {
      const configurable = runtime?.configurable ?? runtime?.config?.configurable ?? {};
      const conversationId: string | undefined = configurable.conversationId;
      const userId: string | undefined = configurable.userId ?? undefined;

      if (!conversationId && EVENT_EMITTING_TOOLS.has(def.name)) {
        // Without conversationId, the tool's job:* events fire into an
        // empty room and the UI never renders a job card. Surface as an
        // IssueEvent so /admin/issues flags this immediately.
        logger.error(
          { tool: def.name, configurableKeys: Object.keys(configurable) },
          'Event-emitting tool invoked without conversationId — job UI will not render'
        );
        try {
          const { logIssue } = await import('../../../services/observability/issue-log.service');
          void logIssue({
            category: 'WORKFLOW_UI_MISSING',
            severity: 'ERROR',
            message: `Tool "${def.name}" invoked without conversationId — job UI will not render`,
            payload: { tool: def.name, input },
          });
        } catch {
          // don't block tool execution on logging failure
        }
      }

      try {
        const result = await executeTool(def.name, input, {
          conversationId: conversationId ?? '',
          userId,
        });
        return JSON.stringify(result);
      } catch (err: any) {
        logger.error({ err, tool: def.name }, 'LangGraph tool execution failed');
        return JSON.stringify({
          success: false,
          error: err?.message || 'Tool execution failed',
        });
      }
    },
    {
      name: def.name,
      description: def.description,
      schema: def.input_schema as any,
    },
  );
}

export function buildLangGraphTools() {
  return toolDefinitions.map(toBoundTool);
}

let cachedAllTools: BuiltTool[] | null = null;
const cachedByDomain = new Map<AgentDomain, BuiltTool[]>();

export function getLangGraphTools(agentId?: AgentId): BuiltTool[] {
  if (!agentId) {
    if (!cachedAllTools) cachedAllTools = buildLangGraphTools();
    return cachedAllTools;
  }

  const domain = AGENT_DOMAIN_MAP[agentId];
  const existing = cachedByDomain.get(domain);
  if (existing) return existing;

  const slice = toolDefinitions.filter((def) => def.domain === domain).map(toBoundTool);
  cachedByDomain.set(domain, slice);
  return slice;
}

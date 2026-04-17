import { tool } from '@langchain/core/tools';
import { toolDefinitions, executeTool } from '../tools/index';
import type { AgentDomain, ToolDefinition } from '../tools/types';
import type { AgentId } from './agents/registry';
import { AGENT_DOMAIN_MAP } from './agents/registry';
import { logger } from '../../../utils/logger';

type BuiltTool = ReturnType<typeof toBoundTool>;

function toBoundTool(def: ToolDefinition) {
  return tool(
    async (input: Record<string, any>, runtime: any) => {
      const configurable = runtime?.configurable ?? runtime?.config?.configurable ?? {};
      const conversationId: string | undefined = configurable.conversationId;
      const userId: string | undefined = configurable.userId ?? undefined;

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

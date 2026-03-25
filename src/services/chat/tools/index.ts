import { ToolDefinition, ToolResult, ToolContext, ToolRegistry } from './types';
import { validateToolInput } from '../tool-schemas';
import { logger } from '../../../utils/logger';

// Import all domain modules
import { registerTools as registerPermitTools } from './permit';
import { registerTools as registerContactTools } from './contact';
import { registerTools as registerCampaignTools } from './campaign';
import { registerTools as registerOutreachTools } from './outreach';
import { registerTools as registerTemplateTools } from './template';
import { registerTools as registerRoutingTools } from './routing';
import { registerTools as registerWorkflowTools } from './workflow';
import { registerTools as registerHomeownerTools } from './homeowner';
import { registerTools as registerSettingsTools } from './settings';

// Create registry
function createRegistry(): ToolRegistry {
  const definitions: ToolDefinition[] = [];
  const handlers = new Map<string, (input: Record<string, any>, context?: ToolContext) => Promise<ToolResult>>();

  return {
    definitions,
    handlers,
    register(definition: ToolDefinition, handler) {
      definitions.push(definition);
      handlers.set(definition.name, handler);
    },
  };
}

const registry = createRegistry();

// Register all domain tools -- ORDER MATTERS (must match original toolDefinitions array order)
registerPermitTools(registry);
registerContactTools(registry);
registerCampaignTools(registry);
registerOutreachTools(registry);
registerTemplateTools(registry);
registerRoutingTools(registry);
registerWorkflowTools(registry);
registerHomeownerTools(registry);
registerSettingsTools(registry);

// Backward-compatible exports
export const toolDefinitions: ToolDefinition[] = registry.definitions;

export async function executeTool(
  name: string,
  input: Record<string, any>,
  context?: ToolContext
): Promise<ToolResult> {
  logger.info(`Executing tool: ${name}`, { input });

  try {
    const validatedInput = validateToolInput(name, input);
    const handler = registry.handlers.get(name);

    if (!handler) {
      return { success: false, error: `Unknown tool: ${name}` };
    }

    return await handler(validatedInput, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error(`Tool execution failed: ${name}`, { error: message, input });
    return { success: false, error: message };
  }
}

// Re-export types for consumers
export type { ToolDefinition, ToolResult, ToolContext } from './types';

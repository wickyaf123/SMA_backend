import { ToolDefinition, ToolResult, ToolContext, ToolRegistry, ToolErrorCode } from './types';
import { validateToolInput } from '../tool-schemas';
import { logger } from '../../../utils/logger';
import { ValidationError, ExternalServiceError } from '../../../utils/errors';

// Reject-mode (default): return error on validation failures.
// Set TOOL_VALIDATION_MODE=warn to log failures but pass through original input instead.
const WARN_MODE = process.env.TOOL_VALIDATION_MODE === 'warn';

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
    // --- Warn-mode validation gateway ---
    let resolvedInput = input;
    try {
      resolvedInput = validateToolInput(name, input);
    } catch (validationError) {
      const valMessage = validationError instanceof Error ? validationError.message : String(validationError);
      if (WARN_MODE) {
        logger.warn(`Tool input validation failed (warn-mode, passing through original input)`, {
          tool: name,
          input,
          error: valMessage,
        });
        // Pass through original input unchanged
      } else {
        return { success: false, error: `Invalid input -- ${valMessage}`, code: 'VALIDATION' };
      }
    }

    const handler = registry.handlers.get(name);

    if (!handler) {
      return { success: false, error: `Unknown tool: ${name}`, code: 'VALIDATION' as ToolErrorCode };
    }

    return await handler(resolvedInput, context);
  } catch (error) {
    // --- Structured error classification ---
    const message = error instanceof Error ? error.message : 'Unknown error occurred';
    logger.error(`Tool execution failed: ${name}`, { error: message, input });

    let code: ToolErrorCode;

    if (error instanceof ValidationError) {
      code = 'VALIDATION';
    } else if (error instanceof ExternalServiceError) {
      code = 'SERVICE';
    } else if (typeof message === 'string' && /not configured/i.test(message)) {
      code = 'INTEGRATION';
    } else {
      code = 'INTERNAL';
    }

    if (code === 'INTERNAL') {
      return { success: false, error: 'Something went wrong -- the error has been reported', code };
    }

    return { success: false, error: message, code };
  }
}

// Re-export types for consumers
export type { ToolDefinition, ToolResult, ToolContext } from './types';

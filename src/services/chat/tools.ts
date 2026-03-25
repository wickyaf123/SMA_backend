/**
 * Re-export shim for backward compatibility.
 * The tool system has been split into domain modules in ./tools/
 * See: ./tools/index.ts for the registry.
 */
export { executeTool, toolDefinitions } from './tools/index';
export type { ToolDefinition, ToolResult, ToolContext } from './tools/types';

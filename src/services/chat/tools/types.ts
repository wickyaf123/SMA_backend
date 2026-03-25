export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, any>;
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface ToolContext {
  conversationId?: string;
}

export type ToolHandler = (
  input: Record<string, any>,
  context?: ToolContext
) => Promise<ToolResult>;

export interface ToolRegistry {
  definitions: ToolDefinition[];
  handlers: Map<string, ToolHandler>;
  register(definition: ToolDefinition, handler: ToolHandler): void;
}

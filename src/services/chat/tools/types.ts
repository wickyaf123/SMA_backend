export interface ToolDefinition {
  name: string;
  description: string;
  input_schema: Record<string, any>;
}

export type ToolErrorCode = 'VALIDATION' | 'PRECONDITION' | 'SERVICE' | 'INTEGRATION' | 'INTERNAL' | 'QUOTA_EXCEEDED';

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  code?: ToolErrorCode;
}

export interface ToolContext {
  conversationId?: string;
  userId?: string;
  signal?: AbortSignal;
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

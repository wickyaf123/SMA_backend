import { ToolDefinition, ToolHandler, ToolRegistry } from './types';
import { chatHealthService } from '../health.service';

const definition: ToolDefinition = {
  name: 'pipeline_health',
  description:
    'Introspect Jerry\'s own recent operational health. Call this when the user asks "how are you doing", "what\'s broken", "why did that fail", or when you want to self-check before retrying a failing flow. Read-only — returns error rates for tools, node stall rates, router distribution, search→enrollment funnel, and a list of recent failed turns.',
  input_schema: {
    type: 'object',
    properties: {
      windowHours: { type: 'number', description: 'Lookback window in hours (1-720). Default 24.', minimum: 1, maximum: 720 },
      focus: {
        type: 'string',
        enum: ['overview', 'tools', 'nodes', 'router', 'funnel', 'bad_turns', 'feedback'],
        description: 'Which slice of health data to return. Default: overview.',
      },
      toolName: { type: 'string', description: 'When focus=tools, restrict to a single tool name.' },
    },
  },
};

const handler: ToolHandler = async (input, ctx) => {
  const windowHours = typeof input.windowHours === 'number' ? Math.max(1, Math.min(720, Math.floor(input.windowHours))) : 24;
  const focus = (input.focus as string) || 'overview';

  try {
    switch (focus) {
      case 'tools':
        return { success: true, data: await chatHealthService.getToolHealth(windowHours, input.toolName) };
      case 'nodes':
        return { success: true, data: await chatHealthService.getNodeHealth(windowHours) };
      case 'router':
        return { success: true, data: await chatHealthService.getRouterHealth(windowHours) };
      case 'funnel':
        return { success: true, data: await chatHealthService.getFunnel(Math.max(windowHours, 24), ctx?.userId) };
      case 'bad_turns':
        return { success: true, data: await chatHealthService.getRecentBadTurns(10) };
      case 'feedback':
        return { success: true, data: await chatHealthService.getFeedbackBreakdown(Math.max(windowHours, 24)) };
      default:
        return { success: true, data: await chatHealthService.getOverview(windowHours, ctx?.userId) };
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'pipeline_health failed', code: 'INTERNAL' as any };
  }
};

export function registerTools(registry: ToolRegistry): void {
  registry.register({ ...definition, domain: 'system' }, handler);
}

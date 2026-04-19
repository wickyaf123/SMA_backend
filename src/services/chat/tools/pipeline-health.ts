import { ToolDefinition, ToolHandler, ToolRegistry } from './types';
import { chatHealthService } from '../health.service';
import { prisma } from '../../../config/database';
import { shovelsClient } from '../../../integrations/shovels/client';
import { logger } from '../../../utils/logger';

const definition: ToolDefinition = {
  name: 'pipeline_health',
  description:
    'Introspect Jerry\'s own recent operational health. Call this when the user asks "how are you doing", "what\'s broken", "why did that fail", or when you want to self-check before retrying a failing flow. Read-only — returns error rates for tools, node stall rates, router distribution, search→enrollment funnel, recent failed turns, AND external-service health (Shovels quota, Clay webhook freshness, IssueEvent summary).',
  input_schema: {
    type: 'object',
    properties: {
      windowHours: { type: 'number', description: 'Lookback window in hours (1-720). Default 24.', minimum: 1, maximum: 720 },
      focus: {
        type: 'string',
        enum: ['overview', 'tools', 'nodes', 'router', 'funnel', 'bad_turns', 'feedback', 'external'],
        description: 'Which slice of health data to return. Default: overview. "external" reports Shovels quota + Clay webhook freshness + recent IssueEvents.',
      },
      toolName: { type: 'string', description: 'When focus=tools, restrict to a single tool name.' },
    },
  },
};

async function getExternalServiceHealth(windowHours: number) {
  const windowMs = windowHours * 3_600_000;
  const since = new Date(Date.now() - windowMs);

  // Shovels quota — reads from the client's cached quota state.
  let shovels: any = { status: 'unknown', note: 'Quota not checked recently' };
  try {
    const quota = await shovelsClient.checkQuota();
    shovels = {
      status: quota.isOverLimit ? 'critical' : quota.usagePercent >= 80 ? 'warning' : 'healthy',
      creditsUsed: quota.creditsUsed,
      creditLimit: quota.creditLimit,
      usagePercent: quota.usagePercent,
      availableAt: quota.availableAt ?? null,
    };
  } catch (err: any) {
    shovels = { status: 'error', note: err?.message ?? 'quota check failed' };
  }

  // Clay webhook freshness: counts timeouts logged by the stuck-search
  // watchdog vs. successful enrichments in the same window.
  let clay: any = { status: 'unknown' };
  try {
    const timeouts = await prisma.issueEvent.count({
      where: { category: 'CLAY_WEBHOOK_TIMEOUT', createdAt: { gte: since } },
    });
    const recentEnriched = await prisma.contact.count({
      where: {
        clayEnrichedAt: { gte: since },
        clayEnrichmentStatus: 'ENRICHED',
      },
    });
    clay = {
      status: timeouts === 0 ? 'healthy' : timeouts < 3 ? 'warning' : 'degraded',
      timeoutsInWindow: timeouts,
      contactsEnrichedInWindow: recentEnriched,
      note: timeouts > 0
        ? `${timeouts} Clay webhook timeout(s) in the last ${windowHours}h. Check webhook URL + API key config.`
        : 'No recent webhook timeouts — Clay callbacks arriving normally.',
    };
  } catch (err: any) {
    clay = { status: 'error', note: err?.message ?? 'Clay health check failed' };
  }

  // IssueEvent summary — grouped counts so Jerry can see if a specific
  // failure category is spiking (e.g. TOOL_EXECUTION_FAILED for a tool).
  let issues: any = [];
  try {
    const grouped = await prisma.issueEvent.groupBy({
      by: ['category', 'severity'],
      where: { createdAt: { gte: since } },
      _count: { _all: true },
    });
    issues = grouped.map((g) => ({
      category: g.category,
      severity: g.severity,
      count: g._count._all,
    }));
  } catch (err: any) {
    logger.warn({ err }, 'IssueEvent grouping failed in pipeline_health');
  }

  return {
    windowHours,
    shovels,
    clay,
    issuesByCategory: issues,
  };
}

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
      case 'external':
        return { success: true, data: await getExternalServiceHealth(windowHours) };
      default:
        // Overview now includes external health for at-a-glance diagnostics
        const base = await chatHealthService.getOverview(windowHours, ctx?.userId);
        const external = await getExternalServiceHealth(windowHours);
        return { success: true, data: { ...base, external } };
    }
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'pipeline_health failed', code: 'INTERNAL' as any };
  }
};

export function registerTools(registry: ToolRegistry): void {
  registry.register({ ...definition, domain: 'system' }, handler);
}

import * as cron from 'node-cron';
import * as Sentry from '@sentry/node';
import { logger } from '../utils/logger';
import { redis } from '../config/redis';
import { chatHealthService, HEALTH_THRESHOLDS } from '../services/chat/health.service';

const DEDUPE_TTL_SECONDS = 3600; // 1h — one alert per KPI per hour
const SCHEDULE = process.env.CHAT_HEALTH_SWEEPER_CRON ?? '*/5 * * * *';

let task: cron.ScheduledTask | null = null;

interface Breach {
  kpi: string;
  value: number;
  threshold: number;
  severity: 'warn' | 'page';
  context?: Record<string, any>;
}

async function evaluate(): Promise<Breach[]> {
  const [overview, tools, nodes, routerHealth, feedback] = await Promise.all([
    chatHealthService.getOverview(1),
    chatHealthService.getToolHealth(1),
    chatHealthService.getNodeHealth(1),
    chatHealthService.getRouterHealth(1),
    chatHealthService.getFeedbackBreakdown(24),
  ]);

  const breaches: Breach[] = [];

  // Turn-level
  if (overview.errorRate >= HEALTH_THRESHOLDS.TURN_ERROR_RATE_PAGE) {
    breaches.push({ kpi: 'turn_error_rate', value: overview.errorRate, threshold: HEALTH_THRESHOLDS.TURN_ERROR_RATE_PAGE, severity: 'page' });
  } else if (overview.errorRate >= HEALTH_THRESHOLDS.TURN_ERROR_RATE_WARN) {
    breaches.push({ kpi: 'turn_error_rate', value: overview.errorRate, threshold: HEALTH_THRESHOLDS.TURN_ERROR_RATE_WARN, severity: 'warn' });
  }
  if (overview.cancelRate >= HEALTH_THRESHOLDS.CONFIRM_CANCEL_RATE_WARN) {
    breaches.push({ kpi: 'confirm_cancel_rate', value: overview.cancelRate, threshold: HEALTH_THRESHOLDS.CONFIRM_CANCEL_RATE_WARN, severity: 'warn' });
  }
  if (overview.p95Ms >= HEALTH_THRESHOLDS.P95_DURATION_MS_WARN) {
    breaches.push({ kpi: 'p95_duration_ms', value: overview.p95Ms, threshold: HEALTH_THRESHOLDS.P95_DURATION_MS_WARN, severity: 'warn' });
  }

  // Per-tool
  for (const t of tools.tools) {
    if (t.calls < 5) continue; // not enough signal
    if (t.errorRate >= HEALTH_THRESHOLDS.TOOL_ERROR_RATE_PAGE) {
      breaches.push({ kpi: `tool_error_rate:${t.name}`, value: t.errorRate, threshold: HEALTH_THRESHOLDS.TOOL_ERROR_RATE_PAGE, severity: 'page', context: { calls: t.calls } });
    } else if (t.errorRate >= HEALTH_THRESHOLDS.TOOL_ERROR_RATE_WARN) {
      breaches.push({ kpi: `tool_error_rate:${t.name}`, value: t.errorRate, threshold: HEALTH_THRESHOLDS.TOOL_ERROR_RATE_WARN, severity: 'warn', context: { calls: t.calls } });
    }
    if (t.zeroResultRate >= HEALTH_THRESHOLDS.ZERO_RESULT_RATE_WARN && t.name.startsWith('search_')) {
      breaches.push({ kpi: `zero_result_rate:${t.name}`, value: t.zeroResultRate, threshold: HEALTH_THRESHOLDS.ZERO_RESULT_RATE_WARN, severity: 'warn', context: { calls: t.calls } });
    }
  }

  // Per-node
  for (const n of nodes.nodes) {
    if (n.entries < 5) continue;
    if (n.stallRate >= HEALTH_THRESHOLDS.NODE_STALL_RATE_WARN) {
      breaches.push({ kpi: `node_stall_rate:${n.name}`, value: n.stallRate, threshold: HEALTH_THRESHOLDS.NODE_STALL_RATE_WARN, severity: 'warn', context: { entries: n.entries } });
    }
  }

  // Router
  if (routerHealth.suspectedMisrouteRate >= HEALTH_THRESHOLDS.ROUTER_MISROUTE_RATE_WARN) {
    breaches.push({ kpi: 'router_misroute_rate', value: routerHealth.suspectedMisrouteRate, threshold: HEALTH_THRESHOLDS.ROUTER_MISROUTE_RATE_WARN, severity: 'warn' });
  }

  // Feedback (24h window so we have enough samples)
  const totals = feedback.byNode.reduce((acc, n) => { acc.up += n.up; acc.down += n.down; return acc; }, { up: 0, down: 0 });
  const totalCount = totals.up + totals.down;
  if (totalCount >= 10) {
    const downRate = totals.down / totalCount;
    if (downRate >= HEALTH_THRESHOLDS.THUMBS_DOWN_RATE_WARN) {
      breaches.push({ kpi: 'thumbs_down_rate', value: Number(downRate.toFixed(4)), threshold: HEALTH_THRESHOLDS.THUMBS_DOWN_RATE_WARN, severity: 'warn', context: { total: totalCount } });
    }
  }

  return breaches;
}

async function alertOnce(b: Breach): Promise<void> {
  const key = `chat-health:alerted:${b.kpi}`;
  const isNew = await redis.set(key, '1', 'EX', DEDUPE_TTL_SECONDS, 'NX');
  if (!isNew) return; // already alerted within dedupe window

  logger.warn(
    { kpi: b.kpi, value: b.value, threshold: b.threshold, severity: b.severity, context: b.context },
    'chat_health_threshold_breach',
  );

  Sentry.addBreadcrumb({
    category: 'chat-health',
    level: b.severity === 'page' ? 'warning' : 'info',
    message: `chat_health_threshold_breach ${b.kpi}`,
    data: { value: b.value, threshold: b.threshold, ...b.context },
  });

  if (b.severity === 'page') {
    Sentry.captureMessage(`chat_health ${b.kpi} ${b.value} >= ${b.threshold}`, 'warning');
  }
}

async function tick(): Promise<void> {
  try {
    const breaches = await evaluate();
    await Promise.all(breaches.map(alertOnce));
    if (breaches.length === 0) {
      logger.debug('chat-health-sweeper: no breaches');
    }
  } catch (err) {
    logger.error({ err }, 'chat-health-sweeper tick failed');
  }
}

export function startChatHealthSweeper(): void {
  if (process.env.CHAT_HEALTH_SWEEPER === 'off') {
    logger.info('chat-health-sweeper disabled via env');
    return;
  }
  if (task) return;
  task = cron.schedule(SCHEDULE, () => { void tick(); });
  logger.info({ schedule: SCHEDULE }, 'chat-health-sweeper started');
}

export function stopChatHealthSweeper(): void {
  if (task) {
    task.stop();
    task = null;
  }
}

// Export for testing / manual trigger via REPL
export const __chatHealthSweeper = { evaluate, tick };

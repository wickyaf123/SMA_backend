import { prisma } from '../../config/database';
import { Prisma } from '@prisma/client';

export const HEALTH_THRESHOLDS = {
  TOOL_ERROR_RATE_WARN: 0.10,
  TOOL_ERROR_RATE_PAGE: 0.25,
  ZERO_RESULT_RATE_WARN: 0.40,
  TURN_ERROR_RATE_WARN: 0.05,
  TURN_ERROR_RATE_PAGE: 0.15,
  CONFIRM_CANCEL_RATE_WARN: 0.50,
  NODE_STALL_RATE_WARN: 0.30,
  ROUTER_MISROUTE_RATE_WARN: 0.15,
  THUMBS_DOWN_RATE_WARN: 0.10,
  P95_DURATION_MS_WARN: 15_000,
} as const;

function sinceDate(windowHours: number): Date {
  return new Date(Date.now() - windowHours * 3_600_000);
}

function pct(num: number, den: number): number {
  if (!den) return 0;
  return Number((num / den).toFixed(4));
}

export interface OverviewStats {
  windowHours: number;
  turnCount: number;
  errorRate: number;
  interruptRate: number;
  cancelRate: number;
  p50Ms: number;
  p95Ms: number;
  totalTokens: number;
  avgTokensPerTurn: number;
  topFailingTools: Array<{ name: string; errorRate: number; zeroResultRate: number; calls: number }>;
  topStalledNodes: Array<{ name: string; stallRate: number; entries: number }>;
  recentBadTurns: Array<{ turnId: string; summary: string; when: Date }>;
}

class ChatHealthService {
  async getOverview(windowHours = 24, userId?: string): Promise<OverviewStats> {
    const since = sinceDate(windowHours);
    const baseWhere: Prisma.ChatTurnWhereInput = {
      startedAt: { gte: since },
      ...(userId ? { userId } : {}),
    };

    const [turnCount, errored, interrupted, cancelled, tokenAgg, durations] = await Promise.all([
      prisma.chatTurn.count({ where: baseWhere }),
      prisma.chatTurn.count({ where: { ...baseWhere, status: 'ERRORED' } }),
      prisma.chatTurn.count({ where: { ...baseWhere, status: 'INTERRUPTED' } }),
      prisma.chatTurn.count({ where: { ...baseWhere, status: 'CANCELLED' } }),
      prisma.chatTurn.aggregate({ where: baseWhere, _sum: { totalTokens: true }, _avg: { totalTokens: true } }),
      prisma.$queryRaw<{ p50: number | null; p95: number | null }[]>`
        SELECT
          COALESCE(percentile_disc(0.5) WITHIN GROUP (ORDER BY "durationMs"), 0)::int AS p50,
          COALESCE(percentile_disc(0.95) WITHIN GROUP (ORDER BY "durationMs"), 0)::int AS p95
        FROM "ChatTurn"
        WHERE "startedAt" >= ${since} AND "durationMs" IS NOT NULL
        ${userId ? Prisma.sql`AND "userId" = ${userId}` : Prisma.empty}
      `,
    ]);

    const [topTools, topNodes, badTurns] = await Promise.all([
      this.getToolHealth(windowHours),
      this.getNodeHealth(windowHours),
      this.getRecentBadTurns(5),
    ]);

    return {
      windowHours,
      turnCount,
      errorRate: pct(errored, turnCount),
      interruptRate: pct(interrupted, turnCount),
      cancelRate: pct(cancelled, turnCount),
      p50Ms: durations[0]?.p50 ?? 0,
      p95Ms: durations[0]?.p95 ?? 0,
      totalTokens: tokenAgg._sum.totalTokens ?? 0,
      avgTokensPerTurn: Math.round(tokenAgg._avg.totalTokens ?? 0),
      topFailingTools: topTools.tools
        .filter((t) => t.errorRate > 0 || t.zeroResultRate > 0.2)
        .slice(0, 5)
        .map((t) => ({ name: t.name, errorRate: t.errorRate, zeroResultRate: t.zeroResultRate, calls: t.calls })),
      topStalledNodes: topNodes.nodes
        .filter((n) => n.stallRate > 0)
        .slice(0, 5)
        .map((n) => ({ name: n.name, stallRate: n.stallRate, entries: n.entries })),
      recentBadTurns: badTurns.turns.map((t) => ({
        turnId: t.id,
        summary: t.summary,
        when: t.startedAt,
      })),
    };
  }

  async getToolHealth(windowHours = 24, toolName?: string) {
    const since = sinceDate(windowHours);
    const rows = await prisma.$queryRaw<Array<{
      name: string; calls: bigint; errors: bigint; validations: bigint; zeros: bigint;
      p50: number | null; p95: number | null;
    }>>`
      SELECT
        "toolName" AS name,
        COUNT(*)::bigint AS calls,
        COUNT(*) FILTER (WHERE status IN ('SERVICE_ERROR','INTEGRATION_ERROR','INTERNAL_ERROR','PRECONDITION_ERROR'))::bigint AS errors,
        COUNT(*) FILTER (WHERE status = 'VALIDATION_ERROR')::bigint AS validations,
        COUNT(*) FILTER (WHERE status = 'ZERO_RESULTS')::bigint AS zeros,
        percentile_disc(0.5) WITHIN GROUP (ORDER BY "durationMs")::int AS p50,
        percentile_disc(0.95) WITHIN GROUP (ORDER BY "durationMs")::int AS p95
      FROM "ToolExecution"
      WHERE "startedAt" >= ${since}
      ${toolName ? Prisma.sql`AND "toolName" = ${toolName}` : Prisma.empty}
      GROUP BY "toolName"
      ORDER BY calls DESC
    `;
    return {
      windowHours,
      tools: rows.map((r) => {
        const calls = Number(r.calls);
        const errors = Number(r.errors);
        const validations = Number(r.validations);
        const zeros = Number(r.zeros);
        return {
          name: r.name,
          calls,
          errorRate: pct(errors, calls),
          validationRate: pct(validations, calls),
          zeroResultRate: pct(zeros, calls),
          p50Ms: r.p50 ?? 0,
          p95Ms: r.p95 ?? 0,
        };
      }),
    };
  }

  async getNodeHealth(windowHours = 24) {
    const since = sinceDate(windowHours);
    const rows = await prisma.$queryRaw<Array<{ name: string; entries: bigint; exits: bigint; stalls: bigint; avg_ms: number | null }>>`
      WITH visits AS (
        SELECT
          unnest("nodePath") AS name,
          "durationMs",
          status,
          "exitNode"
        FROM "ChatTurn"
        WHERE "startedAt" >= ${since}
      )
      SELECT
        name,
        COUNT(*)::bigint AS entries,
        COUNT(*)::bigint AS exits,
        COUNT(*) FILTER (WHERE status = 'INTERRUPTED' AND "exitNode" = name)::bigint AS stalls,
        AVG("durationMs")::int AS avg_ms
      FROM visits
      GROUP BY name
      ORDER BY entries DESC
    `;
    return {
      windowHours,
      nodes: rows.map((r) => {
        const entries = Number(r.entries);
        const stalls = Number(r.stalls);
        return {
          name: r.name,
          entries,
          exits: Number(r.exits),
          stallRate: pct(stalls, entries),
          avgDurationMs: r.avg_ms ?? 0,
        };
      }),
    };
  }

  async getRouterHealth(windowHours = 24) {
    const since = sinceDate(windowHours);
    const [distribution, misroutes] = await Promise.all([
      prisma.chatTurn.groupBy({
        by: ['routerLabel'],
        where: { startedAt: { gte: since } },
        _count: { _all: true },
      }),
      prisma.$queryRaw<{ total: bigint; misrouted: bigint }[]>`
        SELECT
          COUNT(*)::bigint AS total,
          COUNT(*) FILTER (
            WHERE EXISTS (
              SELECT 1 FROM "ToolExecution" te
              WHERE te."turnId" = t.id AND te."toolName" LIKE 'search_%'
            )
          )::bigint AS misrouted
        FROM "ChatTurn" t
        WHERE "startedAt" >= ${since} AND "routerLabel" = 'general'
      `,
    ]);

    const distObj: Record<string, number> = {};
    for (const d of distribution) {
      distObj[d.routerLabel ?? 'unknown'] = d._count._all;
    }

    const total = Number(misroutes[0]?.total ?? 0);
    const mis = Number(misroutes[0]?.misrouted ?? 0);

    return {
      windowHours,
      distribution: distObj,
      suspectedMisrouteRate: pct(mis, total),
    };
  }

  async getFunnel(windowHours = 168, userId?: string) {
    const since = sinceDate(windowHours);
    const convFilter = userId ? Prisma.sql`AND t."userId" = ${userId}` : Prisma.empty;

    const rows = await prisma.$queryRaw<{
      searches_started: bigint; searches_succeeded: bigint; enrolments_done: bigint;
    }[]>`
      WITH conv_search AS (
        SELECT DISTINCT t."conversationId"
        FROM "ChatTurn" t JOIN "ToolExecution" te ON te."turnId" = t.id
        WHERE t."startedAt" >= ${since}
          AND te."toolName" IN ('search_permits', 'search_homeowners')
          ${convFilter}
      ),
      conv_success AS (
        SELECT DISTINCT t."conversationId"
        FROM "ChatTurn" t JOIN "ToolExecution" te ON te."turnId" = t.id
        WHERE t."startedAt" >= ${since}
          AND te."toolName" IN ('search_permits', 'search_homeowners')
          AND te.status = 'SUCCESS'
          ${convFilter}
      ),
      conv_enrol AS (
        SELECT DISTINCT t."conversationId"
        FROM "ChatTurn" t JOIN "ToolExecution" te ON te."turnId" = t.id
        WHERE t."startedAt" >= ${since}
          AND te."toolName" = 'enroll_contacts'
          AND te.status = 'SUCCESS'
          ${convFilter}
      )
      SELECT
        (SELECT COUNT(*) FROM conv_search)::bigint AS searches_started,
        (SELECT COUNT(*) FROM conv_success)::bigint AS searches_succeeded,
        (SELECT COUNT(*) FROM conv_enrol)::bigint AS enrolments_done
    `;

    const searchStarted = Number(rows[0]?.searches_started ?? 0);
    const searchCompleted = Number(rows[0]?.searches_succeeded ?? 0);
    const enrolmentDone = Number(rows[0]?.enrolments_done ?? 0);

    return {
      windowHours,
      searchStarted,
      searchCompleted,
      enrolmentDone,
      replyObserved: null, // hook point — join Reply ← Campaign once campaignId capture is stable
      rates: {
        completeGivenStarted: pct(searchCompleted, searchStarted),
        enrolGivenCompleted: pct(enrolmentDone, searchCompleted),
      },
    };
  }

  async getRecentBadTurns(limit = 20) {
    const rows = await prisma.chatTurn.findMany({
      where: {
        OR: [
          { status: 'ERRORED' },
          { status: 'CANCELLED' },
          { feedback: { some: { rating: 'down' } } },
        ],
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
      select: {
        id: true, conversationId: true, startedAt: true, status: true,
        exitNode: true, errorMessage: true, interruptReason: true,
        confirmDecision: true, routerLabel: true,
        toolExecutions: {
          select: { toolName: true, status: true, errorMessage: true, resultCount: true },
          orderBy: { startedAt: 'desc' }, take: 3,
        },
      },
    });
    return {
      turns: rows.map((t) => ({
        id: t.id,
        conversationId: t.conversationId,
        startedAt: t.startedAt,
        status: t.status,
        exitNode: t.exitNode,
        summary: summariseBadTurn(t),
      })),
    };
  }

  async getTurnTrace(turnId: string) {
    const turn = await prisma.chatTurn.findUnique({
      where: { id: turnId },
      include: {
        events: { orderBy: { seq: 'asc' } },
        toolExecutions: { orderBy: { startedAt: 'asc' } },
      },
    });
    if (!turn) return null;
    const messages = await prisma.message.findMany({
      where: { turnId },
      orderBy: { createdAt: 'asc' },
    });
    return { turn, events: turn.events, toolExecutions: turn.toolExecutions, messages };
  }

  async getFeedbackBreakdown(windowHours = 168) {
    const since = sinceDate(windowHours);
    const [byNode, byTool] = await Promise.all([
      prisma.$queryRaw<Array<{ node: string | null; up: bigint; down: bigint }>>`
        SELECT "nodeLabel" AS node,
          COUNT(*) FILTER (WHERE rating = 'up')::bigint AS up,
          COUNT(*) FILTER (WHERE rating = 'down')::bigint AS down
        FROM "MessageFeedback"
        WHERE "createdAt" >= ${since}
        GROUP BY "nodeLabel"
        ORDER BY down DESC
      `,
      prisma.$queryRaw<Array<{ tool: string; up: bigint; down: bigint }>>`
        SELECT tool,
          COUNT(*) FILTER (WHERE rating = 'up')::bigint AS up,
          COUNT(*) FILTER (WHERE rating = 'down')::bigint AS down
        FROM (
          SELECT unnest("toolNames") AS tool, rating
          FROM "MessageFeedback"
          WHERE "createdAt" >= ${since}
        ) t
        GROUP BY tool
        ORDER BY down DESC
      `,
    ]);
    return {
      windowHours,
      byNode: byNode.map((r) => ({ node: r.node, up: Number(r.up), down: Number(r.down) })),
      byTool: byTool.map((r) => ({ tool: r.tool, up: Number(r.up), down: Number(r.down) })),
    };
  }
}

function summariseBadTurn(t: {
  status: string; exitNode: string | null; errorMessage: string | null;
  interruptReason: string | null; confirmDecision: string | null;
  toolExecutions: Array<{ toolName: string; status: string; errorMessage: string | null; resultCount: number | null }>;
}): string {
  if (t.status === 'ERRORED') return `ERRORED at ${t.exitNode ?? 'unknown'}: ${t.errorMessage ?? 'unknown error'}`;
  if (t.status === 'CANCELLED') return `User cancelled ${t.interruptReason ?? 'pending action'}`;
  const lastTool = t.toolExecutions[0];
  if (lastTool) {
    if (lastTool.status === 'ZERO_RESULTS') return `${lastTool.toolName} returned 0 results`;
    if (lastTool.errorMessage) return `${lastTool.toolName} failed: ${lastTool.errorMessage}`;
  }
  return `Feedback 👎 on ${t.exitNode ?? 'general'}`;
}

export const chatHealthService = new ChatHealthService();

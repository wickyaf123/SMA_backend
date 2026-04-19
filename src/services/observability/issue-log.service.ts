import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import type { IssueCategory, IssueSeverity } from '@prisma/client';

export interface LogIssueInput {
  category: IssueCategory;
  message: string;
  severity?: IssueSeverity;
  conversationId?: string | null;
  turnId?: string | null;
  workflowId?: string | null;
  jobId?: string | null;
  payload?: Record<string, unknown> | null;
}

export async function logIssue(input: LogIssueInput): Promise<void> {
  try {
    await prisma.issueEvent.create({
      data: {
        category: input.category,
        severity: input.severity ?? 'WARN',
        message: input.message,
        conversationId: input.conversationId ?? null,
        turnId: input.turnId ?? null,
        workflowId: input.workflowId ?? null,
        jobId: input.jobId ?? null,
        payload: (input.payload as any) ?? undefined,
      },
    });
    logger.warn(
      {
        issueCategory: input.category,
        severity: input.severity ?? 'WARN',
        conversationId: input.conversationId,
        workflowId: input.workflowId,
        jobId: input.jobId,
        payload: input.payload,
      },
      `[issue] ${input.message}`
    );
  } catch (err) {
    logger.error({ err, input }, 'Failed to persist IssueEvent');
  }
}

export interface QueryIssuesInput {
  sinceMs?: number;
  category?: IssueCategory;
  conversationId?: string;
  limit?: number;
}

export async function queryIssues(input: QueryIssuesInput = {}) {
  const since = input.sinceMs ? new Date(Date.now() - input.sinceMs) : undefined;
  return prisma.issueEvent.findMany({
    where: {
      ...(since ? { createdAt: { gte: since } } : {}),
      ...(input.category ? { category: input.category } : {}),
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: Math.min(input.limit ?? 100, 500),
  });
}

const DURATION_RE = /^(\d+)(ms|s|m|h|d)$/i;
export function parseDuration(input: string | undefined): number | undefined {
  if (!input) return undefined;
  const match = DURATION_RE.exec(input.trim());
  if (!match) return undefined;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  const mult: Record<string, number> = { ms: 1, s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return value * (mult[unit] ?? 0);
}

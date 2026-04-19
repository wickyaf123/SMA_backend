import { Router, Request, Response } from 'express';
import type { IssueCategory } from '@prisma/client';
import { queryIssues, parseDuration } from '../services/observability/issue-log.service';
import { logger } from '../utils/logger';

const router = Router();

function requireAdmin(req: Request, res: Response): boolean {
  const provided = req.header('x-admin-api-key');
  const expected = process.env.ADMIN_API_KEY;
  if (!expected) {
    res.status(503).json({ error: 'ADMIN_API_KEY not configured on server' });
    return false;
  }
  if (!provided || provided !== expected) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

const VALID_CATEGORIES: Array<IssueCategory> = [
  'WORKFLOW_UI_MISSING',
  'SILENT_EMPTY_RESULT',
  'STATE_RACE_DETECTED',
  'SOCKET_EVENT_DROPPED',
  'PIPELINE_TIER_EXHAUSTED',
  'RELEVANCE_FILTER_ALL_REJECTED',
  'HOMEOWNER_FALLBACK_FAILED',
  'WORKFLOW_MISSING_CONVERSATION_ID',
];

router.get('/issues', async (req: Request, res: Response) => {
  if (!requireAdmin(req, res)) return;
  try {
    const since = parseDuration(req.query.since as string | undefined) ?? 24 * 60 * 60 * 1000;
    const categoryParam = (req.query.category as string | undefined)?.toUpperCase();
    const category = categoryParam && VALID_CATEGORIES.includes(categoryParam as IssueCategory)
      ? (categoryParam as IssueCategory)
      : undefined;
    const conversationId = (req.query.conversationId as string | undefined) || undefined;
    const limit = req.query.limit ? Number(req.query.limit) : undefined;

    const issues = await queryIssues({ sinceMs: since, category, conversationId, limit });
    res.json({ count: issues.length, sinceMs: since, category: category ?? null, issues });
  } catch (err) {
    logger.error({ err }, 'GET /admin/issues failed');
    res.status(500).json({ error: 'Failed to query issues' });
  }
});

export default router;

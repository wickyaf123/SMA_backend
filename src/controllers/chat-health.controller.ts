import type { Request, Response } from 'express';
import { chatHealthService } from '../services/chat/health.service';
import { logger } from '../utils/logger';

function parseWindow(req: Request, fallback = 24): number {
  const raw = Number(req.query.windowHours ?? fallback);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(24 * 30, Math.max(1, Math.floor(raw)));
}

function parseLimit(req: Request, fallback = 20, max = 200): number {
  const raw = Number(req.query.limit ?? fallback);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.min(max, Math.floor(raw));
}

export class ChatHealthController {
  async overview(req: Request, res: Response) {
    try {
      const windowHours = parseWindow(req);
      const userId = (req.query.userId as string) || undefined;
      const data = await chatHealthService.getOverview(windowHours, userId);
      res.json(data);
    } catch (err: any) {
      logger.error({ err }, 'chat health overview failed');
      res.status(500).json({ error: err?.message ?? 'overview failed' });
    }
  }

  async tools(req: Request, res: Response) {
    try {
      const windowHours = parseWindow(req);
      const toolName = (req.query.tool as string) || undefined;
      res.json(await chatHealthService.getToolHealth(windowHours, toolName));
    } catch (err: any) {
      logger.error({ err }, 'chat health tools failed');
      res.status(500).json({ error: err?.message ?? 'tools failed' });
    }
  }

  async nodes(req: Request, res: Response) {
    try {
      res.json(await chatHealthService.getNodeHealth(parseWindow(req)));
    } catch (err: any) {
      logger.error({ err }, 'chat health nodes failed');
      res.status(500).json({ error: err?.message ?? 'nodes failed' });
    }
  }

  async router(req: Request, res: Response) {
    try {
      res.json(await chatHealthService.getRouterHealth(parseWindow(req)));
    } catch (err: any) {
      logger.error({ err }, 'chat health router failed');
      res.status(500).json({ error: err?.message ?? 'router failed' });
    }
  }

  async funnel(req: Request, res: Response) {
    try {
      const userId = (req.query.userId as string) || undefined;
      res.json(await chatHealthService.getFunnel(parseWindow(req, 168), userId));
    } catch (err: any) {
      logger.error({ err }, 'chat health funnel failed');
      res.status(500).json({ error: err?.message ?? 'funnel failed' });
    }
  }

  async badTurns(req: Request, res: Response) {
    try {
      res.json(await chatHealthService.getRecentBadTurns(parseLimit(req)));
    } catch (err: any) {
      logger.error({ err }, 'chat health bad-turns failed');
      res.status(500).json({ error: err?.message ?? 'bad-turns failed' });
    }
  }

  async turnTrace(req: Request, res: Response) {
    try {
      const trace = await chatHealthService.getTurnTrace(req.params.id);
      if (!trace) return res.status(404).json({ error: 'turn not found' });
      res.json(trace);
    } catch (err: any) {
      logger.error({ err }, 'chat health turn trace failed');
      res.status(500).json({ error: err?.message ?? 'turn trace failed' });
    }
  }

  async feedbackBreakdown(req: Request, res: Response) {
    try {
      res.json(await chatHealthService.getFeedbackBreakdown(parseWindow(req, 168)));
    } catch (err: any) {
      logger.error({ err }, 'chat health feedback breakdown failed');
      res.status(500).json({ error: err?.message ?? 'feedback breakdown failed' });
    }
  }
}

export const chatHealthController = new ChatHealthController();

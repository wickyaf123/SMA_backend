import { Request, Response, NextFunction } from 'express';
import { permitPipelineService } from '../services/permit/permit-pipeline.service';
import { prisma } from '../config/database';
import { shovelsClient } from '../integrations/shovels/client';
import { logger } from '../utils/logger';

export class PermitController {
  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { permitType, city, geoId, startDate, endDate } = req.body;

      if (!permitType || !city || !geoId || !startDate || !endDate) {
        res.status(400).json({
          success: false,
          error: 'Missing required fields: permitType, city, geoId, startDate, endDate',
        });
        return;
      }

      const searchId = await permitPipelineService.startSearch({
        permitType, city, geoId, startDate, endDate,
      });

      res.status(202).json({
        success: true,
        data: { searchId, status: 'SEARCHING' },
      });
    } catch (error) {
      next(error);
    }
  }

  async getSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = await prisma.permitSearch.findUnique({
        where: { id: req.params.id },
      });
      if (!search) {
        res.status(404).json({ success: false, error: 'Search not found' });
        return;
      }
      res.json({ success: true, data: search });
    } catch (error) {
      next(error);
    }
  }

  async listSearches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const searches = await prisma.permitSearch.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      res.json({ success: true, data: searches });
    } catch (error) {
      next(error);
    }
  }

  async getLatestSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = await prisma.permitSearch.findFirst({
        orderBy: { createdAt: 'desc' },
      });
      res.json({ success: true, data: search });
    } catch (error) {
      next(error);
    }
  }

  async route(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { routeMode } = req.body;

      const { permitRoutingService } = await import('../services/permit/routing.service');
      const result = await permitRoutingService.routeSearch(id, routeMode);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async approve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await permitPipelineService.approveAndRoute(id);
      res.json({ success: true, data: result });
    } catch (error) {
      next(error);
    }
  }

  async status(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const connected = await shovelsClient.checkHealth();
      res.json({ success: true, data: { status: 'ok', shovels_connected: connected } });
    } catch (error) {
      next(error);
    }
  }
}

export const permitController = new PermitController();

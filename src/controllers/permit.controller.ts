import { Request, Response, NextFunction } from 'express';
import { permitPipelineService } from '../services/permit/permit-pipeline.service';
import { prisma } from '../config/database';
import { shovelsClient } from '../integrations/shovels/client';
import { logger } from '../utils/logger';
import { sendSuccess, sendError } from '../utils/response';

export class PermitController {
  async search(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { permitType, city, geoId, startDate, endDate } = req.body;
      const userId = req.user?.userId;

      if (!permitType || !city || !geoId || !startDate || !endDate) {
        sendError(res, 400, 'Missing required fields: permitType, city, geoId, startDate, endDate', 'VALIDATION_ERROR');
        return;
      }

      const searchId = await permitPipelineService.startSearch({
        permitType, city, geoId, startDate, endDate, userId,
      });

      sendSuccess(res, { searchId, status: 'SEARCHING' }, 202);
    } catch (error) {
      next(error);
    }
  }

  async getSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const search = await prisma.permitSearch.findUnique({
        where: { id: req.params.id },
      });
      if (!search || (userId && search.userId && search.userId !== userId)) {
        sendError(res, 404, 'Search not found');
        return;
      }
      sendSuccess(res, search);
    } catch (error) {
      next(error);
    }
  }

  async listSearches(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const where: any = {};
      if (userId) where.userId = userId;

      const searches = await prisma.permitSearch.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 50,
      });
      sendSuccess(res, searches);
    } catch (error) {
      next(error);
    }
  }

  async getLatestSearch(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      const where: any = {};
      if (userId) where.userId = userId;

      const search = await prisma.permitSearch.findFirst({
        where,
        orderBy: { createdAt: 'desc' },
      });
      sendSuccess(res, search);
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
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  async approve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const result = await permitPipelineService.approveAndRoute(id);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  async status(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const connected = await shovelsClient.checkHealth();
      sendSuccess(res, { status: 'ok', shovels_connected: connected });
    } catch (error) {
      next(error);
    }
  }
}

export const permitController = new PermitController();

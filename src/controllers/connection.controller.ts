import { Request, Response, NextFunction } from 'express';
import { connectionService } from '../services/connection/connection.service';
import { sendSuccess } from '../utils/response';
import { logger } from '../utils/logger';

export class ConnectionController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        search,
        permitType,
        city,
        state,
        page = '1',
        limit = '25',
        sort = 'createdAt',
        order = 'desc',
      } = req.query;

      const result = await connectionService.list({
        search: search as string | undefined,
        permitType: permitType as string | undefined,
        city: city as string | undefined,
        state: state as string | undefined,
        page: parseInt(page as string, 10),
        limit: parseInt(limit as string, 10),
        sort: sort as string,
        order: order as 'asc' | 'desc',
      });

      sendSuccess(res, result.data, 200, {
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const connection = await connectionService.get(req.params.id);

      if (!connection) {
        res.status(404).json({ success: false, error: 'Connection not found' });
        return;
      }

      sendSuccess(res, connection);
    } catch (error) {
      next(error);
    }
  }

  async stats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await connectionService.stats();
      sendSuccess(res, stats);
    } catch (error) {
      next(error);
    }
  }

  async resolve(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const batchSize = parseInt(req.body.batchSize || '50', 10);
      logger.info({ batchSize }, 'Manually triggering connection resolution');
      const result = await connectionService.resolveConnections(batchSize);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  async getByContact(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const connections = await connectionService.getByContactId(req.params.contactId);
      sendSuccess(res, connections);
    } catch (error) {
      next(error);
    }
  }

  async getByHomeowner(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const connections = await connectionService.getByHomeownerId(req.params.homeownerId);
      sendSuccess(res, connections);
    } catch (error) {
      next(error);
    }
  }
}

export const connectionController = new ConnectionController();

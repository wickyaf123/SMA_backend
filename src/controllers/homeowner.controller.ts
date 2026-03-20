import { Request, Response, NextFunction } from 'express';
import { prisma } from '../config/database';
import { sendSuccess } from '../utils/response';
import { logger } from '../utils/logger';
import { realieEnrichmentService } from '../services/enrichment/realie.service';
import { shovelsHomeownerEnrichmentService } from '../services/enrichment/shovels-homeowner.service';

export class HomeownerController {
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        search,
        status,
        city,
        state,
        geoId,
        realieEnriched,
        page = '1',
        limit = '25',
        sort = 'createdAt',
        order = 'desc',
      } = req.query;

      const pageNum = Math.max(1, parseInt(page as string, 10));
      const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
      const skip = (pageNum - 1) * limitNum;

      const where: any = {};

      if (search) {
        const s = search as string;
        where.OR = [
          { firstName: { contains: s, mode: 'insensitive' } },
          { lastName: { contains: s, mode: 'insensitive' } },
          { fullName: { contains: s, mode: 'insensitive' } },
          { email: { contains: s, mode: 'insensitive' } },
          { street: { contains: s, mode: 'insensitive' } },
          { city: { contains: s, mode: 'insensitive' } },
        ];
      }

      if (status) where.status = status;
      if (city) where.city = { contains: city as string, mode: 'insensitive' };
      if (state) where.state = state;
      if (geoId) where.geoId = geoId;
      if (realieEnriched !== undefined) where.realieEnriched = realieEnriched === 'true';

      const orderBy: any = {};
      const sortField = sort as string;
      orderBy[sortField] = order as string;

      const [data, total] = await Promise.all([
        prisma.homeowner.findMany({
          where,
          orderBy,
          skip,
          take: limitNum,
        }),
        prisma.homeowner.count({ where }),
      ]);

      sendSuccess(res, data, 200, {
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          totalPages: Math.ceil(total / limitNum),
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async get(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const homeowner = await prisma.homeowner.findUnique({
        where: { id: req.params.id },
      });

      if (!homeowner) {
        res.status(404).json({ success: false, error: 'Homeowner not found' });
        return;
      }

      sendSuccess(res, homeowner);
    } catch (error) {
      next(error);
    }
  }

  async stats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const [total, enriched, withEmail, withPhone, byState, byCity] = await Promise.all([
        prisma.homeowner.count(),
        prisma.homeowner.count({ where: { realieEnriched: true } }),
        prisma.homeowner.count({ where: { email: { not: null } } }),
        prisma.homeowner.count({ where: { phone: { not: null } } }),
        prisma.homeowner.groupBy({ by: ['state'], _count: true, orderBy: { _count: { state: 'desc' } }, take: 10 }),
        prisma.homeowner.groupBy({ by: ['city'], _count: true, orderBy: { _count: { city: 'desc' } }, take: 10 }),
      ]);

      sendSuccess(res, {
        total,
        enriched,
        withEmail,
        withPhone,
        byState: byState.reduce((acc: any, s: any) => { if (s.state) acc[s.state] = s._count; return acc; }, {}),
        byCity: byCity.reduce((acc: any, c: any) => { if (c.city) acc[c.city] = c._count; return acc; }, {}),
      });
    } catch (error) {
      next(error);
    }
  }

  async triggerRealieEnrich(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const batchSize = parseInt(req.body.batchSize || '50', 10);
      logger.info({ batchSize }, 'Manually triggering Realie enrichment');
      const result = await realieEnrichmentService.enrichPendingHomeowners(batchSize);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  async triggerShovelsEnrich(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const batchSize = parseInt(req.body.batchSize || '50', 10);
      logger.info({ batchSize }, 'Manually triggering Shovels contact enrichment');
      const result = await shovelsHomeownerEnrichmentService.enrichPendingHomeowners(batchSize);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await prisma.homeowner.delete({ where: { id: req.params.id } });
      sendSuccess(res, { message: 'Homeowner deleted' });
    } catch (error) {
      next(error);
    }
  }

  async export(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const homeowners = await prisma.homeowner.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10000,
      });

      const headers = [
        'firstName', 'lastName', 'email', 'phone', 'street', 'city', 'state', 'zipCode',
        'propertyValue', 'propertyType', 'yearBuilt', 'bedrooms', 'bathrooms',
        'permitType', 'permitDateFriendly', 'permitMonthsAgo', 'permitDescription',
        'permitJobValue', 'permitFees', 'permitStatus', 'permitNumber', 'permitJurisdiction',
        'incomeRange', 'netWorth', 'avmValue', 'assessedValue', 'taxAmount',
        'realieEnriched', 'createdAt',
      ];

      const csvRows = [headers.join(',')];
      for (const h of homeowners) {
        const row = headers.map(key => {
          const val = (h as any)[key];
          if (val === null || val === undefined) return '';
          const str = String(val);
          return str.includes(',') || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
        });
        csvRows.push(row.join(','));
      }

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename=homeowners.csv');
      res.send(csvRows.join('\n'));
    } catch (error) {
      next(error);
    }
  }
}

export const homeownerController = new HomeownerController();

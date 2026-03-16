import { prisma } from '../../config/database';
import { shovelsClient } from '../../integrations/shovels/client';
import { logger } from '../../utils/logger';

export interface ConnectionResolveResult {
  success: boolean;
  total: number;
  connected: number;
  noContractor: number;
  errors: number;
  duration: number;
}

export interface ConnectionListParams {
  search?: string;
  permitType?: string;
  city?: string;
  state?: string;
  page?: number;
  limit?: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface ConnectionStats {
  totalConnections: number;
  uniqueContractors: number;
  uniqueHomeowners: number;
}

const SHOVELS_DELAY_MS = 200;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class ConnectionService {
  async resolveConnections(batchSize: number = 50): Promise<ConnectionResolveResult> {
    const startTime = Date.now();
    let connected = 0;
    let noContractor = 0;
    let errors = 0;

    const homeowners = await prisma.homeowner.findMany({
      where: {
        permitIds: { isEmpty: false },
        connections: { none: {} },
      },
      take: batchSize,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        permitIds: true,
        permitType: true,
        permitCity: true,
      },
    });

    logger.info({ count: homeowners.length }, 'Found homeowners to resolve connections for');

    for (const homeowner of homeowners) {
      try {
        const permitId = homeowner.permitIds[0];
        if (!permitId) continue;

        const permit = await shovelsClient.getPermitById(permitId);
        await delay(SHOVELS_DELAY_MS);

        if (!permit?.contractor_id) {
          noContractor++;
          continue;
        }

        const contact = await prisma.contact.findFirst({
          where: { shovelsContractorId: permit.contractor_id },
          select: { id: true },
        });

        if (!contact) {
          noContractor++;
          continue;
        }

        await prisma.connection.upsert({
          where: {
            contactId_homeownerId_permitId: {
              contactId: contact.id,
              homeownerId: homeowner.id,
              permitId,
            },
          },
          update: {},
          create: {
            contactId: contact.id,
            homeownerId: homeowner.id,
            permitId,
            permitType: permit.type || permit.tags?.[0] || homeowner.permitType || null,
            permitDate: permit.start_date || permit.file_date || null,
            permitJobValue: permit.job_value ?? null,
            permitDescription: permit.description || null,
            source: 'shovels',
          },
        });

        connected++;
      } catch (err: any) {
        errors++;
        logger.warn({ homeownerId: homeowner.id, error: err.message }, 'Failed to resolve connection');
      }
    }

    const duration = Date.now() - startTime;
    logger.info({ total: homeowners.length, connected, noContractor, errors, duration }, 'Connection resolution complete');

    return {
      success: true,
      total: homeowners.length,
      connected,
      noContractor,
      errors,
      duration,
    };
  }

  async createConnectionFromPermit(
    homeownerId: string,
    contractorShovelsId: string,
    permitId: string,
    permitData: { type?: string | null; start_date?: string | null; file_date?: string | null; job_value?: number | null; description?: string | null; tags?: string[] | null }
  ): Promise<boolean> {
    try {
      const contact = await prisma.contact.findFirst({
        where: { shovelsContractorId: contractorShovelsId },
        select: { id: true },
      });

      if (!contact) return false;

      await prisma.connection.upsert({
        where: {
          contactId_homeownerId_permitId: {
            contactId: contact.id,
            homeownerId: homeownerId,
            permitId,
          },
        },
        update: {},
        create: {
          contactId: contact.id,
          homeownerId: homeownerId,
          permitId,
          permitType: permitData.type || permitData.tags?.[0] || null,
          permitDate: permitData.start_date || permitData.file_date || null,
          permitJobValue: permitData.job_value ?? null,
          permitDescription: permitData.description || null,
          source: 'shovels',
        },
      });

      return true;
    } catch (err: any) {
      if (err.code === 'P2002') return false;
      logger.warn({ homeownerId, contractorShovelsId, error: err.message }, 'Failed to create connection from permit');
      return false;
    }
  }

  async list(params: ConnectionListParams = {}) {
    const {
      search,
      permitType,
      city,
      state,
      page = 1,
      limit = 25,
      sort = 'createdAt',
      order = 'desc',
    } = params;

    const pageNum = Math.max(1, page);
    const limitNum = Math.min(100, Math.max(1, limit));
    const skip = (pageNum - 1) * limitNum;

    const where: any = {};

    if (search) {
      where.OR = [
        { contact: { fullName: { contains: search, mode: 'insensitive' } } },
        { contact: { email: { contains: search, mode: 'insensitive' } } },
        { homeowner: { fullName: { contains: search, mode: 'insensitive' } } },
        { homeowner: { email: { contains: search, mode: 'insensitive' } } },
        { homeowner: { street: { contains: search, mode: 'insensitive' } } },
      ];
    }

    if (permitType) where.permitType = { contains: permitType, mode: 'insensitive' };
    if (city) {
      where.OR = [
        ...(where.OR || []),
        { contact: { city: { contains: city, mode: 'insensitive' } } },
        { homeowner: { city: { contains: city, mode: 'insensitive' } } },
      ];
    }
    if (state) {
      where.AND = [
        ...(where.AND || []),
        {
          OR: [
            { contact: { state } },
            { homeowner: { state } },
          ],
        },
      ];
    }

    const orderBy: any = {};
    orderBy[sort] = order;

    const [data, total] = await Promise.all([
      prisma.connection.findMany({
        where,
        orderBy,
        skip,
        take: limitNum,
        include: {
          contact: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              city: true,
              state: true,
              shovelsContractorId: true,
              permitType: true,
              status: true,
            },
          },
          homeowner: {
            select: {
              id: true,
              fullName: true,
              email: true,
              phone: true,
              street: true,
              city: true,
              state: true,
              avmValue: true,
              propertyType: true,
              realieEnriched: true,
            },
          },
        },
      }),
      prisma.connection.count({ where }),
    ]);

    return {
      data,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  async stats(): Promise<ConnectionStats> {
    const [totalConnections, uniqueContractors, uniqueHomeowners] = await Promise.all([
      prisma.connection.count(),
      prisma.connection.groupBy({ by: ['contactId'] }).then((g) => g.length),
      prisma.connection.groupBy({ by: ['homeownerId'] }).then((g) => g.length),
    ]);

    return { totalConnections, uniqueContractors, uniqueHomeowners };
  }

  async getByContactId(contactId: string) {
    return prisma.connection.findMany({
      where: { contactId },
      include: {
        homeowner: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            street: true,
            city: true,
            state: true,
            avmValue: true,
            propertyType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getByHomeownerId(homeownerId: string) {
    return prisma.connection.findMany({
      where: { homeownerId },
      include: {
        contact: {
          select: {
            id: true,
            fullName: true,
            email: true,
            phone: true,
            city: true,
            state: true,
            shovelsContractorId: true,
            permitType: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(id: string) {
    return prisma.connection.findUnique({
      where: { id },
      include: {
        contact: true,
        homeowner: true,
      },
    });
  }
}

export const connectionService = new ConnectionService();

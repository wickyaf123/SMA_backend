import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

/**
 * Company Service
 * Handles company CRUD operations
 */
export class CompanyService {
  /**
   * Create a new company
   */
  public async createCompany(data: any, userId?: string): Promise<any> {
    try {
      logger.info({ name: data.name, userId }, 'Creating company');

      const company = await prisma.company.create({
        data: {
          ...data,
          ...(userId && { userId }),
        },
        include: {
          contacts: true,
        },
      });

      logger.info({
        companyId: company.id,
        name: company.name,
      }, 'Company created');

      return company;
    } catch (error: any) {
      if (error.code === 'P2002') {
        if (error.meta?.target?.includes('domain')) {
          throw new Error(`Company with domain ${data.domain} already exists`);
        }
        if (error.meta?.target?.includes('apolloId')) {
          throw new Error(`Company with Apollo ID ${data.apolloId} already exists`);
        }
      }
      logger.error({
        name: data.name,
        error,
      }, 'Failed to create company');
      throw error;
    }
  }

  /**
   * Get company by ID
   */
  public async getCompanyById(id: string, userId?: string): Promise<any> {
    try {
      const company = await prisma.company.findUnique({
        where: { id },
        include: {
          contacts: {
            take: 10,
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });

      if (!company || (userId && company.userId && company.userId !== userId)) {
        throw new Error(`Company ${id} not found`);
      }

      return company;
    } catch (error) {
      logger.error({
        companyId: id,
        error,
      }, 'Failed to get company');
      throw error;
    }
  }

  /**
   * Update company
   */
  public async updateCompany(id: string, data: any, userId?: string): Promise<any> {
    try {
      logger.info({ companyId: id, userId }, 'Updating company');

      const where: any = { id };
      if (userId) where.userId = userId;

      const company = await prisma.company.update({
        where,
        data,
        include: {
          contacts: {
            take: 10,
            orderBy: {
              createdAt: 'desc',
            },
          },
        },
      });

      logger.info({
        companyId: id,
        name: company.name,
      }, 'Company updated');

      return company;
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new Error(`Company ${id} not found`);
      }
      logger.error({
        companyId: id,
        error,
      }, 'Failed to update company');
      throw error;
    }
  }

  /**
   * Delete company
   */
  public async deleteCompany(id: string, userId?: string): Promise<void> {
    try {
      logger.info({ companyId: id, userId }, 'Deleting company');

      const where: any = { id };
      if (userId) where.userId = userId;

      await prisma.company.delete({
        where,
      });

      logger.info({ companyId: id }, 'Company deleted');
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new Error(`Company ${id} not found`);
      }
      logger.error({
        companyId: id,
        error,
      }, 'Failed to delete company');
      throw error;
    }
  }

  /**
   * List companies with pagination
   */
  public async listCompanies(options: {
    page?: number;
    limit?: number;
    search?: string;
  } = {}, userId?: string): Promise<any> {
    try {
      const { page = 1, limit = 50, search } = options;

      const where: any = {};

      if (userId) {
        where.userId = userId;
      }

      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { domain: { contains: search, mode: 'insensitive' } },
        ];
      }

      const total = await prisma.company.count({ where });
      const totalPages = Math.ceil(total / limit);
      const skip = (page - 1) * limit;

      const companies = await prisma.company.findMany({
        where,
        include: {
          _count: {
            select: { contacts: true },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      });

      return {
        data: companies,
        pagination: {
          page,
          limit,
          total,
          totalPages,
        },
      };
    } catch (error) {
      logger.error({
        options,
        error,
      }, 'Failed to list companies');
      throw error;
    }
  }
}

// Export singleton instance
export const companyService = new CompanyService();


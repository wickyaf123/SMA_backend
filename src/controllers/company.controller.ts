import { Request, Response, NextFunction } from 'express';
import { companyService } from '../services/company/company.service';
import { successResponse, errorResponse } from '../utils/response';
import { logger } from '../utils/logger';

/**
 * Company Controller
 * Handles all company-related HTTP requests
 */
export class CompanyController {
  /**
   * Create a new company
   * POST /api/v1/companies
   */
  public async createCompany(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const company = await companyService.createCompany(req.body);
      
      res.status(201).json(successResponse(company, {
        message: 'Company created successfully',
      }));
    } catch (error: any) {
      logger.error({ error, body: req.body }, 'Error creating company');
      next(error);
    }
  }

  /**
   * Get company by ID
   * GET /api/v1/companies/:id
   */
  public async getCompany(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const company = await companyService.getCompanyById(id);
      
      res.json(successResponse(company));
    } catch (error: any) {
      if (error.message.includes('not found')) {
        res.status(404).json(errorResponse('Company not found', 404));
      } else {
        next(error);
      }
    }
  }

  /**
   * Update company
   * PATCH /api/v1/companies/:id
   */
  public async updateCompany(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const company = await companyService.updateCompany(id, req.body);
      
      res.json(successResponse(company, {
        message: 'Company updated successfully',
      }));
    } catch (error: any) {
      if (error.message.includes('not found')) {
        res.status(404).json(errorResponse('Company not found', 404));
      } else {
        next(error);
      }
    }
  }

  /**
   * Delete company
   * DELETE /api/v1/companies/:id
   */
  public async deleteCompany(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      await companyService.deleteCompany(id);
      
      res.json(successResponse(null, {
        message: 'Company deleted successfully',
      }));
    } catch (error: any) {
      if (error.message.includes('not found')) {
        res.status(404).json(errorResponse('Company not found', 404));
      } else {
        next(error);
      }
    }
  }

  /**
   * List companies
   * GET /api/v1/companies
   */
  public async listCompanies(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const search = req.query.search as string | undefined;

      const result = await companyService.listCompanies({ page, limit, search });
      
      res.json(successResponse(result.data, {
        pagination: result.pagination,
      }));
    } catch (error) {
      next(error);
    }
  }
}

// Export singleton instance
export const companyController = new CompanyController();


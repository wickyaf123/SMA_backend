import { Request, Response, NextFunction } from 'express';
import { contactService } from '../services/contact/contact.service';
import { leadIngestionService } from '../services/lead/ingestion.service';
import { importJobService } from '../services/import/import-job.service';
import { buildSearchParamsForIndustry } from '../integrations/apollo/normalizer';
import { successResponse, errorResponse } from '../utils/response';
import { logger } from '../utils/logger';
import multer from 'multer';

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'));
    }
  },
});

/**
 * Contact Controller
 * Handles all contact-related HTTP requests
 */
export class ContactController {
  /**
   * Create a new contact
   * POST /api/v1/contacts
   */
  public async createContact(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const contact = await contactService.createContact(req.body);
      
      res.status(201).json(successResponse(contact, {
        message: 'Contact created successfully',
      }));
    } catch (error: any) {
      logger.error({ error, body: req.body }, 'Error creating contact');
      next(error);
    }
  }

  /**
   * Get contact by ID
   * GET /api/v1/contacts/:id
   */
  public async getContact(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const contact = await contactService.getContactById(id);
      
      res.json(successResponse(contact));
    } catch (error: any) {
      if (error.message.includes('not found')) {
        res.status(404).json(errorResponse('Contact not found', 404));
      } else {
        next(error);
      }
    }
  }

  /**
   * Update contact
   * PATCH /api/v1/contacts/:id
   */
  public async updateContact(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const contact = await contactService.updateContact(id, req.body);
      
      res.json(successResponse(contact, {
        message: 'Contact updated successfully',
      }));
    } catch (error: any) {
      if (error.message.includes('not found')) {
        res.status(404).json(errorResponse('Contact not found', 404));
      } else {
        next(error);
      }
    }
  }

  /**
   * Delete contact
   * DELETE /api/v1/contacts/:id
   */
  public async deleteContact(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      await contactService.deleteContact(id);
      
      res.json(successResponse(null, {
        message: 'Contact deleted successfully',
      }));
    } catch (error: any) {
      if (error.message.includes('not found')) {
        res.status(404).json(errorResponse('Contact not found', 404));
      } else {
        next(error);
      }
    }
  }

  /**
   * Search and filter contacts
   * GET /api/v1/contacts
   */
  public async searchContacts(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const filters: any = { ...req.query };
      
      // Parse arrays
      if (filters.status) {
        filters.status = Array.isArray(filters.status) ? filters.status : [filters.status];
      }
      if (filters.tags) {
        filters.tags = Array.isArray(filters.tags) ? filters.tags : [filters.tags];
      }
      
      // Parse dates
      if (filters.createdFrom) {
        filters.createdFrom = new Date(filters.createdFrom);
      }
      if (filters.createdTo) {
        filters.createdTo = new Date(filters.createdTo);
      }
      
      // Parse boolean
      if (filters.hasReplied) {
        filters.hasReplied = filters.hasReplied === 'true';
      }
      
      // Parse numbers
      if (filters.page) {
        filters.page = parseInt(filters.page, 10);
      }
      if (filters.limit) {
        filters.limit = parseInt(filters.limit, 10);
      }
      
      const result = await contactService.searchContacts(filters);
      
      res.json(successResponse(result.data, {
        pagination: result.pagination,
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Import from Apollo (with two-step enrichment)
   * POST /api/v1/contacts/import/apollo
   * 
   * Supports all search filters for HVAC, Solar, and Roofing lead generation.
   * Uses a cost-effective two-step process:
   * 1. Search Apollo (free)
   * 2. Enrich contacts in batches (costs credits)
   * 
   * IMPORTANT: Industry is REQUIRED to ensure qualified contractor leads.
   * Default filters applied per spec: 10-100 employees, $1M-$10M revenue,
   * target US states, negative filters for wholesalers/manufacturers.
   */
  public async importFromApollo(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const {
        // Person filters
        personTitles,
        
        // Organization filters
        organizationLocations,
        excludeLocations,
        industry,
        
        // Size filters
        employeesMin,
        employeesMax,
        revenueMin,
        revenueMax,
        
        // Technology and growth
        technologies,
        employeeGrowth,
        
        // Pagination and limits
        page,
        perPage,
        enrichLimit = 100, // Max contacts to enrich (default: 100)
      } = req.body;

      // REQUIRE industry to ensure we only get qualified contractor leads
      if (!industry || !['HVAC', 'SOLAR', 'ROOFING'].includes(industry)) {
        res.status(400).json(errorResponse(
          'Industry is required. Must be one of: HVAC, SOLAR, ROOFING',
          400
        ));
        return;
      }

      logger.info({
        industry,
        locations: organizationLocations,
        excludeLocations,
        enrichLimit,
      }, 'Starting Apollo import request');

      // Spec-compliant industry keywords (January 2, 2026 spec)
      const INDUSTRY_KEYWORDS = {
        HVAC: 'HVAC OR "Heating and Air Conditioning" OR "Air Conditioning Contractor" OR "HVAC Services"',
        SOLAR: '"Solar Energy" OR "battery installer" OR "Solar Installation" OR "Renewable Energy" OR "Solar Contractor"',
        ROOFING: 'Roofing OR "Roofing Contractor" OR "Roof Installation" OR "Residential Roofing"',
      };

      // Spec-compliant priority states by industry
      const PRIORITY_LOCATIONS = {
        SOLAR: ['California, United States', 'Texas, United States', 'Florida, United States', 'Arizona, United States', 'North Carolina, United States'],
        HVAC: ['Texas, United States', 'Arizona, United States', 'Florida, United States', 'California, United States', 'North Carolina, United States', 'Georgia, United States'],
        ROOFING: ['Texas, United States', 'Florida, United States', 'California, United States', 'North Carolina, United States', 'Georgia, United States', 'Arizona, United States'],
      };

      // Build Apollo search params with REQUIRED contractor filters
      const searchParams: any = {
        // Decision maker titles (spec: Owner, CEO, President, COO, VP Operations, VP Sales, General Manager)
        person_titles: personTitles || [
          'Owner',
          'CEO',
          'President',
          'COO',
          'VP Operations',
          'VP Sales',
          'General Manager',
        ],
        
        // Location filter - use provided or industry-specific defaults
        organization_locations: organizationLocations || PRIORITY_LOCATIONS[industry as keyof typeof PRIORITY_LOCATIONS],
        
        // Pagination
        page: page || 1,
        per_page: perPage || 100,
        reveal_personal_emails: true,
        reveal_phone_number: true,
        
        // REQUIRED: Industry keywords (spec-compliant)
        q_organization_keywords: INDUSTRY_KEYWORDS[industry as keyof typeof INDUSTRY_KEYWORDS],
        
        // REQUIRED: Employee range (spec: 10-100 employees)
        organization_num_employees_ranges: employeesMin && employeesMax 
          ? [`${employeesMin},${employeesMax}`] 
          : ['10,100'],
        
        // REQUIRED: Revenue range (spec: $1M-$10M)
        revenue_range: revenueMin && revenueMax 
          ? { min: revenueMin, max: revenueMax } 
          : { min: 1000000, max: 10000000 },
        
        // REQUIRED: Negative filters - exclude wholesalers, manufacturers, distributors
        q_organization_not_keyword_tags: [
          'wholesale',
          'distribution',
          'distributor',
          'manufacturer',
          'manufacturing',
          'supply',
          'supplier',
        ],
      };

      // Add location exclusions (e.g., Southern California for Solar)
      if (excludeLocations && excludeLocations.length > 0) {
        searchParams.organization_not_locations = excludeLocations;
      }

      // Add technologies filter (optional)
      if (technologies && technologies.length > 0) {
        searchParams.organization_technologies = technologies;
      }

      // Add employee growth rate filter (optional)
      if (employeeGrowth) {
        searchParams.organization_employee_growth_rate = `${employeeGrowth}%`;
      }

      logger.info({
        industry,
        keywords: searchParams.q_organization_keywords,
        locations: searchParams.organization_locations,
        employeeRange: searchParams.organization_num_employees_ranges,
        revenueRange: searchParams.revenue_range,
        negativeFilters: searchParams.q_organization_not_keyword_tags,
      }, 'Apollo search params configured with contractor filters');

      // Start import (async) with enrichment limit
      const result = await leadIngestionService.importFromApollo(searchParams, enrichLimit);
      
      res.status(202).json(successResponse(result, {
        message: `${industry} contractor import from Apollo started successfully`,
        enrichLimit,
        filtersApplied: {
          industry,
          employeeRange: searchParams.organization_num_employees_ranges[0],
          revenueRange: `$${(searchParams.revenue_range.min / 1000000).toFixed(0)}M-$${(searchParams.revenue_range.max / 1000000).toFixed(0)}M`,
          locations: searchParams.organization_locations.length,
          excludedTypes: searchParams.q_organization_not_keyword_tags.length,
        },
      }));
    } catch (error) {
      logger.error({ error, body: req.body }, 'Error importing from Apollo');
      next(error);
    }
  }

  /**
   * Import from CSV
   * POST /api/v1/contacts/import/csv
   */
  public importFromCsv(upload: any) {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (!req.file) {
          res.status(400).json(errorResponse('No file uploaded', 400));
          return;
        }

        const options = {
          customMapping: req.body.customMapping ? JSON.parse(req.body.customMapping) : undefined,
          skipEmptyLines: req.body.skipEmptyLines !== 'false',
          trimValues: req.body.trimValues !== 'false',
          maxRows: req.body.maxRows ? parseInt(req.body.maxRows, 10) : undefined,
        };

        // Start import (async)
        const result = await leadIngestionService.importFromCsv(req.file.buffer, options);
        
        res.status(202).json(successResponse(result, {
          message: 'CSV import started successfully',
        }));
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Get import job status
   * GET /api/v1/contacts/import/:jobId/status
   */
  public async getImportStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { jobId } = req.params;
      const status = await importJobService.getJobStatus(jobId);
      
      res.json(successResponse(status));
    } catch (error: any) {
      if (error.message.includes('not found')) {
        res.status(404).json(errorResponse('Import job not found', 404));
      } else {
        next(error);
      }
    }
  }

  /**
   * Get contact statistics
   * GET /api/v1/contacts/stats
   */
  public async getStatistics(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const stats = await contactService.getStatistics();
      
      res.json(successResponse(stats));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Get replies for a contact
   * GET /api/v1/contacts/:id/replies
   */
  public async getReplies(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const replies = await contactService.getContactReplies(id);
      
      res.json(successResponse(replies));
    } catch (error: any) {
      if (error.message.includes('not found')) {
        res.status(404).json(errorResponse('Contact not found', 404));
      } else {
        next(error);
      }
    }
  }

  /**
   * Get activity logs for a contact
   * GET /api/v1/contacts/:id/activity
   */
  public async getActivity(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const limit = parseInt(req.query.limit as string) || 50;
      const activity = await contactService.getContactActivity(id, limit);
      
      res.json(successResponse(activity));
    } catch (error: any) {
      if (error.message.includes('not found')) {
        res.status(404).json(errorResponse('Contact not found', 404));
      } else {
        next(error);
      }
    }
  }

  /**
   * Get GHL conversation messages for a contact
   * GET /api/v1/contacts/:id/messages
   */
  public async getMessages(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { id } = req.params;
      const messages = await contactService.getContactMessages(id);
      
      res.json(successResponse(messages));
    } catch (error: any) {
      if (error.message.includes('not found')) {
        res.status(404).json(errorResponse('Contact not found', 404));
      } else {
        next(error);
      }
    }
  }
}

// Export singleton instance and multer upload
export const contactController = new ContactController();
export const csvUpload = upload.single('file');


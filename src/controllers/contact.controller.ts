import { Request, Response, NextFunction } from 'express';
import { contactService } from '../services/contact/contact.service';
import { leadIngestionService } from '../services/lead/ingestion.service';
import { importJobService } from '../services/import/import-job.service';
import { settingsService } from '../services/settings/settings.service';
import { buildSearchParamsForIndustry } from '../integrations/apollo/normalizer';
import { successResponse, errorResponse, sendError } from '../utils/response';
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
      const userId = req.user?.role === 'ADMIN' ? undefined : req.user?.userId;
      const contact = await contactService.createContact(req.body, userId);
      
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
      const userId = req.user?.role === 'ADMIN' ? undefined : req.user?.userId;
      const contact = await contactService.getContactById(id, userId);
      
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
      const userId = req.user?.role === 'ADMIN' ? undefined : req.user?.userId;
      const contact = await contactService.updateContact(id, req.body, userId);
      
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
      const userId = req.user?.role === 'ADMIN' ? undefined : req.user?.userId;
      await contactService.deleteContact(id, userId);
      
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
      
      const userId = req.user?.role === 'ADMIN' ? undefined : req.user?.userId;
      const result = await contactService.searchContacts(filters, userId);

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
    _req: Request,
    res: Response,
    _next: NextFunction
  ): Promise<void> {
    sendError(res, 410, 'Apollo import has been deprecated. Use the Shovels permit scraper instead.', 'GONE');
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
      const userId = req.user?.role === 'ADMIN' ? undefined : req.user?.userId;
      const stats = await contactService.getStatistics(userId);
      
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


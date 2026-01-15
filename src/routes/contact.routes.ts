import { Router } from 'express';
import { Request, Response, NextFunction } from 'express';
import { contactController, csvUpload } from '../controllers/contact.controller';
import { contactExportService } from '../services/contact/export.service';
import { campaignController } from '../controllers/campaign.controller';
import { validate } from '../middleware/validate';
import {
  createContactSchema,
  updateContactSchema,
  contactSearchSchema,
  importApolloSchema,
  importCsvSchema,
} from '../validators/contact.validators';
import { sendSMSSchema, previewSMSSchema } from '../validators/campaign.validators';

const router = Router();

/**
 * Contact Routes
 */

// CRUD operations
router.post(
  '/',
  contactController.createContact.bind(contactController)
);

router.get(
  '/stats',
  contactController.getStatistics.bind(contactController)
);

// Export endpoint (before /:id to avoid route conflict)
router.get(
  '/export',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const filters: any = { ...req.query };
      
      // Parse filters (same as search)
      if (filters.status) {
        filters.status = Array.isArray(filters.status) ? filters.status : [filters.status];
      }
      if (filters.tags) {
        filters.tags = Array.isArray(filters.tags) ? filters.tags : [filters.tags];
      }
      if (filters.createdFrom) {
        filters.createdFrom = new Date(filters.createdFrom);
      }
      if (filters.createdTo) {
        filters.createdTo = new Date(filters.createdTo);
      }
      if (filters.hasReplied) {
        filters.hasReplied = filters.hasReplied === 'true';
      }
      
      const csv = await contactExportService.exportToCSV(filters);
      const filename = contactExportService.getFilename();
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(csv);
    } catch (error) {
      next(error);
    }
  }
);

// Import endpoints (MUST be before /:id to avoid route conflicts)
router.post(
  '/import/apollo',
  contactController.importFromApollo.bind(contactController)
);

router.post(
  '/import/csv',
  csvUpload,
  contactController.importFromCsv(csvUpload).bind(contactController)
);

router.get(
  '/import/:jobId/status',
  contactController.getImportStatus.bind(contactController)
);

// ID-based routes (MUST be after specific routes like /import, /export, /stats)
router.get(
  '/:id',
  contactController.getContact.bind(contactController)
);

router.patch(
  '/:id',
  contactController.updateContact.bind(contactController)
);

router.delete(
  '/:id',
  contactController.deleteContact.bind(contactController)
);

// Search and filter
router.get(
  '/',
  contactController.searchContacts.bind(contactController)
);

// SMS operations (must be after /:id routes)
router.post(
  '/:id/sms',
  validate(sendSMSSchema),
  campaignController.sendSMS.bind(campaignController)
);

router.post(
  '/:id/sms/preview',
  validate(previewSMSSchema),
  campaignController.previewSMS.bind(campaignController)
);

// Reply and activity endpoints
router.get(
  '/:id/replies',
  contactController.getReplies.bind(contactController)
);

router.get(
  '/:id/activity',
  contactController.getActivity.bind(contactController)
);

// GHL conversation messages (live fetch)
router.get(
  '/:id/messages',
  contactController.getMessages.bind(contactController)
);

export default router;


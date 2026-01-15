import { Router } from 'express';
import { campaignController } from '../controllers/campaign.controller';
import { validate } from '../middleware/validate';
import {
  createCampaignSchema,
  updateCampaignSchema,
  getCampaignSchema,
  listCampaignsSchema,
  deleteCampaignSchema,
  enrollContactsSchema,
  stopEnrollmentSchema,
  getEnrollmentsSchema,
  sendSMSSchema,
  previewSMSSchema,
} from '../validators/campaign.validators';

const router = Router();

/**
 * Campaign Routes
 * All routes require authentication (handled by parent router)
 */

// Sync campaigns from external platforms (must be before :id routes)
router.post(
  '/sync/instantly',
  campaignController.syncFromInstantly.bind(campaignController)
);

// Aggregated outreach stats by channel (must be before :id routes)
router.get(
  '/outreach-stats',
  campaignController.getOutreachStats.bind(campaignController)
);

// Campaign CRUD
router.post(
  '/',
  validate(createCampaignSchema),
  campaignController.createCampaign.bind(campaignController)
);

router.get(
  '/',
  validate(listCampaignsSchema),
  campaignController.listCampaigns.bind(campaignController)
);

router.get(
  '/:id',
  validate(getCampaignSchema),
  campaignController.getCampaign.bind(campaignController)
);

router.patch(
  '/:id',
  validate(updateCampaignSchema),
  campaignController.updateCampaign.bind(campaignController)
);

router.delete(
  '/:id',
  validate(deleteCampaignSchema),
  campaignController.deleteCampaign.bind(campaignController)
);

// Campaign enrollment
router.post(
  '/:id/enroll',
  validate(enrollContactsSchema),
  campaignController.enrollContacts.bind(campaignController)
);

router.post(
  '/:campaignId/stop/:contactId',
  validate(stopEnrollmentSchema),
  campaignController.stopEnrollment.bind(campaignController)
);

router.get(
  '/:id/enrollments',
  validate(getEnrollmentsSchema),
  campaignController.getEnrollments.bind(campaignController)
);

// Campaign stats
router.get(
  '/:id/stats',
  validate(getCampaignSchema),
  campaignController.getCampaignStats.bind(campaignController)
);

export default router;


/**
 * Contractor Routes
 * Preset endpoints for contractor lead generation
 */

import { Router } from 'express';
import { contractorController } from '../controllers/contractor.controller';

const router = Router();

/**
 * Apollo Preset Endpoints
 */
router.post(
  '/apollo/solar',
  contractorController.importApolloSolar.bind(contractorController)
);

router.post(
  '/apollo/hvac',
  contractorController.importApolloHVAC.bind(contractorController)
);

router.post(
  '/apollo/roofing',
  contractorController.importApolloRoofing.bind(contractorController)
);

/**
 * Google Maps Preset Endpoints
 */
router.post(
  '/google-maps/solar',
  contractorController.importGoogleMapsSolar.bind(contractorController)
);

router.post(
  '/google-maps/hvac',
  contractorController.importGoogleMapsHVAC.bind(contractorController)
);

router.post(
  '/google-maps/roofing',
  contractorController.importGoogleMapsRoofing.bind(contractorController)
);

/**
 * Full Pipeline (Apollo + Google Maps)
 */
router.post(
  '/full-pipeline/:industry',
  contractorController.fullPipeline.bind(contractorController)
);

export default router;


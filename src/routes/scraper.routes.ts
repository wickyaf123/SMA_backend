/**
 * Scraper Routes
 * Google Maps scraper endpoints
 */

import { Router } from 'express';
import { scraperController } from '../controllers/scraper.controller';

const router = Router();

/**
 * Google Maps Scraper Endpoints
 */

// General import
router.post(
  '/google-maps',
  scraperController.importFromGoogleMaps.bind(scraperController)
);

// Industry presets
router.post(
  '/google-maps/solar',
  scraperController.importSolar.bind(scraperController)
);

router.post(
  '/google-maps/hvac',
  scraperController.importHVAC.bind(scraperController)
);

router.post(
  '/google-maps/roofing',
  scraperController.importRoofing.bind(scraperController)
);

// Quick test
router.get(
  '/google-maps/test',
  scraperController.quickTest.bind(scraperController)
);

// Batch import all industries
router.post(
  '/google-maps/batch-all',
  scraperController.batchImportAll.bind(scraperController)
);

// Shovels date field diagnostic
router.get(
  '/shovels/test-dates',
  scraperController.testShovelsDateFields.bind(scraperController)
);

export default router;


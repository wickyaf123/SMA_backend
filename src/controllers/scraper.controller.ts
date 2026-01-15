/**
 * Scraper Controller
 * Handles Google Maps scraper endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { googleMapsScraperService } from '../services/scraper/google-maps.service';
import { logger } from '../utils/logger';
import { successResponse, errorResponse } from '../utils/response';

export class ScraperController {
  /**
   * Import contractor leads from Google Maps
   * POST /api/v1/scraper/google-maps
   */
  public async importFromGoogleMaps(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const {
        industry,
        metros,
        searchTerms,
        maxPerMetro,
        minReviews,
        minRating,
        skipClosed,
        requireWebsite,
      } = req.body;

      if (!industry || !['SOLAR', 'HVAC', 'ROOFING'].includes(industry)) {
        res.status(400).json(errorResponse('Invalid industry. Must be SOLAR, HVAC, or ROOFING', 400));
        return;
      }

      logger.info({
        industry,
        metros: metros?.length || 'all',
      }, 'Google Maps import request received');

      // Start import (async)
      const result = await googleMapsScraperService.importContractorLeads({
        industry,
        metros,
        searchTerms,
        maxPerMetro,
        minReviews,
        minRating,
        skipClosed,
        requireWebsite,
      });

      res.status(202).json(successResponse(result, {
        message: 'Google Maps scraping completed',
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Import Solar contractors from Google Maps (preset)
   * POST /api/v1/scraper/google-maps/solar
   */
  public async importSolar(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { metros, maxPerMetro } = req.body;

      logger.info('Solar contractor scrape request (preset)');

      const result = await googleMapsScraperService.importContractorLeads({
        industry: 'SOLAR',
        metros,
        maxPerMetro,
      });

      res.status(202).json(successResponse(result, {
        message: 'Solar contractor scraping completed',
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Import HVAC contractors from Google Maps (preset)
   * POST /api/v1/scraper/google-maps/hvac
   */
  public async importHVAC(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { metros, maxPerMetro } = req.body;

      logger.info('HVAC contractor scrape request (preset)');

      const result = await googleMapsScraperService.importContractorLeads({
        industry: 'HVAC',
        metros,
        maxPerMetro,
      });

      res.status(202).json(successResponse(result, {
        message: 'HVAC contractor scraping completed',
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Import Roofing contractors from Google Maps (preset)
   * POST /api/v1/scraper/google-maps/roofing
   */
  public async importRoofing(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { metros, maxPerMetro } = req.body;

      logger.info('Roofing contractor scrape request (preset)');

      const result = await googleMapsScraperService.importContractorLeads({
        industry: 'ROOFING',
        metros,
        maxPerMetro,
      });

      res.status(202).json(successResponse(result, {
        message: 'Roofing contractor scraping completed',
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Quick test scrape (10 results from single metro)
   * GET /api/v1/scraper/google-maps/test
   */
  public async quickTest(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { industry, metro } = req.query;

      if (!industry || !['SOLAR', 'HVAC', 'ROOFING'].includes(industry as string)) {
        res.status(400).json(errorResponse('Invalid industry. Must be SOLAR, HVAC, or ROOFING', 400));
        return;
      }

      logger.info({ industry, metro }, 'Quick test scrape request');

      const results = await googleMapsScraperService.quickTest(
        industry as 'SOLAR' | 'HVAC' | 'ROOFING',
        metro as string
      );

      res.json(successResponse({
        count: results.length,
        results,
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Batch import all contractor industries
   * POST /api/v1/scraper/google-maps/batch-all
   */
  public async batchImportAll(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { metros, maxPerMetro } = req.body;

      logger.info('Batch import all industries request');

      const results = await googleMapsScraperService.batchImportAllIndustries({
        metros,
        maxPerMetro,
      });

      res.status(202).json(successResponse(results, {
        message: 'Batch import for all industries completed',
      }));
    } catch (error) {
      next(error);
    }
  }
}

export const scraperController = new ScraperController();


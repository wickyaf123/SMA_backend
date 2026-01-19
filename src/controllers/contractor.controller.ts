/**
 * Contractor Controller
 * Preset endpoints for contractor lead generation (Apollo + Google Maps)
 */

import { Request, Response, NextFunction } from 'express';
import { leadIngestionService } from '../services/lead/ingestion.service';
import { googleMapsScraperService } from '../services/scraper/google-maps.service';
import {
  buildSolarSearch,
  buildHVACSearch,
  buildRoofingSearch,
} from '../integrations/apollo/search-builder';
import {
  PRIORITY_STATES,
  CONTRACTOR_SIZE_FILTERS,
  CONTRACTOR_JOB_TITLES,
  TARGET_METROS,
} from '../integrations/contractor-constants';
import { logger } from '../utils/logger';
import { successResponse, errorResponse } from '../utils/response';

export class ContractorController {
  /**
   * Import Solar contractors from Apollo (preset filters)
   * POST /api/v1/contractors/apollo/solar
   */
  public async importApolloSolar(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const {
        enrichLimit = 100,
        page = 1,
        perPage = 100,
        excludeSouthernCalifornia = true,
      } = req.body;

      logger.info('Solar contractor import (Apollo preset)');

      // Build search with spec defaults
      const searchParams = buildSolarSearch({
        locations: PRIORITY_STATES.SOLAR.map((state: string) => `${state}, United States`),
        excludeSouthernCalifornia,
        revenueMin: CONTRACTOR_SIZE_FILTERS.revenueMin,
        revenueMax: CONTRACTOR_SIZE_FILTERS.revenueMax,
        employeesMin: CONTRACTOR_SIZE_FILTERS.employeesMin,
        employeesMax: CONTRACTOR_SIZE_FILTERS.employeesMax,
        titles: CONTRACTOR_JOB_TITLES,
        page,
        perPage,
      });

      const result = await leadIngestionService.importFromApollo(
        searchParams,
        enrichLimit
      );

      res.status(202).json(successResponse(result, {
        message: 'Solar contractor import from Apollo completed',
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Import HVAC contractors from Apollo (preset filters)
   * POST /api/v1/contractors/apollo/hvac
   */
  public async importApolloHVAC(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const {
        enrichLimit = 100,
        page = 1,
        perPage = 100,
      } = req.body;

      logger.info('HVAC contractor import (Apollo preset)');

      const searchParams = buildHVACSearch({
        locations: PRIORITY_STATES.HVAC.map((state: string) => `${state}, United States`),
        revenueMin: CONTRACTOR_SIZE_FILTERS.revenueMin,
        revenueMax: CONTRACTOR_SIZE_FILTERS.revenueMax,
        employeesMin: CONTRACTOR_SIZE_FILTERS.employeesMin,
        employeesMax: CONTRACTOR_SIZE_FILTERS.employeesMax,
        titles: CONTRACTOR_JOB_TITLES,
        page,
        perPage,
      });

      const result = await leadIngestionService.importFromApollo(
        searchParams,
        enrichLimit
      );

      res.status(202).json(successResponse(result, {
        message: 'HVAC contractor import from Apollo completed',
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Import Roofing contractors from Apollo (preset filters)
   * POST /api/v1/contractors/apollo/roofing
   */
  public async importApolloRoofing(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const {
        enrichLimit = 100,
        page = 1,
        perPage = 100,
      } = req.body;

      logger.info('Roofing contractor import (Apollo preset)');

      const searchParams = buildRoofingSearch({
        locations: PRIORITY_STATES.ROOFING.map((state: string) => `${state}, United States`),
        revenueMin: CONTRACTOR_SIZE_FILTERS.revenueMin,
        revenueMax: CONTRACTOR_SIZE_FILTERS.revenueMax,
        employeesMin: CONTRACTOR_SIZE_FILTERS.employeesMin,
        employeesMax: CONTRACTOR_SIZE_FILTERS.employeesMax,
        titles: CONTRACTOR_JOB_TITLES,
        page,
        perPage,
      });

      const result = await leadIngestionService.importFromApollo(
        searchParams,
        enrichLimit
      );

      res.status(202).json(successResponse(result, {
        message: 'Roofing contractor import from Apollo completed',
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Import Solar contractors from Google Maps (preset)
   * POST /api/v1/contractors/google-maps/solar
   */
  public async importGoogleMapsSolar(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { maxPerMetro = 100 } = req.body;

      logger.info('Solar contractor import (Google Maps preset)');

      const result = await googleMapsScraperService.importContractorLeads({
        industry: 'SOLAR',
        metros: TARGET_METROS,
        maxPerMetro,
      });

      res.status(202).json(successResponse(result, {
        message: 'Solar contractor scraping from Google Maps completed',
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Import HVAC contractors from Google Maps (preset)
   * POST /api/v1/contractors/google-maps/hvac
   */
  public async importGoogleMapsHVAC(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { maxPerMetro = 100 } = req.body;

      logger.info('HVAC contractor import (Google Maps preset)');

      const result = await googleMapsScraperService.importContractorLeads({
        industry: 'HVAC',
        metros: TARGET_METROS,
        maxPerMetro,
      });

      res.status(202).json(successResponse(result, {
        message: 'HVAC contractor scraping from Google Maps completed',
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Import Roofing contractors from Google Maps (preset)
   * POST /api/v1/contractors/google-maps/roofing
   */
  public async importGoogleMapsRoofing(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { maxPerMetro = 100 } = req.body;

      logger.info('Roofing contractor import (Google Maps preset)');

      const result = await googleMapsScraperService.importContractorLeads({
        industry: 'ROOFING',
        metros: TARGET_METROS,
        maxPerMetro,
      });

      res.status(202).json(successResponse(result, {
        message: 'Roofing contractor scraping from Google Maps completed',
      }));
    } catch (error) {
      next(error);
    }
  }

  /**
   * Full contractor pipeline: Apollo + Google Maps
   * POST /api/v1/contractors/full-pipeline/:industry
   */
  public async fullPipeline(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    try {
      const { industry } = req.params;
      const {
        apolloEnrichLimit = 100,
        googleMapsMaxPerMetro = 100,
        apolloPage = 1,
      } = req.body;

      if (!['solar', 'hvac', 'roofing'].includes(industry.toLowerCase())) {
        res.status(400).json(errorResponse('Invalid industry', 400));
        return;
      }

      const industryUpper = industry.toUpperCase() as 'SOLAR' | 'HVAC' | 'ROOFING';

      logger.info({
        industry: industryUpper,
        apolloEnrichLimit,
        googleMapsMaxPerMetro,
      }, 'Starting full contractor pipeline');

      // Run both in parallel
      const [apolloResult, googleMapsResult] = await Promise.all([
        // Apollo import
        (async () => {
          let searchParams;
          if (industryUpper === 'SOLAR') {
            searchParams = buildSolarSearch({
              locations: PRIORITY_STATES.SOLAR.map((s: string) => `${s}, United States`),
              excludeSouthernCalifornia: true,
              ...CONTRACTOR_SIZE_FILTERS,
              titles: CONTRACTOR_JOB_TITLES,
              page: apolloPage,
            });
          } else if (industryUpper === 'HVAC') {
            searchParams = buildHVACSearch({
              locations: PRIORITY_STATES.HVAC.map((s: string) => `${s}, United States`),
              ...CONTRACTOR_SIZE_FILTERS,
              titles: CONTRACTOR_JOB_TITLES,
              page: apolloPage,
            });
          } else {
            searchParams = buildRoofingSearch({
              locations: PRIORITY_STATES.ROOFING.map((s: string) => `${s}, United States`),
              ...CONTRACTOR_SIZE_FILTERS,
              titles: CONTRACTOR_JOB_TITLES,
              page: apolloPage,
            });
          }
          return leadIngestionService.importFromApollo(searchParams, apolloEnrichLimit);
        })(),
        
        // Google Maps scrape
        googleMapsScraperService.importContractorLeads({
          industry: industryUpper,
          metros: TARGET_METROS,
          maxPerMetro: googleMapsMaxPerMetro,
        }),
      ]);

      res.status(202).json(successResponse({
        apollo: apolloResult,
        googleMaps: googleMapsResult,
        combined: {
          totalImported: apolloResult.imported + googleMapsResult.totalImported,
          totalDuplicates: apolloResult.duplicates + googleMapsResult.duplicates,
          totalErrors: apolloResult.errors.length + googleMapsResult.errors,
        },
      }, {
        message: `Full ${industry} contractor pipeline completed`,
      }));
    } catch (error) {
      next(error);
    }
  }
}

export const contractorController = new ContractorController();


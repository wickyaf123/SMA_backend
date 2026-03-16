import { shovelsClient } from '../../integrations/shovels/client';
import { normalizeResident } from '../../integrations/shovels/normalizer';
import type { NormalizedHomeowner } from '../../integrations/shovels/normalizer';
import type { ShovelsPermit } from '../../integrations/shovels/types';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { connectionService } from '../connection/connection.service';

function computeDateFriendly(dateStr: string | null): string | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

function computeMonthsAgo(dateStr: string | null): number | null {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    const now = new Date();
    return Math.max(0, (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth()));
  } catch { return null; }
}

export interface HomeownerRunResult {
  success: boolean;
  totalScraped: number;
  totalImported: number;
  duplicates: number;
  errors: string[];
  searchesRun: number;
}

export class HomeownerScraperService {
  async scrapeByGeoId(
    geoId: string,
    city: string,
    maxResults: number,
    fetchPermitDetails: boolean = true
  ): Promise<HomeownerRunResult> {
    let totalScraped = 0;
    let totalImported = 0;
    let duplicates = 0;
    const errors: string[] = [];

    try {
      const { residents } = await shovelsClient.getResidents(geoId, { size: Math.min(maxResults, 100) });
      totalScraped = residents.length;

      logger.info(
        { totalScraped, geoId, city },
        'Shovels homeowner search returned residents'
      );

      for (const resident of residents) {
        try {
          const normalized = normalizeResident(resident, geoId);
          let permitData: ShovelsPermit | null = null;

          if (fetchPermitDetails && normalized.permitIds.length > 0) {
            permitData = await shovelsClient.getPermitById(normalized.permitIds[0]);
          }

          const result = await this.importHomeowner(normalized, city, permitData);
          if (result === 'imported') totalImported++;
          else if (result === 'duplicate') duplicates++;
        } catch (err: any) {
          if (err.code === 'P2002') {
            duplicates++;
          } else {
            errors.push(`Resident ${resident.id}: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      errors.push(`Search failed: ${err.message}`);
      logger.error({ err: err.message, geoId }, 'Shovels homeowner search failed');
    }

    logger.info({ totalScraped, totalImported, duplicates, errors: errors.length }, 'Homeowner scrape complete');
    return { success: true, totalScraped, totalImported, duplicates, errors, searchesRun: 1 };
  }

  private async importHomeowner(
    normalized: NormalizedHomeowner,
    city: string,
    permit: ShovelsPermit | null
  ): Promise<'imported' | 'duplicate' | 'skipped'> {
    if (!normalized.email && !normalized.phone && !normalized.fullName) return 'skipped';

    const rawPermitDate = permit?.start_date || permit?.file_date || permit?.first_seen_date || null;

    try {
      const existing = await prisma.homeowner.findUnique({
        where: { shovelsResidentId: normalized.shovelsResidentId },
      });

      if (existing) return 'duplicate';

      const created = await prisma.homeowner.create({
        data: {
          shovelsResidentId: normalized.shovelsResidentId,
          firstName: normalized.firstName,
          lastName: normalized.lastName,
          fullName: normalized.fullName,
          email: normalized.email || undefined,
          phone: normalized.phone,
          street: normalized.street,
          city: normalized.city || city,
          state: normalized.state,
          zipCode: normalized.zipCode,
          county: normalized.county,
          gender: normalized.gender,
          ageRange: normalized.ageRange,
          isMarried: normalized.isMarried,
          hasChildren: normalized.hasChildren,
          incomeRange: normalized.incomeRange,
          netWorth: normalized.netWorth,
          education: normalized.education,
          homeownerFlag: normalized.homeownerFlag,
          propertyValue: normalized.propertyValue,
          propertyType: normalized.propertyType,
          yearBuilt: normalized.yearBuilt,
          lotSize: normalized.lotSize,
          livingArea: normalized.livingArea,
          bedrooms: normalized.bedrooms,
          bathrooms: normalized.bathrooms,
          permitIds: normalized.permitIds,
          permitType: permit?.type || permit?.tags?.[0] || null,
          permitCity: city,
          geoId: normalized.geoId,
          permitDate: rawPermitDate,
          permitDateFriendly: computeDateFriendly(rawPermitDate),
          permitMonthsAgo: computeMonthsAgo(rawPermitDate),
          permitDescription: permit?.description || null,
          permitJobValue: permit?.job_value ?? null,
          permitStatus: permit?.status || null,
          permitNumber: permit?.number || null,
          permitFees: permit?.fees ?? null,
          permitJurisdiction: permit?.jurisdiction || null,
          source: 'shovels',
          dataSources: ['SHOVELS'],
          status: 'NEW',
          tags: [],
        },
      });

      if (permit?.contractor_id && normalized.permitIds[0]) {
        try {
          await connectionService.createConnectionFromPermit(
            created.id,
            permit.contractor_id,
            normalized.permitIds[0],
            permit
          );
        } catch (err: any) {
          logger.warn({ homeownerId: created.id, error: err.message }, 'Failed to create connection during import');
        }
      }

      return 'imported';
    } catch (err: any) {
      if (err.code === 'P2002') return 'duplicate';
      throw err;
    }
  }

  /**
   * Runs the homeowner scraper using settings.
   * When `homeownerUseShovelsGeoIds` is true, uses the same geo IDs
   * configured for the contractor (Shovels) scraper — so you only
   * configure geo IDs once and both scrapers share them.
   */
  async runFromSettings(): Promise<HomeownerRunResult> {
    const { settingsService } = await import('../settings/settings.service');
    const settings = await settingsService.getHomeownerSettings();
    const totals: HomeownerRunResult = {
      success: true, totalScraped: 0, totalImported: 0,
      duplicates: 0, errors: [], searchesRun: 0,
    };

    let geoIds = settings.geoIds;
    let locations = settings.locations;

    if (settings.useShovelsGeoIds) {
      const shovelsSettings = await settingsService.getShovelsSettings();
      geoIds = shovelsSettings.geoIds;
      locations = shovelsSettings.locations;
      logger.info(
        { geoIds, locations },
        'Homeowner scraper using shared Shovels geo IDs'
      );
    }

    if (geoIds.length === 0) {
      logger.warn('Homeowner scraper has no geo IDs configured (and Shovels geo IDs are empty)');
      return totals;
    }

    for (let i = 0; i < geoIds.length; i++) {
      const geoId = geoIds[i];
      const city = locations[i] || geoId;

      logger.info({ geoId, city }, 'Running homeowner scrape for geo');

      const result = await this.scrapeByGeoId(
        geoId,
        city,
        settings.maxResults,
        settings.fetchPermitDetails
      );

      totals.totalScraped += result.totalScraped;
      totals.totalImported += result.totalImported;
      totals.duplicates += result.duplicates;
      totals.errors.push(...result.errors);
      totals.searchesRun++;
    }

    if (settings.realieEnrich) {
      try {
        const { realieEnrichmentService } = await import('../enrichment/realie.service');
        const enrichResult = await realieEnrichmentService.enrichPendingHomeowners();
        logger.info(enrichResult, 'Realie enrichment completed after homeowner scrape');
      } catch (err: any) {
        logger.warn({ error: err.message }, 'Realie enrichment failed (non-blocking)');
      }
    }

    return totals;
  }
}

export const homeownerScraperService = new HomeownerScraperService();

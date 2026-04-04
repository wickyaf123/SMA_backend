import { createHash } from 'crypto';
import { shovelsClient, ShovelsCreditLimitError } from '../../integrations/shovels/client';
import { realieClient } from '../../integrations/realie/client';
import type { RealieProperty } from '../../integrations/realie/types';
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
  apiCallsMade: number;
  creditLimitHit?: boolean;
}

export class HomeownerScraperService {
  async scrapeByGeoId(
    geoId: string,
    city: string,
    maxResults: number,
    fetchPermitDetails: boolean = true,
    realieFallback: boolean = true
  ): Promise<HomeownerRunResult> {
    const callsBefore = shovelsClient.runCallCount;
    let totalScraped = 0;
    let totalImported = 0;
    let duplicates = 0;
    let creditLimitHit = false;
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
          if (err instanceof ShovelsCreditLimitError) {
            creditLimitHit = true;
            errors.push(`Credit limit reached: ${err.message}`);
            break;
          } else if (err.code === 'P2002') {
            duplicates++;
          } else {
            errors.push(`Resident ${resident.id}: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      if (err instanceof ShovelsCreditLimitError) {
        creditLimitHit = true;
        errors.push(`Credit limit reached: ${err.message}`);
        logger.warn({ geoId }, 'Homeowner scrape stopped — daily credit limit hit');
      } else {
        errors.push(`Shovels residents failed: ${err.message}`);
        logger.error({ err: err.message, geoId }, 'Shovels homeowner search failed');

        if (realieFallback) {
          logger.info({ geoId, city }, 'Attempting Realie fallback for homeowner discovery');
          try {
            const fallbackResult = await this.scrapeByGeoIdViaRealie(geoId, city, maxResults);
            totalScraped += fallbackResult.totalScraped;
            totalImported += fallbackResult.totalImported;
            duplicates += fallbackResult.duplicates;
            errors.push(...fallbackResult.errors);
          } catch (fallbackErr: any) {
            errors.push(`Realie fallback also failed: ${fallbackErr.message}`);
            logger.error({ err: fallbackErr.message, geoId }, 'Realie fallback failed');
          }
        }
      }
    }

    const apiCallsMade = shovelsClient.runCallCount - callsBefore;
    logger.info({ totalScraped, totalImported, duplicates, apiCallsMade, creditLimitHit, errors: errors.length }, 'Homeowner scrape complete');
    return { success: true, totalScraped, totalImported, duplicates, errors, searchesRun: 1, apiCallsMade, creditLimitHit };
  }

  private async importHomeowner(
    normalized: NormalizedHomeowner,
    city: string,
    permit: ShovelsPermit | null
  ): Promise<'imported' | 'duplicate' | 'skipped'> {
    if (!normalized.email && !normalized.phone && !normalized.fullName) return 'skipped';

    const rawPermitDate = permit?.issue_date || permit?.start_date || permit?.file_date || null;

    if (!rawPermitDate && permit?.first_seen_date) {
      logger.warn(
        { residentId: normalized.shovelsResidentId, first_seen_date: permit.first_seen_date },
        'Dropping first_seen_date as permit date fallback (field reset by Shovels Apr 2025)'
      );
    }

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
          permitDescriptionDerived: permit?.description_derived || null,
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
   * Fallback: discover homeowners via Realie when Shovels getResidents fails.
   * 
   * Two-tier approach:
   * 1. Try Shovels contractor search (different endpoint, may still be up)
   *    to get permit addresses in the target geo area
   * 2. If that also fails, pull addresses from existing DB records in that area
   * 
   * For each unique address, uses Realie lookupByAddress to discover
   * the property owner and creates a Homeowner record.
   */
  private async scrapeByGeoIdViaRealie(
    geoId: string,
    city: string,
    maxResults: number
  ): Promise<HomeownerRunResult> {
    const result: HomeownerRunResult = {
      success: true, totalScraped: 0, totalImported: 0,
      duplicates: 0, errors: [], searchesRun: 1, apiCallsMade: 0,
    };

    const addresses = await this.collectAddressesForFallback(geoId, city, maxResults);

    if (addresses.length === 0) {
      logger.warn({ geoId, city }, 'Realie fallback: no addresses found to look up');
      return result;
    }

    logger.info(
      { geoId, city, addressCount: addresses.length },
      'Realie fallback: looking up property owners for collected addresses'
    );

    for (const addr of addresses) {
      try {
        const property = await realieClient.lookupByAddress({
          state: addr.state,
          address: addr.street,
          city: addr.city || undefined,
          county: addr.county || undefined,
        });

        if (property?.ownerName) {
          result.totalScraped++;
          const importResult = await this.importHomeownerFromRealie(property, addr, geoId);
          if (importResult === 'imported') result.totalImported++;
          else if (importResult === 'duplicate') result.duplicates++;
        }

        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (err: any) {
        result.errors.push(`Realie lookup ${addr.street}: ${err.message}`);
      }
    }

    logger.info(
      { totalScraped: result.totalScraped, totalImported: result.totalImported, duplicates: result.duplicates },
      'Realie fallback scrape complete'
    );
    return result;
  }

  /**
   * Collect unique addresses for Realie fallback. Tries Shovels contractor
   * permits first (different endpoint), then falls back to existing DB data.
   */
  private async collectAddressesForFallback(
    geoId: string,
    city: string,
    maxResults: number
  ): Promise<Array<{ street: string; city: string; state: string; county: string | null }>> {
    const seen = new Set<string>();
    const addresses: Array<{ street: string; city: string; state: string; county: string | null }> = [];

    const addAddress = (street: string, addrCity: string, state: string, county: string | null) => {
      const key = `${street}|${state}`.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      addresses.push({ street, city: addrCity, state, county });
    };

    // Tier 1: try Shovels contractor permits (different endpoint, may still be up)
    try {
      const endDate = new Date().toISOString().split('T')[0];
      const startDate = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];

      const contractors = await shovelsClient.searchContractors(
        { geo_id: geoId, permit_from: startDate, permit_to: endDate, size: Math.min(maxResults, 50) },
        Math.min(maxResults, 50)
      );

      for (const contractor of contractors) {
        if (addresses.length >= maxResults) break;
        try {
          const permit = await shovelsClient.getMostRecentPermit(contractor.id);
          if (permit?.address?.street && permit?.address?.state) {
            const street = [permit.address.street_no, permit.address.street].filter(Boolean).join(' ');
            addAddress(
              street,
              permit.address.city || city,
              permit.address.state,
              permit.address.county || null,
            );
          }
          await new Promise(resolve => setTimeout(resolve, 150));
        } catch {
          // Skip this contractor, continue with others
        }
      }

      logger.info(
        { geoId, addressesFromPermits: addresses.length },
        'Realie fallback: collected addresses from Shovels contractor permits'
      );
    } catch (err: any) {
      logger.warn(
        { geoId, error: err.message },
        'Realie fallback: Shovels contractor search also failed, trying DB records'
      );
    }

    // Tier 2: pull addresses from existing homeowner records in this geo/city
    if (addresses.length < maxResults) {
      const remaining = maxResults - addresses.length;
      const existing = await prisma.homeowner.findMany({
        where: {
          OR: [
            { geoId },
            { city: { equals: city, mode: 'insensitive' } },
          ],
          street: { not: null },
          state: { not: null },
        },
        select: { street: true, city: true, state: true, county: true },
        take: remaining * 2,
        orderBy: { createdAt: 'desc' },
      });

      for (const row of existing) {
        if (addresses.length >= maxResults) break;
        if (row.street && row.state) {
          addAddress(row.street, row.city || city, row.state, row.county);
        }
      }

      if (existing.length > 0) {
        logger.info(
          { geoId, addressesFromDB: existing.length, totalAddresses: addresses.length },
          'Realie fallback: supplemented with addresses from existing DB records'
        );
      }
    }

    return addresses;
  }

  private async importHomeownerFromRealie(
    property: RealieProperty,
    addr: { street: string; city: string; state: string; county: string | null },
    geoId: string
  ): Promise<'imported' | 'duplicate' | 'skipped'> {
    if (!property.ownerName) return 'skipped';

    const syntheticId = `realie-${createHash('sha256').update(`${addr.street}|${addr.state}`.toLowerCase()).digest('hex').slice(0, 16)}`;

    try {
      const existing = await prisma.homeowner.findUnique({
        where: { shovelsResidentId: syntheticId },
      });
      if (existing) return 'duplicate';

      // Also check for an existing record at the same address to avoid true duplicates
      const addressMatch = await prisma.homeowner.findFirst({
        where: {
          street: { equals: addr.street, mode: 'insensitive' },
          state: { equals: addr.state, mode: 'insensitive' },
        },
      });
      if (addressMatch) return 'duplicate';

      const nameParts = property.ownerName.split(' ').filter(Boolean);
      const firstName = nameParts[0] || null;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

      await prisma.homeowner.create({
        data: {
          shovelsResidentId: syntheticId,
          firstName,
          lastName,
          fullName: property.ownerName,
          street: property.streetAddress || addr.street,
          city: property.city || addr.city,
          state: property.state || addr.state,
          zipCode: property.zipCode || null,
          county: property.county || addr.county,
          geoId,
          yearBuilt: property.yearBuilt?.toString() || null,
          bedrooms: property.totalBedrooms ?? null,
          bathrooms: property.totalBathrooms ? Math.floor(property.totalBathrooms) : null,
          livingArea: property.buildingArea?.toString() || null,
          // Pre-fill Realie enrichment data since we already have it
          realieEnriched: true,
          realieEnrichedAt: new Date(),
          assessedValue: property.totalAssessedValue ?? null,
          taxAmount: property.taxValue ?? null,
          avmValue: property.modelValue ?? null,
          avmMin: property.modelValueMin ?? null,
          avmMax: property.modelValueMax ?? null,
          ownerName: property.ownerName,
          totalBedrooms: property.totalBedrooms ?? null,
          totalBathrooms: property.totalBathrooms ?? null,
          buildingArea: property.buildingArea ?? null,
          stories: property.stories ?? null,
          hasPool: property.hasPool ?? null,
          hasGarage: property.hasGarage ?? null,
          garageCount: property.garageCount ?? null,
          fireplaceCount: property.fireplaceCount ?? null,
          constructionType: property.constructionType ?? null,
          roofType: property.roofType ?? null,
          foundationType: property.foundationType ?? null,
          lienCount: property.totalLienCount ?? null,
          lienBalance: property.totalLienBalance ?? null,
          equityEstimate: property.equityCurrentEstimateBalance ?? null,
          loanToValue: property.ltvCurrentEstimate ?? null,
          lastTransferDate: property.transferDate ?? null,
          lastTransferPrice: property.transferPrice ?? null,
          latitude: property.latitude ?? null,
          longitude: property.longitude ?? null,
          realieRawData: property as any,
          source: 'realie',
          dataSources: ['REALIE'],
          status: 'NEW',
          tags: [],
        },
      });

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

    const shovelsSettings = await settingsService.getShovelsSettings();
    shovelsClient.setDailyCreditLimit(shovelsSettings.maxDailyCredits);
    shovelsClient.resetRunCounter();

    const totals: HomeownerRunResult = {
      success: true, totalScraped: 0, totalImported: 0,
      duplicates: 0, errors: [], searchesRun: 0, apiCallsMade: 0,
    };

    let geoIds = settings.geoIds;
    let locations = settings.locations;

    if (settings.useShovelsGeoIds) {
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
      if (totals.creditLimitHit) break;

      const geoId = geoIds[i];
      const city = locations[i] || geoId;

      logger.info({ geoId, city }, 'Running homeowner scrape for geo');

      const result = await this.scrapeByGeoId(
        geoId,
        city,
        settings.maxResults,
        settings.fetchPermitDetails,
        settings.realieFallback
      );

      totals.totalScraped += result.totalScraped;
      totals.totalImported += result.totalImported;
      totals.duplicates += result.duplicates;
      totals.errors.push(...result.errors);
      totals.searchesRun++;
      totals.apiCallsMade += result.apiCallsMade;
      if (result.creditLimitHit) totals.creditLimitHit = true;
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

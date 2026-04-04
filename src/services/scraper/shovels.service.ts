import { shovelsClient, ShovelsCreditLimitError } from '../../integrations/shovels/client';
import type { ShovelsSearchParams } from '../../integrations/shovels/types';
import { normalizeContractor, normalizeEmployee, passesEmployeeFilter } from '../../integrations/shovels/normalizer';
import type { EmployeeFilterConfig } from '../../integrations/shovels/normalizer';
import { filterRelevantContractors } from '../validation/relevance.service';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import { getZipsForCity } from '../../data/geo-ids';

export interface ShovelsRunResult {
  success: boolean;
  totalScraped: number;
  totalImported: number;
  duplicates: number;
  filtered: number;
  errors: string[];
  searchesRun: number;
  /** How many Shovels API calls this run consumed. */
  apiCallsMade: number;
  /** When scraping yields no rows, explains geo strategies tried (city slug, local zips, zippopotam). */
  diagnostics?: string;
  /** True when the scrape was stopped early via cancelJob(). */
  wasCancelled?: boolean;
  /** True when the job stopped because the daily credit limit was reached. */
  creditLimitHit?: boolean;
}

export type ScrapeProgressPhase = 'searching' | 'importing' | 'enriching' | 'building_sheet';

export interface ScrapeProgressEvent {
  phase: ScrapeProgressPhase;
  imported: number;
  duplicates: number;
  filtered: number;
  totalContractors?: number;
  contractorIndex?: number;
  message?: string;
}

export type OnScrapeProgress = (event: ScrapeProgressEvent) => void;

/**
 * Pause/cancel signals for running permit searches.
 * Uses Redis for persistence (survives restarts) with a local Map cache for fast reads.
 */
import { redis } from '../../config/redis';

const JOB_SIGNAL_PREFIX = 'job:signal:';
const JOB_SIGNAL_TTL = 3600; // 1 hour

// Local write-through cache for fast synchronous reads
const localCache = new Map<string, 'paused' | 'cancelled'>();

export function pauseJob(jobId: string): void {
  localCache.set(jobId, 'paused');
  redis.set(`${JOB_SIGNAL_PREFIX}${jobId}`, 'paused', 'EX', JOB_SIGNAL_TTL).catch(() => {});
}

export function resumeJob(jobId: string): void {
  localCache.delete(jobId);
  redis.del(`${JOB_SIGNAL_PREFIX}${jobId}`).catch(() => {});
}

export function cancelJob(jobId: string): void {
  localCache.set(jobId, 'cancelled');
  redis.set(`${JOB_SIGNAL_PREFIX}${jobId}`, 'cancelled', 'EX', JOB_SIGNAL_TTL).catch(() => {});
}

export function getJobSignal(jobId: string): 'paused' | 'cancelled' | undefined {
  return localCache.get(jobId);
}

export function clearJobSignal(jobId: string): void {
  localCache.delete(jobId);
  redis.del(`${JOB_SIGNAL_PREFIX}${jobId}`).catch(() => {});
}

/** Restore signals from Redis on startup (called once) */
export async function restoreJobSignals(): Promise<void> {
  try {
    const keys = await redis.keys(`${JOB_SIGNAL_PREFIX}*`);
    for (const key of keys) {
      const val = await redis.get(key);
      if (val === 'paused' || val === 'cancelled') {
        const jobId = key.slice(JOB_SIGNAL_PREFIX.length);
        localCache.set(jobId, val);
      }
    }
  } catch {
    // Non-fatal — signals just won't be restored
  }
}

async function waitWhilePaused(jobId: string): Promise<boolean> {
  while (localCache.get(jobId) === 'paused') {
    await new Promise((r) => setTimeout(r, 500));
  }
  return localCache.get(jobId) === 'cancelled';
}

export class ShovelsScraperService {
  async scrapeByPermitTypeAndGeo(
    permitType: string,
    geoId: string,
    city: string,
    dateRangeDays: number,
    maxResults: number,
    enableEmployees: boolean,
    employeeFilter?: EmployeeFilterConfig,
    seenContractorIds?: Set<string>,
    onProgress?: OnScrapeProgress,
    jobId?: string,
    maxEmployeesPerContractor: number = 10
  ): Promise<ShovelsRunResult> {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - dateRangeDays * 86400000)
      .toISOString().split('T')[0];

    const callsBefore = shovelsClient.runCallCount;
    let totalScraped = 0;
    let totalImported = 0;
    let duplicates = 0;
    let filtered = 0;
    let wasCancelled = false;
    let creditLimitHit = false;
    const errors: string[] = [];

    try {
      const { contractors: allContractors, tagFallbackUsed } = await this.searchWithTagFallback(
        permitType, geoId, startDate, endDate, maxResults
      );

      totalScraped = allContractors.length;

      const { relevant, rejected } = filterRelevantContractors(allContractors, permitType);
      filtered = rejected.length;

      if (allContractors.length > 0 && relevant.length === 0) {
        const sample = rejected.slice(0, 5).map(r =>
          `${r.contractor.business_name || r.contractor.name || r.contractor.id} (score=${r.result.score})`
        );
        logger.warn(
          { permitType, geoId, apiReturned: allContractors.length, tagFallbackUsed, sample },
          'ALL contractors filtered out — API returned results but 0 passed relevance threshold'
        );
      }

      // Cross-zip dedup: skip contractors already processed in a previous zip
      const contractors = seenContractorIds
        ? relevant.filter((c) => {
            if (seenContractorIds.has(c.id)) {
              duplicates++;
              return false;
            }
            seenContractorIds.add(c.id);
            return true;
          })
        : relevant;

      logger.info(
        { totalScraped, relevant: relevant.length, deduped: contractors.length, filtered, permitType, geoId },
        'Shovels search returned contractors (after relevance + cross-zip dedup)'
      );

      const displayTotal = Math.min(contractors.length, maxResults);
      onProgress?.({
        phase: 'importing',
        imported: totalImported,
        duplicates,
        filtered,
        totalContractors: displayTotal,
        contractorIndex: 0,
        message: `Found ${displayTotal} contractors, importing contacts...`,
      });

      for (let ci = 0; ci < contractors.length; ci++) {
        if (totalImported >= maxResults) {
          logger.info({ totalImported, maxResults, ci, total: contractors.length }, 'Reached maxResults limit, stopping import');
          break;
        }

        if (jobId) {
          const cancelled = await waitWhilePaused(jobId);
          if (cancelled) {
            logger.info({ jobId, ci, total: contractors.length }, 'Job cancelled during import');
            wasCancelled = true;
            break;
          }
        }

        const contractor = contractors[ci];
        try {
          const mostRecentPermit = await shovelsClient.getMostRecentPermit(contractor.id);

          let employees = enableEmployees
            ? await shovelsClient.getEmployees(contractor.id, maxEmployeesPerContractor)
            : [];

          if (employees.length > 0 && employeeFilter) {
            const beforeCount = employees.length;
            employees = employees.filter(emp => passesEmployeeFilter(emp, employeeFilter));
            const filteredCount = beforeCount - employees.length;
            if (filteredCount > 0) {
              logger.info(
                { contractorId: contractor.id, total: beforeCount, passed: employees.length, filtered: filteredCount },
                'Employee seniority/department filter applied'
              );
            }
          }

          if (employees.length > 0) {
            for (const employee of employees) {
              if (totalImported >= maxResults) break;
              const normalized = normalizeEmployee(contractor, employee, { permitType, city }, mostRecentPermit);
              const result = await this.importContact(normalized, jobId);
              if (result === 'imported') totalImported++;
              else if (result === 'duplicate') duplicates++;
            }
          } else {
            const normalized = normalizeContractor(contractor, { permitType, city }, mostRecentPermit);
            const result = await this.importContact(normalized, jobId);
            if (result === 'imported') totalImported++;
            else if (result === 'duplicate') duplicates++;
          }

          if ((ci + 1) % 3 === 0 || ci === contractors.length - 1) {
            onProgress?.({
              phase: 'importing',
              imported: totalImported,
              duplicates,
              filtered,
              totalContractors: displayTotal,
              contractorIndex: Math.min(ci + 1, displayTotal),
              message: `Processing contractor ${Math.min(ci + 1, displayTotal)} of ${displayTotal}...`,
            });
          }
        } catch (err: any) {
          if (err instanceof ShovelsCreditLimitError) {
            creditLimitHit = true;
            errors.push(`Credit limit reached: ${err.message}`);
            logger.warn({ contractorIndex: ci }, 'Shovels credit limit hit during contractor processing');
            break;
          } else if (err.code === 'P2002') {
            duplicates++;
          } else {
            errors.push(`Contractor ${contractor.id}: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      if (err instanceof ShovelsCreditLimitError) {
        creditLimitHit = true;
        errors.push(`Credit limit reached: ${err.message}`);
        logger.warn({ permitType, geoId }, 'Shovels scrape stopped — daily credit limit hit');
      } else {
        errors.push(`Search failed: ${err.message}`);
        logger.error({ err: err.message, permitType, geoId }, 'Shovels search failed');
      }
    }

    const apiCallsMade = shovelsClient.runCallCount - callsBefore;
    logger.info({ totalScraped, totalImported, duplicates, filtered, wasCancelled, creditLimitHit, apiCallsMade, errors: errors.length }, 'Shovels scrape complete');
    return { success: errors.length === 0, totalScraped, totalImported, duplicates, filtered, errors, searchesRun: 1, apiCallsMade, wasCancelled, creditLimitHit };
  }

  private isTransientSearchError(err: any): boolean {
    const status = err.response?.status;
    if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return true;
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') return true;
    return false;
  }

  /**
   * Search with tag fallback: if the tagged query returns 0 results,
   * retry without the tag parameter and rely on relevance filter.
   */
  private async searchWithTagFallback(
    permitType: string,
    geoId: string,
    startDate: string,
    endDate: string,
    maxResults: number
  ): Promise<{ contractors: Awaited<ReturnType<typeof shovelsClient.searchContractors>>; tagFallbackUsed: boolean }> {
    const baseParams = {
      geo_id: geoId,
      permit_from: startDate,
      permit_to: endDate,
      size: Math.min(maxResults, 100),
    };

    // Attempt 1: Search with tag
    const tagged = await this.searchContractorsWithRetry({
      ...baseParams,
      tags: permitType.toLowerCase(),
    }, maxResults);

    if (tagged.length > 0) {
      logger.info(
        { permitType, geoId, count: tagged.length },
        'Tag search returned results'
      );
      return { contractors: tagged, tagFallbackUsed: false };
    }

    // Attempt 2: Broad geo search without tag, rely on relevance filter
    logger.info(
      { permitType, geoId },
      'Tag search returned 0 results, retrying without tag (broad geo search)'
    );
    const untagged = await this.searchContractorsWithRetry(baseParams, maxResults);
    logger.info(
      { permitType, geoId, count: untagged.length },
      'Tagless fallback search returned results'
    );
    return { contractors: untagged, tagFallbackUsed: true };
  }

  /** Retries up to 2 times (3 attempts total) with 2s then 4s backoff on transient API failures. */
  private async searchContractorsWithRetry(
    params: Omit<ShovelsSearchParams, 'cursor'>,
    maxResults?: number
  ): Promise<Awaited<ReturnType<typeof shovelsClient.searchContractors>>> {
    const maxAttempts = 3;
    const backoffMs = [2000, 4000];
    let lastErr: any;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await shovelsClient.searchContractors(params, maxResults);
      } catch (err: any) {
        lastErr = err;
        const transient = this.isTransientSearchError(err);
        if (!transient || attempt === maxAttempts - 1) throw err;
        const waitMs = backoffMs[attempt];
        logger.warn(
          {
            attempt: attempt + 1,
            retriesRemaining: maxAttempts - attempt - 1,
            waitMs,
            status: err.response?.status,
            code: err.code,
            permitType: params.tags,
            geoId: params.geo_id,
          },
          'Shovels searchContractors transient error, retrying after backoff'
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
      }
    }
    throw lastErr;
  }

  private async importContact(normalized: any, permitSearchId?: string): Promise<'imported' | 'duplicate' | 'skipped'> {
    if (!normalized.email && !normalized.phone) return 'skipped';

    try {
      let existing: any = null;

      if (normalized.email) {
        existing = await prisma.contact.findUnique({
          where: { email: normalized.email },
        });
      } else {
        existing = await prisma.contact.findFirst({
          where: {
            phone: normalized.phone,
            shovelsContractorId: normalized.shovelsContractorId,
          },
        });
      }

      if (existing) {
        const newPermitTag = normalized.permitType ? `permit:${normalized.permitType}` : null;
        const existingTags: string[] = existing.tags || [];
        const needsTagUpdate = newPermitTag && !existingTags.includes(newPermitTag);

        if (needsTagUpdate) {
          await prisma.contact.update({
            where: { id: existing.id },
            data: {
              tags: { push: newPermitTag },
              permitType: normalized.permitType,
            },
          });
          logger.info(
            { contactId: existing.id, newPermitTag, permitType: normalized.permitType },
            'Duplicate contact updated with new permit type tag'
          );
        }
        return 'duplicate';
      }

      let company = await prisma.company.findFirst({
        where: {
          name: normalized.companyName,
          ...(normalized.companyState ? { state: normalized.companyState } : {}),
        },
      });

      if (!company) {
        company = await prisma.company.create({
          data: {
            name: normalized.companyName,
            city: normalized.companyCity,
            state: normalized.companyState,
            revenue: normalized.companyRevenue,
            dataSources: ['SHOVELS'],
          },
        });
      } else if (normalized.companyRevenue && !company.revenue) {
        await prisma.company.update({
          where: { id: company.id },
          data: { revenue: normalized.companyRevenue },
        });
      }

      await prisma.contact.create({
        data: {
          email: normalized.email || undefined,
          firstName: normalized.firstName,
          lastName: normalized.lastName,
          fullName: normalized.fullName,
          phone: normalized.phone,
          title: normalized.title,
          city: normalized.city,
          state: normalized.state,
          source: 'shovels',
          shovelsContractorId: normalized.shovelsContractorId,
          shovelsEmployeeId: normalized.shovelsEmployeeId,
          permitType: normalized.permitType,
          permitCity: normalized.permitCity,
          licenseNumber: normalized.licenseNumber,
          // Promoted permit fields
          permitDate: normalized.permitDate,
          permitDateFriendly: normalized.permitDateFriendly,
          permitMonthsAgo: normalized.permitMonthsAgo,
          permitDescription: normalized.permitDescription,
          permitDescriptionDerived: normalized.permitDescriptionDerived,
          permitStatus: normalized.permitStatus,
          permitNumber: normalized.permitNumber,
          permitJobValue: normalized.permitJobValue,
          permitFees: normalized.permitFees,
          permitJurisdiction: normalized.permitJurisdiction,
          // Promoted contractor fields
          avgJobValue: normalized.avgJobValue,
          totalJobValue: normalized.totalJobValue,
          permitCount: normalized.permitCount,
          revenue: normalized.revenue,
          employeeCount: normalized.employeeCount,
          website: normalized.website,
          rating: normalized.rating,
          reviewCount: normalized.reviewCount,
          seniorityLevel: normalized.seniorityLevel,
          department: normalized.department,
          tagTally: normalized.tagTally || undefined,
          enrichmentData: normalized.enrichmentData,
          companyId: company.id,
          permitSearchId: permitSearchId || null,
          dataSources: ['SHOVELS'],
          tags: [
            ...(normalized.email ? [] : ['no_individual_contact']),
            ...(normalized.permitType ? [`permit:${normalized.permitType}`] : []),
          ],
          status: 'NEW',
        },
      });

      return 'imported';
    } catch (err: any) {
      if (err.code === 'P2002') return 'duplicate';
      throw err;
    }
  }

  async runFromSettings(): Promise<ShovelsRunResult> {
    const { settingsService } = await import('../settings/settings.service');
    const settings = await settingsService.getShovelsSettings();

    shovelsClient.setDailyCreditLimit(settings.maxDailyCredits);
    shovelsClient.resetRunCounter();

    const creditsUsedBefore = await shovelsClient.getCreditsUsedToday();
    logger.info(
      { dailyLimit: settings.maxDailyCredits, creditsUsedToday: creditsUsedBefore },
      'Shovels credit budget check before run'
    );

    const totals: ShovelsRunResult = {
      success: true, totalScraped: 0, totalImported: 0,
      duplicates: 0, filtered: 0, errors: [], searchesRun: 0, apiCallsMade: 0,
    };

    for (const permitType of settings.permitTypes) {
      if (totals.creditLimitHit) break;

      for (let i = 0; i < settings.geoIds.length; i++) {
        if (totals.creditLimitHit) break;

        const geoId = settings.geoIds[i];
        const city = settings.locations[i] || geoId;

        logger.info({ permitType, geoId, city }, 'Running Shovels scrape for permit type + geo');

        const result = await this.scrapeByPermitTypeAndGeo(
          permitType, geoId, city,
          settings.dateRangeDays,
          settings.maxResults,
          settings.enableEmployees,
          settings.employeeFilter,
          undefined,
          undefined,
          undefined,
          settings.maxEmployeesPerContractor
        );

        totals.totalScraped += result.totalScraped;
        totals.totalImported += result.totalImported;
        totals.duplicates += result.duplicates;
        totals.filtered += result.filtered;
        totals.errors.push(...result.errors);
        totals.searchesRun++;
        totals.apiCallsMade += result.apiCallsMade;
        if (result.creditLimitHit) totals.creditLimitHit = true;
      }
    }

    const snapshot = await shovelsClient.getCreditSnapshot();
    logger.info(
      { ...snapshot, runApiCalls: totals.apiCallsMade, creditLimitHit: !!totals.creditLimitHit },
      'Shovels run complete — credit usage summary'
    );

    return totals;
  }

  private mergeShovelsResults(...parts: ShovelsRunResult[]): ShovelsRunResult {
    const merged: ShovelsRunResult = {
      success: true,
      totalScraped: 0,
      totalImported: 0,
      duplicates: 0,
      filtered: 0,
      errors: [],
      searchesRun: 0,
      apiCallsMade: 0,
    };
    for (const p of parts) {
      merged.totalScraped += p.totalScraped;
      merged.totalImported += p.totalImported;
      merged.duplicates += p.duplicates;
      merged.filtered += p.filtered;
      merged.errors.push(...p.errors);
      merged.searchesRun += p.searchesRun;
      merged.apiCallsMade += p.apiCallsMade;
      if (p.wasCancelled) merged.wasCancelled = true;
      if (p.creditLimitHit) merged.creditLimitHit = true;
    }
    merged.success = merged.errors.length === 0;
    return merged;
  }

  private static readonly ZIP_THROTTLE_MS = 150;

  private async scrapeByZipGeoIds(
    permitType: string,
    zips: string[],
    cityName: string,
    dateRangeDays: number,
    maxResults: number,
    enableEmployees: boolean,
    employeeFilter?: EmployeeFilterConfig,
    seenContractorIds?: Set<string>,
    onProgress?: OnScrapeProgress,
    jobId?: string,
    maxEmployeesPerContractor: number = 10
  ): Promise<ShovelsRunResult> {
    const totals: ShovelsRunResult = {
      success: true,
      totalScraped: 0,
      totalImported: 0,
      duplicates: 0,
      filtered: 0,
      errors: [],
      searchesRun: 0,
      apiCallsMade: 0,
    };
    const seen = seenContractorIds ?? new Set<string>();
    const perZip = Math.ceil(maxResults / Math.max(zips.length, 1));
    for (let i = 0; i < zips.length; i++) {
      if (totals.totalImported >= maxResults) {
        logger.info({ totalImported: totals.totalImported, maxResults, zipsSearched: i, totalZips: zips.length }, 'Reached maxResults limit across zips, stopping');
        break;
      }

      if (jobId) {
        const cancelled = await waitWhilePaused(jobId);
        if (cancelled) {
          logger.info({ jobId, zipsSearched: i, totalZips: zips.length }, 'Job cancelled between zip iterations');
          totals.wasCancelled = true;
          break;
        }
      }

      if (i > 0) {
        await new Promise((r) => setTimeout(r, ShovelsScraperService.ZIP_THROTTLE_MS));
      }

      const remaining = maxResults - totals.totalImported;
      const zipLimit = Math.min(perZip, remaining);

      const cumulativeOnProgress: OnScrapeProgress | undefined = onProgress
        ? (event) => {
            onProgress({
              ...event,
              imported: totals.totalImported + event.imported,
              duplicates: totals.duplicates + event.duplicates,
              filtered: totals.filtered + event.filtered,
            });
          }
        : undefined;

      const result = await this.scrapeByPermitTypeAndGeo(
        permitType,
        zips[i],
        cityName,
        dateRangeDays,
        zipLimit,
        enableEmployees,
        employeeFilter,
        seen,
        cumulativeOnProgress,
        jobId,
        maxEmployeesPerContractor
      );
      totals.totalScraped += result.totalScraped;
      totals.totalImported += result.totalImported;
      totals.duplicates += result.duplicates;
      totals.filtered += result.filtered;
      totals.errors.push(...result.errors);
      totals.searchesRun += result.searchesRun;
      totals.apiCallsMade += result.apiCallsMade;
      if (result.wasCancelled) totals.wasCancelled = true;
      if (result.creditLimitHit) {
        totals.creditLimitHit = true;
        break;
      }
    }
    totals.success = totals.errors.length === 0;
    return totals;
  }

  /**
   * Resolve a city name to zip codes using the free Zippopotam.us API.
   * Falls back to an empty array if the API is unavailable.
   */
  async resolveZipCodesForCity(city: string, stateAbbr: string): Promise<string[]> {
    try {
      const { default: axios } = await import('axios');
      const response = await axios.get(
        `https://api.zippopotam.us/us/${stateAbbr}/${encodeURIComponent(city)}`,
        { timeout: 10000 }
      );
      const places: Array<{ 'post code': string }> = response.data?.places || [];
      const zips = places.map(p => p['post code']);
      logger.info({ city, stateAbbr, zipCount: zips.length }, 'Resolved city to zip codes');
      return zips;
    } catch (err: any) {
      logger.warn({ city, stateAbbr, error: err.message }, 'Failed to resolve city to zip codes');
      return [];
    }
  }

  /**
   * Scrape by city name: local zip dictionary → zippopotam.us zips → city slug (last resort).
   *
   * City slug (e.g. "austin-tx") is tried LAST because the Shovels API typically
   * returns 422 for that format, wasting an API call on every search.
   */
  async scrapeByCity(
    permitType: string,
    cityName: string,
    stateAbbr: string,
    dateRangeDays: number,
    maxResults: number,
    enableEmployees: boolean,
    employeeFilter?: EmployeeFilterConfig,
    onProgress?: OnScrapeProgress,
    jobId?: string,
    maxEmployeesPerContractor: number = 10
  ): Promise<ShovelsRunResult> {
    const diagLines: string[] = [];
    const seenContractorIds = new Set<string>();
    const emptyResult: ShovelsRunResult = {
      success: true, totalScraped: 0, totalImported: 0,
      duplicates: 0, filtered: 0, errors: [], searchesRun: 0, apiCallsMade: 0,
    };
    let accumulated = emptyResult;

    // Tier 1: Local zip dictionary (fastest, no wasted API calls)
    const localZips = getZipsForCity(cityName, stateAbbr);
    if (localZips.length > 0) {
      const preview = localZips.slice(0, 8).join(', ');
      diagLines.push(
        `1) Local dictionary: ${localZips.length} zip(s) [${preview}${localZips.length > 8 ? ', …' : ''}].`
      );
      onProgress?.({
        phase: 'searching',
        imported: 0,
        duplicates: 0,
        filtered: 0,
        message: `Searching ${localZips.length} zip codes in ${cityName}...`,
      });

      const localTotals = await this.scrapeByZipGeoIds(
        permitType, localZips, cityName, dateRangeDays,
        maxResults, enableEmployees, employeeFilter, seenContractorIds, onProgress, jobId, maxEmployeesPerContractor
      );
      accumulated = localTotals;
      diagLines.push(
        `   After local zip searches: ${localTotals.totalScraped} raw row(s) (aggregate).`
      );
      if (accumulated.totalScraped > 0) {
        logger.info(
          { cityName, stateAbbr, localZipCount: localZips.length, totalScraped: accumulated.totalScraped },
          'Local dictionary zip expansion returned results'
        );
        return accumulated;
      }
    } else {
      diagLines.push('1) Local dictionary: no zip list for this city/state key.');
    }

    // Tier 2: Zippopotam.us API (discover zips not in local dictionary)
    logger.info({ cityName, stateAbbr }, 'Local dictionary yielded 0 results, falling back to zippopotam.us');
    const localSet = new Set(localZips);
    const apiZips = await this.resolveZipCodesForCity(cityName, stateAbbr);
    const apiZipsDeduped = apiZips.filter((z) => !localSet.has(z));

    if (apiZipsDeduped.length > 0) {
      diagLines.push(`2) Zippopotam.us: ${apiZipsDeduped.length} zip(s) to search (deduped vs local).`);
      onProgress?.({
        phase: 'searching',
        imported: accumulated.totalImported,
        duplicates: accumulated.duplicates,
        filtered: accumulated.filtered,
        message: `Expanding search to ${apiZipsDeduped.length} additional zip codes...`,
      });

      const apiTotals = await this.scrapeByZipGeoIds(
        permitType, apiZipsDeduped, cityName, dateRangeDays,
        maxResults, enableEmployees, employeeFilter, seenContractorIds, onProgress, jobId, maxEmployeesPerContractor
      );
      accumulated = this.mergeShovelsResults(accumulated, apiTotals);
      diagLines.push(
        `   After zippopotam zip searches: ${apiTotals.totalScraped} raw row(s) (aggregate).`
      );
      if (accumulated.totalScraped > 0) {
        logger.info(
          { cityName, stateAbbr, zipsSearched: apiZipsDeduped.length, totalScraped: accumulated.totalScraped },
          'City zip expansion (zippopotam) scrape complete'
        );
        return accumulated;
      }
    } else if (apiZips.length > 0 && localZips.length > 0) {
      diagLines.push('2) Zippopotam.us: returned zip(s) but all overlapped local dictionary (nothing new).');
    } else {
      diagLines.push(
        apiZips.length === 0
          ? '2) Zippopotam.us: no zips resolved (API miss, timeout, or unknown city spelling).'
          : '2) Zippopotam.us: no additional zips after dedupe.'
      );
    }

    // Tier 3: City slug as last-resort heuristic (often returns 422)
    const cityGeoId = `${cityName.toLowerCase().replace(/\s+/g, '-')}-${stateAbbr.toLowerCase()}`;
    logger.info({ cityGeoId }, 'Zip strategies exhausted, trying city slug as last resort');
    const slugResult = await this.scrapeByPermitTypeAndGeo(
      permitType, cityGeoId, cityName, dateRangeDays, maxResults, enableEmployees, employeeFilter, seenContractorIds, onProgress, jobId, maxEmployeesPerContractor
    );
    diagLines.push(
      `3) City slug "${cityGeoId}": ${slugResult.totalScraped} raw row(s).`
    );
    if (slugResult.totalScraped > 0) {
      return this.mergeShovelsResults(accumulated, slugResult);
    }

    diagLines.push(
      'Empty outcome: local zips, zippopotam zips, and city slug all returned no rows.'
    );
    const diagnostics = diagLines.join(' ');
    logger.warn({ cityName, stateAbbr, diagnostics }, 'scrapeByCity: no results after all geo fallbacks');
    return { ...this.mergeShovelsResults(accumulated, slugResult), diagnostics };
  }
}

export const shovelsScraperService = new ShovelsScraperService();

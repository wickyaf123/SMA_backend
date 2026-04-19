import axios, { AxiosInstance } from 'axios';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import { recordCredits, assertCreditBudget, getCreditsUsedToday, ShovelsCreditLimitError } from './credit-tracker';
import type {
  ShovelsSearchParams,
  ShovelsContractor,
  ShovelsEmployee,
  ShovelsPermit,
  ShovelsResident,
  ShovelsAddressSearchResult,
  ShovelsApiResponse,
  ShovelsUsageResponse,
  ShovelsQuotaStatus,
} from './types';

export { ShovelsCreditLimitError };

export class ShovelsClient {
  private client: AxiosInstance;
  private dailyCreditLimit: number = 0;
  /** Per-run counter for embedding in job results */
  private _runCallCount: number = 0;

  constructor() {
    this.client = axios.create({
      baseURL: config.shovels.baseUrl,
      timeout: 30000,
      headers: {
        'X-API-Key': config.shovels.apiKey,
        'Content-Type': 'application/json',
      },
    });

    this.client.interceptors.response.use(
      (res) => res,
      (error) => {
        const status = error.response?.status;
        const msg = error.response?.data?.detail || error.message;
        logger.error({ status, msg, url: error.config?.url }, 'Shovels API error');
        throw error;
      }
    );
  }

  /** Set the daily credit cap (call once at job start from DB settings). 0 = unlimited. */
  setDailyCreditLimit(limit: number): void {
    this.dailyCreditLimit = limit;
  }

  /**
   * Deprecated — kept as a no-op so legacy callers compile. Previously this
   * reset a global counter, but callers are expected to concurrently run
   * searches and the global reset corrupted the delta accounting for other
   * in-flight jobs. Per-job accounting is now done via
   * `const before = runCallCount; ...; const delta = runCallCount - before;`
   * which is race-safe because the counter is monotonically increasing.
   */
  resetRunCounter(): void {
    // intentional no-op
  }

  /** Monotonically increasing API-call counter across the process lifetime. */
  get runCallCount(): number {
    return this._runCallCount;
  }

  /** Get today's total credit usage across all runs. */
  async getCreditsUsedToday(): Promise<number> {
    return getCreditsUsedToday();
  }

  /**
   * Gate-kept API call: checks budget, makes the request, records the credit.
   * All public methods should use this instead of `this.client.get` directly.
   */
  private async trackedGet<T>(url: string, params?: Record<string, any>): Promise<T> {
    await assertCreditBudget(this.dailyCreditLimit);
    const response = await this.client.get<T>(url, { params });
    this._runCallCount++;
    await recordCredits(1);
    return response.data;
  }

  async searchContractors(params: Omit<ShovelsSearchParams, 'cursor'>, maxResults?: number): Promise<ShovelsContractor[]> {
    const results: ShovelsContractor[] = [];
    let cursor: string | undefined;

    do {
      const data = await this.trackedGet<ShovelsApiResponse<ShovelsContractor>>(
        '/contractors/search',
        { ...params, cursor, size: params.size || 50 }
      );
      results.push(...data.items);
      if (maxResults && results.length >= maxResults) {
        break;
      }
      cursor = data.next_cursor ?? undefined;
    } while (cursor);

    const trimmed = maxResults ? results.slice(0, maxResults) : results;
    logger.info({ total: trimmed.length, tags: params.tags, geoId: params.geo_id }, 'Shovels contractor search complete');
    return trimmed;
  }

  async getEmployees(contractorId: string, maxResults: number = 10): Promise<ShovelsEmployee[]> {
    const results: ShovelsEmployee[] = [];
    let cursor: string | undefined;

    do {
      const data = await this.trackedGet<ShovelsApiResponse<ShovelsEmployee>>(
        `/contractors/${contractorId}/employees`,
        { cursor, size: Math.min(maxResults, 50) }
      );
      results.push(...data.items);
      if (results.length >= maxResults) break;
      cursor = data.next_cursor ?? undefined;
    } while (cursor);

    return results.slice(0, maxResults);
  }

  async getMostRecentPermit(contractorId: string): Promise<ShovelsPermit | null> {
    try {
      const data = await this.trackedGet<ShovelsApiResponse<ShovelsPermit>>(
        `/contractors/${contractorId}/permits`,
        { size: 1 }
      );
      const permit = data.items[0] || null;

      if (permit) {
        logger.info(
          {
            contractorId,
            permitId: permit.id,
            start_date: permit.start_date,
            file_date: permit.file_date,
            issue_date: permit.issue_date,
            first_seen_date: permit.first_seen_date,
            resolvedPermitDate: permit.issue_date || permit.file_date || permit.start_date || permit.first_seen_date || null,
          },
          'Shovels permit date fields (raw response diagnostic)'
        );
      }

      return permit;
    } catch (err: any) {
      if (err instanceof ShovelsCreditLimitError) throw err;
      logger.warn({ contractorId, error: err.message }, 'Failed to fetch permits for contractor');
      return null;
    }
  }

  /**
   * Fetch residents for a geo_id (zip code or city identifier).
   * Returns both the parsed results and logs the raw response for field inspection.
   */
  async getResidents(
    geoId: string,
    params?: { size?: number; cursor?: string; tags?: string; maxResults?: number }
  ): Promise<{ residents: ShovelsResident[]; rawSample: any }> {
    const results: ShovelsResident[] = [];
    let rawSample: any = null;
    const maxResults = params?.maxResults;
    const pageSize = params?.size || 50;

    try {
      let cursor: string | undefined = params?.cursor;
      do {
        const data = await this.trackedGet<ShovelsApiResponse<ShovelsResident>>(
          `/addresses/${geoId}/residents`,
          { size: pageSize, cursor, tags: params?.tags }
        );

        if (!rawSample) rawSample = data;
        results.push(...data.items);

        if (results.length === data.items.length && results.length > 0) {
          const sample = results[0];
          logger.info(
            {
              geoId,
              totalReturned: results.length,
              totalCount: data.total_count,
              sampleFields: Object.keys(sample),
              sampleRecord: sample,
            },
            'Shovels residents endpoint — raw sample response (diagnostic)'
          );
        }

        if (maxResults && results.length >= maxResults) break;
        cursor = data.next_cursor ?? undefined;
      } while (cursor);

      if (results.length === 0) {
        logger.warn({ geoId }, 'Shovels residents endpoint returned 0 results');
      }

      const trimmed = maxResults ? results.slice(0, maxResults) : results;
      return { residents: trimmed, rawSample };
    } catch (err: any) {
      if (err instanceof ShovelsCreditLimitError) throw err;
      logger.error({ geoId, error: err.message, status: err.response?.status }, 'Shovels residents endpoint failed');
      throw err;
    }
  }

  /**
   * Test city-level geo_id coverage by comparing city results against zip-level results.
   * Runs a small search at the city level and at individual zips, then logs the difference.
   */
  async testCityGeoIdCoverage(
    cityGeoId: string,
    zipCodes: string[],
    tags?: string
  ): Promise<{
    cityGeoIdCount: number;
    zipTotalCount: number;
    zipBreakdown: Record<string, number>;
    coveragePercent: number;
  }> {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - 365 * 86400000).toISOString().split('T')[0];
    const searchParams = { permit_from: startDate, permit_to: endDate, size: 1, ...(tags ? { tags } : {}) };

    logger.info({ cityGeoId, zipCodes, tags }, 'Testing Shovels city-level geo_id coverage');

    let cityCount = 0;
    try {
      const data = await this.trackedGet<ShovelsApiResponse<ShovelsContractor>>(
        '/contractors/search',
        { ...searchParams, geo_id: cityGeoId }
      );
      cityCount = data.total_count ?? data.items.length;
    } catch (err: any) {
      if (err instanceof ShovelsCreditLimitError) throw err;
      logger.error({ cityGeoId, error: err.message }, 'City-level geo_id search failed');
    }

    const zipBreakdown: Record<string, number> = {};
    let zipTotal = 0;

    for (const zip of zipCodes) {
      try {
        const data = await this.trackedGet<ShovelsApiResponse<ShovelsContractor>>(
          '/contractors/search',
          { ...searchParams, geo_id: zip }
        );
        const count = data.total_count ?? data.items.length;
        zipBreakdown[zip] = count;
        zipTotal += count;
      } catch (err: any) {
        if (err instanceof ShovelsCreditLimitError) throw err;
        logger.warn({ zip, error: err.message }, 'Zip-level search failed');
        zipBreakdown[zip] = -1;
      }
    }

    const coveragePercent = zipTotal > 0 ? Math.round((cityCount / zipTotal) * 100) : 0;

    logger.info(
      { cityGeoId, cityCount, zipTotal, zipBreakdown, coveragePercent },
      'Shovels city-level geo_id coverage test results'
    );

    return { cityGeoIdCount: cityCount, zipTotalCount: zipTotal, zipBreakdown, coveragePercent };
  }

  /**
   * Fetch residents at a specific address by address_id.
   * Used for contact enrichment — more targeted than zip/city-level getResidents.
   */
  async getResidentsByAddress(addressId: string): Promise<ShovelsResident[]> {
    try {
      const data = await this.trackedGet<ShovelsApiResponse<ShovelsResident>>(
        `/addresses/${addressId}/residents`,
        { size: 50 }
      );
      return data.items;
    } catch (err: any) {
      if (err instanceof ShovelsCreditLimitError) throw err;
      if (err.response?.status === 404) return [];
      logger.warn({ addressId, error: err.message }, 'Shovels address residents lookup failed');
      return [];
    }
  }

  /**
   * Search permits filed in a geo (ZIP works) within a date window.
   *
   * Unlike `searchContractors` (which can return contractors whose work is
   * elsewhere), this returns the permits THEMSELVES, each carrying
   * `geo_ids.address_id` — the opaque ID required by `/addresses/{id}/residents`.
   * This is the right starting point for homeowner discovery.
   *
   * Note: the `tags` query parameter is ignored by `/permits/search` —
   * filter `permit.type` / `permit.subtype` / `permit.tags` client-side.
   */
  async searchPermits(
    params: { geo_id: string; permit_from: string; permit_to: string; size?: number },
    maxResults?: number
  ): Promise<ShovelsPermit[]> {
    const results: ShovelsPermit[] = [];
    let cursor: string | undefined;
    do {
      const data = await this.trackedGet<ShovelsApiResponse<ShovelsPermit>>(
        '/permits/search',
        { ...params, cursor, size: params.size || 50 }
      );
      results.push(...(data.items || []));
      if (maxResults && results.length >= maxResults) break;
      cursor = data.next_cursor ?? undefined;
    } while (cursor);
    const trimmed = maxResults ? results.slice(0, maxResults) : results;
    logger.info({ total: trimmed.length, geoId: params.geo_id }, 'Shovels permits/search complete');
    return trimmed;
  }

  /**
   * Resolve a free-text query (city, address, "Scottsdale, AZ") into Shovels
   * address rows. Each row carries a Shovels-native `geo_id` token (e.g. "ApD_68PkCgU"),
   * which is the only form Shovels accepts on residents endpoints.
   *
   * Used as a fallback when our local ZIP dictionary has no entry for a city.
   */
  async searchAddresses(q: string, size: number = 5): Promise<ShovelsAddressSearchResult[]> {
    try {
      const data = await this.trackedGet<ShovelsApiResponse<ShovelsAddressSearchResult>>(
        '/addresses/search',
        { q, size }
      );
      return data.items || [];
    } catch (err: any) {
      if (err instanceof ShovelsCreditLimitError) throw err;
      logger.warn({ q, error: err.message }, 'Shovels addresses/search failed');
      return [];
    }
  }

  async getPermitById(permitId: string): Promise<ShovelsPermit | null> {
    try {
      const data = await this.trackedGet<ShovelsPermit>(
        `/permits/${permitId}`
      );
      return data || null;
    } catch (err: any) {
      if (err instanceof ShovelsCreditLimitError) throw err;
      if (err.response?.status === 404) return null;
      logger.warn({ permitId, error: err.message }, 'Failed to fetch permit by ID');
      return null;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.client.get('/meta/release');
      return true;
    } catch {
      return false;
    }
  }

  /** Snapshot of credit usage for logging/results */
  async getCreditSnapshot(): Promise<{ todayUsed: number; dailyLimit: number }> {
    return {
      todayUsed: await getCreditsUsedToday(),
      dailyLimit: this.dailyCreditLimit,
    };
  }

  /**
   * Fetch monthly credit usage from the Shovels API (rolling 30-day window).
   * Does NOT consume credits. Returns null on failure so callers can degrade gracefully.
   */
  async getUsage(): Promise<ShovelsUsageResponse | null> {
    try {
      const response = await this.client.get<ShovelsUsageResponse>('/usage');
      return response.data;
    } catch (err: any) {
      logger.warn({ error: err.message }, 'Failed to fetch Shovels usage — quota check unavailable');
      return null;
    }
  }

  /**
   * Pre-flight quota check: returns structured status with usage percentage
   * and actionable fields for the caller to decide warn/block.
   */
  async checkQuota(): Promise<ShovelsQuotaStatus> {
    const usage = await this.getUsage();

    if (!usage) {
      return {
        creditsUsed: 0,
        creditLimit: null,
        isOverLimit: false,
        availableAt: null,
        usagePercent: 0,
        creditsRemaining: null,
      };
    }

    const remaining = usage.credit_limit != null
      ? Math.max(0, usage.credit_limit - usage.credits_used)
      : null;

    const pct = usage.credit_limit != null && usage.credit_limit > 0
      ? Math.round((usage.credits_used / usage.credit_limit) * 100)
      : 0;

    return {
      creditsUsed: usage.credits_used,
      creditLimit: usage.credit_limit,
      isOverLimit: usage.is_over_limit,
      availableAt: usage.available_at,
      usagePercent: pct,
      creditsRemaining: remaining,
    };
  }
}

export const shovelsClient = new ShovelsClient();

import axios, { AxiosInstance } from 'axios';
import { config } from '../../config';
import { logger } from '../../utils/logger';
import type {
  ShovelsSearchParams,
  ShovelsContractor,
  ShovelsEmployee,
  ShovelsPermit,
  ShovelsResident,
  ShovelsApiResponse,
} from './types';

export class ShovelsClient {
  private client: AxiosInstance;

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

  async searchContractors(params: Omit<ShovelsSearchParams, 'cursor'>): Promise<ShovelsContractor[]> {
    const results: ShovelsContractor[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.client.get<ShovelsApiResponse<ShovelsContractor>>(
        '/contractors/search',
        { params: { ...params, cursor, size: params.size || 50 } }
      );
      results.push(...response.data.items);
      cursor = response.data.next_cursor ?? undefined;
    } while (cursor);

    logger.info({ total: results.length, tags: params.tags, geoId: params.geo_id }, 'Shovels contractor search complete');
    return results;
  }

  async getEmployees(contractorId: string): Promise<ShovelsEmployee[]> {
    const results: ShovelsEmployee[] = [];
    let cursor: string | undefined;

    do {
      const response = await this.client.get<ShovelsApiResponse<ShovelsEmployee>>(
        `/contractors/${contractorId}/employees`,
        { params: { cursor, size: 50 } }
      );
      results.push(...response.data.items);
      cursor = response.data.next_cursor ?? undefined;
    } while (cursor);

    return results;
  }

  async getMostRecentPermit(contractorId: string): Promise<ShovelsPermit | null> {
    try {
      const response = await this.client.get<ShovelsApiResponse<ShovelsPermit>>(
        `/contractors/${contractorId}/permits`,
        { params: { size: 1 } }
      );
      const permit = response.data.items[0] || null;

      if (permit) {
        logger.info(
          {
            contractorId,
            permitId: permit.id,
            start_date: permit.start_date,
            file_date: permit.file_date,
            issue_date: permit.issue_date,
            first_seen_date: permit.first_seen_date,
            resolvedPermitDate: permit.start_date || permit.file_date || permit.first_seen_date || null,
          },
          'Shovels permit date fields (raw response diagnostic)'
        );
      }

      return permit;
    } catch (err: any) {
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
    params?: { size?: number; cursor?: string; tags?: string }
  ): Promise<{ residents: ShovelsResident[]; rawSample: any }> {
    const results: ShovelsResident[] = [];
    let rawSample: any = null;

    try {
      const response = await this.client.get<ShovelsApiResponse<ShovelsResident>>(
        `/addresses/${geoId}/residents`,
        { params: { size: params?.size || 10, cursor: params?.cursor, tags: params?.tags } }
      );

      rawSample = response.data;
      results.push(...response.data.items);

      if (results.length > 0) {
        const sample = results[0];
        logger.info(
          {
            geoId,
            totalReturned: results.length,
            totalCount: response.data.total_count,
            sampleFields: Object.keys(sample),
            sampleRecord: sample,
          },
          'Shovels residents endpoint — raw sample response (diagnostic)'
        );
      } else {
        logger.warn({ geoId }, 'Shovels residents endpoint returned 0 results');
      }

      return { residents: results, rawSample };
    } catch (err: any) {
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
      const cityResponse = await this.client.get<ShovelsApiResponse<ShovelsContractor>>(
        '/contractors/search',
        { params: { ...searchParams, geo_id: cityGeoId } }
      );
      cityCount = cityResponse.data.total_count ?? cityResponse.data.items.length;
    } catch (err: any) {
      logger.error({ cityGeoId, error: err.message }, 'City-level geo_id search failed');
    }

    const zipBreakdown: Record<string, number> = {};
    let zipTotal = 0;

    for (const zip of zipCodes) {
      try {
        const zipResponse = await this.client.get<ShovelsApiResponse<ShovelsContractor>>(
          '/contractors/search',
          { params: { ...searchParams, geo_id: zip } }
        );
        const count = zipResponse.data.total_count ?? zipResponse.data.items.length;
        zipBreakdown[zip] = count;
        zipTotal += count;
      } catch (err: any) {
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

  async checkHealth(): Promise<boolean> {
    try {
      await this.client.get('/meta/release');
      return true;
    } catch {
      return false;
    }
  }
}

export const shovelsClient = new ShovelsClient();

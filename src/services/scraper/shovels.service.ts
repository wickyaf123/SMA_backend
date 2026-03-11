import { shovelsClient } from '../../integrations/shovels/client';
import { normalizeContractor, normalizeEmployee, passesEmployeeFilter } from '../../integrations/shovels/normalizer';
import type { EmployeeFilterConfig } from '../../integrations/shovels/normalizer';
import { filterRelevantContractors } from '../validation/relevance.service';
import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';

export interface ShovelsRunResult {
  success: boolean;
  totalScraped: number;
  totalImported: number;
  duplicates: number;
  filtered: number;
  errors: string[];
  searchesRun: number;
}

export class ShovelsScraperService {
  async scrapeByPermitTypeAndGeo(
    permitType: string,
    geoId: string,
    city: string,
    dateRangeDays: number,
    maxResults: number,
    enableEmployees: boolean,
    employeeFilter?: EmployeeFilterConfig
  ): Promise<ShovelsRunResult> {
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date(Date.now() - dateRangeDays * 86400000)
      .toISOString().split('T')[0];

    let totalScraped = 0;
    let totalImported = 0;
    let duplicates = 0;
    let filtered = 0;
    const errors: string[] = [];

    try {
      const allContractors = await shovelsClient.searchContractors({
        geo_id: geoId,
        tags: permitType.toLowerCase(),
        permit_from: startDate,
        permit_to: endDate,
        size: Math.min(maxResults, 100),
      });

      totalScraped = allContractors.length;

      const { relevant: contractors, rejected } = filterRelevantContractors(allContractors, permitType);
      filtered = rejected.length;

      logger.info(
        { totalScraped, relevant: contractors.length, filtered, permitType, geoId },
        'Shovels search returned contractors (after relevance filter)'
      );

      for (const contractor of contractors) {
        try {
          const mostRecentPermit = await shovelsClient.getMostRecentPermit(contractor.id);

          let employees = enableEmployees
            ? await shovelsClient.getEmployees(contractor.id)
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
              const normalized = normalizeEmployee(contractor, employee, { permitType, city }, mostRecentPermit);
              const result = await this.importContact(normalized);
              if (result === 'imported') totalImported++;
              else if (result === 'duplicate') duplicates++;
            }
          } else {
            const normalized = normalizeContractor(contractor, { permitType, city }, mostRecentPermit);
            const result = await this.importContact(normalized);
            if (result === 'imported') totalImported++;
            else if (result === 'duplicate') duplicates++;
          }
        } catch (err: any) {
          if (err.code === 'P2002') {
            duplicates++;
          } else {
            errors.push(`Contractor ${contractor.id}: ${err.message}`);
          }
        }
      }
    } catch (err: any) {
      errors.push(`Search failed: ${err.message}`);
      logger.error({ err: err.message, permitType, geoId }, 'Shovels search failed');
    }

    logger.info({ totalScraped, totalImported, duplicates, filtered, errors: errors.length }, 'Shovels scrape complete');
    return { success: true, totalScraped, totalImported, duplicates, filtered, errors, searchesRun: 1 };
  }

  private async importContact(normalized: any): Promise<'imported' | 'duplicate' | 'skipped'> {
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
        where: { name: normalized.companyName },
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
          enrichmentData: normalized.enrichmentData,
          companyId: company.id,
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
    const totals: ShovelsRunResult = {
      success: true, totalScraped: 0, totalImported: 0,
      duplicates: 0, filtered: 0, errors: [], searchesRun: 0,
    };

    for (const permitType of settings.permitTypes) {
      for (let i = 0; i < settings.geoIds.length; i++) {
        const geoId = settings.geoIds[i];
        const city = settings.locations[i] || geoId;

        logger.info({ permitType, geoId, city }, 'Running Shovels scrape for permit type + geo');

        const result = await this.scrapeByPermitTypeAndGeo(
          permitType, geoId, city,
          settings.dateRangeDays,
          settings.maxResults,
          settings.enableEmployees,
          settings.employeeFilter
        );

        totals.totalScraped += result.totalScraped;
        totals.totalImported += result.totalImported;
        totals.duplicates += result.duplicates;
        totals.filtered += result.filtered;
        totals.errors.push(...result.errors);
        totals.searchesRun++;
      }
    }

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
   * Scrape by city name: tests city-level geo_id first, falls back to zip expansion.
   */
  async scrapeByCity(
    permitType: string,
    cityName: string,
    stateAbbr: string,
    dateRangeDays: number,
    maxResults: number,
    enableEmployees: boolean,
    employeeFilter?: EmployeeFilterConfig
  ): Promise<ShovelsRunResult> {
    const cityGeoId = `${cityName.toLowerCase().replace(/\s+/g, '-')}-${stateAbbr.toLowerCase()}`;

    const cityResult = await this.scrapeByPermitTypeAndGeo(
      permitType, cityGeoId, cityName, dateRangeDays, maxResults, enableEmployees, employeeFilter
    );

    if (cityResult.totalScraped > 0) {
      logger.info({ cityGeoId, count: cityResult.totalScraped }, 'City-level geo_id returned results, no zip expansion needed');
      return cityResult;
    }

    logger.info({ cityGeoId }, 'City-level geo_id returned 0 results, falling back to zip expansion');

    const zips = await this.resolveZipCodesForCity(cityName, stateAbbr);
    if (zips.length === 0) {
      logger.warn({ cityName, stateAbbr }, 'No zip codes resolved for city, returning empty');
      return cityResult;
    }

    const totals: ShovelsRunResult = {
      success: true, totalScraped: 0, totalImported: 0,
      duplicates: 0, filtered: 0, errors: [], searchesRun: 0,
    };

    for (const zip of zips) {
      const result = await this.scrapeByPermitTypeAndGeo(
        permitType, zip, cityName, dateRangeDays,
        Math.ceil(maxResults / zips.length), enableEmployees, employeeFilter
      );
      totals.totalScraped += result.totalScraped;
      totals.totalImported += result.totalImported;
      totals.duplicates += result.duplicates;
      totals.filtered += result.filtered;
      totals.errors.push(...result.errors);
      totals.searchesRun++;
    }

    logger.info(
      { cityName, stateAbbr, zipsSearched: zips.length, totalScraped: totals.totalScraped },
      'City zip expansion scrape complete'
    );

    return totals;
  }
}

export const shovelsScraperService = new ShovelsScraperService();

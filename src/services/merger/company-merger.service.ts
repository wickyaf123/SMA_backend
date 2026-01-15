/**
 * Company Merger Service
 * Phase 3.5 - Merge and deduplicate companies
 */

import { prisma } from '../../config/database';
import { logger } from '../../utils/logger';
import type { Company } from '@prisma/client';

/**
 * Company merge result
 */
export interface CompanyMergeResult {
  action: 'created' | 'updated' | 'merged' | 'skipped';
  companyId: string;
  duplicateOf?: string;
  reason?: string;
}

export class CompanyMergerService {
  /**
   * Find or create company with deduplication
   */
  async findOrCreateCompany(companyData: {
    name: string;
    domain?: string | null;
    website?: string | null;
    location?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    industry?: string | null;
    phone?: string | null;
  }): Promise<{ company: Company; created: boolean }> {
    // Strategy 1: Find by domain (most reliable)
    if (companyData.domain) {
      const existing = await prisma.company.findUnique({
        where: { domain: companyData.domain },
      });

      if (existing) {
        // Update with new data (enrich)
        const updated = await this.enrichCompany(existing.id, companyData);
        return { company: updated, created: false };
      }
    }

    // Strategy 2: Find by normalized name
    const normalizedName = this.normalizeCompanyName(companyData.name);
    const similarCompanies = await prisma.company.findMany({
      where: {
        name: {
          contains: normalizedName.substring(0, 10), // Match first 10 chars
          mode: 'insensitive',
        },
      },
      take: 10,
    });

    // Check for exact match
    for (const company of similarCompanies) {
      if (this.normalizeCompanyName(company.name) === normalizedName) {
        // Exact match found - enrich and return
        const updated = await this.enrichCompany(company.id, companyData);
        return { company: updated, created: false };
      }
    }

    // No match found - create new company
    const newCompany = await prisma.company.create({
      data: {
        name: companyData.name,
        domain: companyData.domain,
        website: companyData.website,
        location: companyData.location,
        city: companyData.city,
        state: companyData.state,
        country: companyData.country || 'United States',
        industry: companyData.industry,
      },
    });

    logger.info({ companyId: newCompany.id, name: newCompany.name }, 'Created new company');

    return { company: newCompany, created: true };
  }

  /**
   * Enrich existing company with new data
   */
  async enrichCompany(
    companyId: string,
    newData: {
      name?: string;
      domain?: string | null;
      website?: string | null;
      location?: string | null;
      city?: string | null;
      state?: string | null;
      country?: string | null;
      industry?: string | null;
      phone?: string | null;
    }
  ): Promise<Company> {
    const existing = await prisma.company.findUnique({
      where: { id: companyId },
    });

    if (!existing) {
      throw new Error(`Company ${companyId} not found`);
    }

    // Only update fields that are null or empty in existing
    const updates: any = {};

    if (newData.domain && !existing.domain) {
      updates.domain = newData.domain;
    }
    if (newData.website && !existing.website) {
      updates.website = newData.website;
    }
    if (newData.location && !existing.location) {
      updates.location = newData.location;
    }
    if (newData.city && !existing.city) {
      updates.city = newData.city;
    }
    if (newData.state && !existing.state) {
      updates.state = newData.state;
    }
    if (newData.industry && !existing.industry) {
      updates.industry = newData.industry;
    }

    // If no updates needed, return existing
    if (Object.keys(updates).length === 0) {
      return existing;
    }

    const updated = await prisma.company.update({
      where: { id: companyId },
      data: updates,
    });

    logger.debug(
      { companyId, updates: Object.keys(updates) },
      'Company enriched with new data'
    );

    return updated;
  }

  /**
   * Merge two companies
   */
  async mergeCompanies(targetId: string, sourceId: string): Promise<Company> {
    logger.info({ targetId, sourceId }, 'Merging companies');

    const target = await prisma.company.findUnique({
      where: { id: targetId },
      include: { contacts: { select: { id: true } } },
    });

    const source = await prisma.company.findUnique({
      where: { id: sourceId },
      include: { contacts: { select: { id: true } } },
    });

    if (!target || !source) {
      throw new Error('Target or source company not found');
    }

    // Merge data - prefer non-null values
    const mergedData = {
      domain: target.domain || source.domain,
      website: target.website || source.website,
      location: target.location || source.location,
      city: target.city || source.city,
      state: target.state || source.state,
      country: target.country || source.country,
      industry: target.industry || source.industry,
      size: target.size || source.size,
      linkedinUrl: target.linkedinUrl || source.linkedinUrl,
      apolloId: target.apolloId || source.apolloId,
      enrichmentData: {
        ...(typeof source.enrichmentData === 'object' ? source.enrichmentData : {}),
        ...(typeof target.enrichmentData === 'object' ? target.enrichmentData : {}),
      },
    };

    // Update target with merged data
    const updated = await prisma.company.update({
      where: { id: targetId },
      data: mergedData,
    });

    // Move all contacts from source to target
    if (source.contacts.length > 0) {
      await prisma.contact.updateMany({
        where: { companyId: sourceId },
        data: { companyId: targetId },
      });

      logger.info(
        { count: source.contacts.length, from: sourceId, to: targetId },
        'Moved contacts to merged company'
      );
    }

    // Delete source company
    await prisma.company.delete({
      where: { id: sourceId },
    });

    logger.info(
      { mergedId: updated.id, deletedId: sourceId },
      'Companies merged successfully'
    );

    return updated;
  }

  /**
   * Find duplicate companies
   */
  async findDuplicateCompanies(): Promise<
    Array<{ company: Company; duplicates: Company[] }>
  > {
    logger.info('Searching for duplicate companies');

    const allCompanies = await prisma.company.findMany({
      include: {
        contacts: {
          select: { id: true },
        },
      },
    });

    const duplicateGroups: Array<{ company: Company; duplicates: Company[] }> = [];
    const processed = new Set<string>();

    for (const company of allCompanies) {
      if (processed.has(company.id)) continue;

      const duplicates: Company[] = [];

      for (const other of allCompanies) {
        if (company.id === other.id || processed.has(other.id)) continue;

        // Check if duplicate
        if (this.areCompaniesDuplicate(company, other)) {
          duplicates.push(other);
          processed.add(other.id);
        }
      }

      if (duplicates.length > 0) {
        duplicateGroups.push({ company, duplicates });
        processed.add(company.id);
      }
    }

    logger.info(
      { groups: duplicateGroups.length },
      'Duplicate company search completed'
    );

    return duplicateGroups;
  }

  /**
   * Auto-merge duplicate companies
   */
  async autoMergeDuplicates(): Promise<{
    merged: number;
    results: CompanyMergeResult[];
  }> {
    logger.info('Starting auto-merge of duplicate companies');

    const duplicateGroups = await this.findDuplicateCompanies();
    const results: CompanyMergeResult[] = [];
    let merged = 0;

    for (const group of duplicateGroups) {
      const target = group.company;

      for (const duplicate of group.duplicates) {
        try {
          await this.mergeCompanies(target.id, duplicate.id);
          merged++;
          results.push({
            action: 'merged',
            companyId: target.id,
            duplicateOf: duplicate.id,
            reason: 'Auto-detected duplicate',
          });
        } catch (error) {
          logger.error(
            { error, targetId: target.id, sourceId: duplicate.id },
            'Failed to merge companies'
          );
          results.push({
            action: 'skipped',
            companyId: duplicate.id,
            reason: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    logger.info({ merged, total: results.length }, 'Auto-merge completed');

    return { merged, results };
  }

  /**
   * Check if two companies are duplicates
   */
  private areCompaniesDuplicate(company1: Company, company2: Company): boolean {
    // Same domain = definite duplicate
    if (company1.domain && company2.domain && company1.domain === company2.domain) {
      return true;
    }

    // Same normalized name = likely duplicate
    const name1 = this.normalizeCompanyName(company1.name);
    const name2 = this.normalizeCompanyName(company2.name);

    if (name1 === name2) {
      // Same name + same location = definite duplicate
      if (
        company1.location &&
        company2.location &&
        this.normalizeAddress(company1.location) ===
          this.normalizeAddress(company2.location)
      ) {
        return true;
      }

      // Same name + same city/state = likely duplicate
      if (
        company1.city &&
        company2.city &&
        company1.city.toLowerCase() === company2.city.toLowerCase() &&
        company1.state &&
        company2.state &&
        company1.state.toLowerCase() === company2.state.toLowerCase()
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Normalize company name for matching
   */
  private normalizeCompanyName(name: string): string {
    return name
      .toLowerCase()
      .replace(/\b(inc|llc|ltd|corp|corporation|company|co|incorporated)\b\.?/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }

  /**
   * Normalize address for matching
   */
  private normalizeAddress(address: string): string {
    return address
      .toLowerCase()
      .replace(/\b(street|st|avenue|ave|road|rd|drive|dr|suite|ste|floor|fl|#)\b\.?/g, '')
      .replace(/[^a-z0-9]/g, '')
      .trim();
  }
}



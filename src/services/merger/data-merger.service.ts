/**
 * Data Merger Service
 * Merges Apollo and Google Maps data for contractors
 */

import { logger } from '../../utils/logger';

export interface MergeableContact {
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  title?: string;
  linkedinUrl?: string;
  city?: string;
  state?: string;
  country?: string;
  source: string;
  company?: {
    name?: string;
    website?: string;
    domain?: string;
    phone?: string;
    industry?: string;
    size?: string;
    estimatedEmployees?: number;
    estimatedRevenue?: number;
    city?: string;
    state?: string;
    address?: string;
  };
  enrichmentData?: any;
}

export interface MergedContact extends MergeableContact {
  sources: string[]; // e.g., ['apollo', 'google_maps']
  mergedFields: string[]; // Fields that were merged from multiple sources
}

export class DataMergerService {
  /**
   * Merge Apollo and Google Maps contacts
   * Matching strategy: domain/website match, then company name fuzzy match
   */
  async mergeContacts(
    apolloContacts: MergeableContact[],
    googleMapsContacts: MergeableContact[]
  ): Promise<{
    merged: MergedContact[];
    apolloOnly: MergeableContact[];
    googleMapsOnly: MergeableContact[];
    stats: {
      totalApollo: number;
      totalGoogleMaps: number;
      matched: number;
      apolloUnique: number;
      googleMapsUnique: number;
      finalTotal: number;
    };
  }> {
    logger.info({
      apolloCount: apolloContacts.length,
      googleMapsCount: googleMapsContacts.length,
    }, 'Starting data merge');

    const merged: MergedContact[] = [];
    const apolloOnly: MergeableContact[] = [];
    const googleMapsOnly: MergeableContact[] = [];
    const matchedGoogleMapsIndices = new Set<number>();

    // For each Apollo contact, try to find matching Google Maps contact
    for (const apolloContact of apolloContacts) {
      let matched = false;

      for (let i = 0; i < googleMapsContacts.length; i++) {
        if (matchedGoogleMapsIndices.has(i)) continue;

        const googleContact = googleMapsContacts[i];

        // Try to match by domain
        const apolloDomain = apolloContact.company?.domain || apolloContact.company?.website;
        const googleDomain = this.extractDomain(googleContact.company?.website);

        if (apolloDomain && googleDomain && this.domainsMatch(apolloDomain, googleDomain)) {
          // Found a match!
          merged.push(this.mergeTwo(apolloContact, googleContact));
          matchedGoogleMapsIndices.add(i);
          matched = true;
          break;
        }

        // Try to match by company name (fuzzy)
        const apolloCompanyName = apolloContact.company?.name;
        const googleCompanyName = googleContact.company?.name;

        if (apolloCompanyName && googleCompanyName && 
            this.companyNamesMatch(apolloCompanyName, googleCompanyName)) {
          merged.push(this.mergeTwo(apolloContact, googleContact));
          matchedGoogleMapsIndices.add(i);
          matched = true;
          break;
        }
      }

      if (!matched) {
        apolloOnly.push(apolloContact);
      }
    }

    // Add unmatched Google Maps contacts
    for (let i = 0; i < googleMapsContacts.length; i++) {
      if (!matchedGoogleMapsIndices.has(i)) {
        googleMapsOnly.push(googleMapsContacts[i]);
      }
    }

    const stats = {
      totalApollo: apolloContacts.length,
      totalGoogleMaps: googleMapsContacts.length,
      matched: merged.length,
      apolloUnique: apolloOnly.length,
      googleMapsUnique: googleMapsOnly.length,
      finalTotal: merged.length + apolloOnly.length + googleMapsOnly.length,
    };

    logger.info(stats, 'Data merge complete');

    return {
      merged,
      apolloOnly,
      googleMapsOnly,
      stats,
    };
  }

  /**
   * Merge two contacts (Apollo + Google Maps)
   * Priority: Apollo for email/contacts, Google Maps for phone/reviews
   */
  private mergeTwo(
    apolloContact: MergeableContact,
    googleContact: MergeableContact
  ): MergedContact {
    const mergedFields: string[] = [];

    // Prefer Apollo email (higher quality)
    const email = apolloContact.email || googleContact.email;
    if (apolloContact.email && googleContact.email) {
      mergedFields.push('email');
    }

    // Prefer Google Maps phone (often more current)
    const phone = googleContact.phone || apolloContact.phone;
    if (googleContact.phone && apolloContact.phone) {
      mergedFields.push('phone');
    }

    // Contact info - prefer Apollo
    const firstName = apolloContact.firstName || googleContact.firstName;
    const lastName = apolloContact.lastName || googleContact.lastName;
    const fullName = apolloContact.fullName || googleContact.fullName;
    const title = apolloContact.title || googleContact.title;
    const linkedinUrl = apolloContact.linkedinUrl || googleContact.linkedinUrl;

    // Location - prefer Google Maps (more accurate)
    const city = googleContact.city || apolloContact.city;
    const state = googleContact.state || apolloContact.state;
    const country = googleContact.country || apolloContact.country;

    // Company data - merge both
    const company = {
      name: apolloContact.company?.name || googleContact.company?.name,
      website: apolloContact.company?.website || googleContact.company?.website,
      domain: apolloContact.company?.domain || this.extractDomain(googleContact.company?.website) || undefined,
      phone: googleContact.company?.phone || apolloContact.company?.phone,
      industry: apolloContact.company?.industry || googleContact.company?.industry,
      size: apolloContact.company?.size,
      estimatedEmployees: apolloContact.company?.estimatedEmployees,
      estimatedRevenue: apolloContact.company?.estimatedRevenue,
      city: googleContact.company?.city || apolloContact.company?.city,
      state: googleContact.company?.state || apolloContact.company?.state,
      address: googleContact.company?.address || apolloContact.company?.address,
    };

    // Merge enrichment data
    const enrichmentData = {
      ...apolloContact.enrichmentData,
      ...googleContact.enrichmentData,
      apolloSource: apolloContact.enrichmentData,
      googleMapsSource: googleContact.enrichmentData,
    };

    return {
      email,
      phone,
      firstName,
      lastName,
      fullName,
      title,
      linkedinUrl,
      city,
      state,
      country,
      source: 'merged',
      sources: ['apollo', 'google_maps'],
      company,
      enrichmentData,
      mergedFields,
    };
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url?: string | null): string | null {
    if (!url) return null;

    try {
      // Remove protocol
      let domain = url.replace(/^https?:\/\//i, '');
      // Remove www
      domain = domain.replace(/^www\./i, '');
      // Remove path
      domain = domain.split('/')[0];
      // Remove port
      domain = domain.split(':')[0];
      return domain.toLowerCase();
    } catch {
      return null;
    }
  }

  /**
   * Check if two domains match
   */
  private domainsMatch(domain1: string, domain2: string): boolean {
    const normalized1 = this.extractDomain(domain1) || domain1.toLowerCase();
    const normalized2 = this.extractDomain(domain2) || domain2.toLowerCase();
    return normalized1 === normalized2;
  }

  /**
   * Check if two company names match (fuzzy)
   */
  private companyNamesMatch(name1: string, name2: string): boolean {
    // Normalize names
    const normalize = (name: string) => {
      return name
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '') // Remove non-alphanumeric
        .replace(/\b(inc|llc|ltd|corp|company|co)\b/g, ''); // Remove common suffixes
    };

    const normalized1 = normalize(name1);
    const normalized2 = normalize(name2);

    // Exact match
    if (normalized1 === normalized2) return true;

    // One contains the other (for cases like "ABC Solar" vs "ABC Solar LLC")
    if (normalized1.includes(normalized2) || normalized2.includes(normalized1)) {
      // But only if the shorter one is at least 5 characters (avoid false positives)
      const shorterLength = Math.min(normalized1.length, normalized2.length);
      if (shorterLength >= 5) {
        return true;
      }
    }

    return false;
  }
}

export const dataMergerService = new DataMergerService();


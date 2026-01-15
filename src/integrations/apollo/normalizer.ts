import {
  ApolloPersonResponse,
  ApolloOrganizationResponse,
  NormalizedContact,
  NormalizedCompany,
} from './types';
import { logger } from '../../utils/logger';

/**
 * Normalize Apollo person response to internal Contact schema
 */
export function normalizeApolloContact(
  person: ApolloPersonResponse
): NormalizedContact {
  // Extract primary email
  const email = person.email || extractEmailFromHistory(person);
  
  if (!email) {
    throw new Error(`No email found for Apollo person ${person.id}`);
  }

  // Extract primary phone
  const primaryPhone = person.phone_numbers?.[0];
  const phone = primaryPhone?.sanitized_number || primaryPhone?.raw_number || null;
  
  // Log phone data for debugging
  logger.debug({
    apolloId: person.id,
    hasPhoneNumbers: !!person.phone_numbers,
    phoneCount: person.phone_numbers?.length || 0,
    primaryPhone: primaryPhone ? {
      raw: primaryPhone.raw_number,
      sanitized: primaryPhone.sanitized_number,
      type: primaryPhone.type,
      status: primaryPhone.status,
    } : null,
    extractedPhone: phone,
  }, 'Apollo phone extraction');

  // Build normalized contact
  const normalized: NormalizedContact = {
    // Basic info
    email,
    firstName: person.first_name || null,
    lastName: person.last_name || null,
    fullName: person.name,
    title: person.title || null,
    phone,
    linkedinUrl: person.linkedin_url || null,

    // Location
    city: person.city || null,
    state: person.state || null,
    country: person.country || null,
    timezone: inferTimezone(person.state, person.country),

    // Source tracking
    source: 'apollo',
    sourceId: person.id,
    apolloId: person.id,

    // Enrichment data
    enrichmentData: {
      photoUrl: person.photo_url,
      headline: person.headline,
      seniority: person.seniority,
      departments: person.departments || [],
      emailStatus: person.email_status,
      socialUrls: {
        twitter: person.twitter_url || undefined,
        facebook: person.facebook_url || undefined,
        github: person.github_url || undefined,
      },
      employmentHistory: person.employment_history?.map((job) => ({
        title: job.title || '',
        company: job.organization_name || '',
        current: job.current,
        startDate: job.start_date || undefined,
        endDate: job.end_date || undefined,
      })) || [],
    },
  };

  // Add company if available
  if (person.organization) {
    normalized.company = normalizeApolloCompany(person.organization);
  }

  logger.debug({
    apolloId: person.id,
    email: normalized.email,
    hasCompany: !!normalized.company,
  }, 'Normalized Apollo contact');

  return normalized;
}

/**
 * Normalize Apollo organization response to internal Company schema
 */
export function normalizeApolloCompany(
  org: ApolloOrganizationResponse
): NormalizedCompany {
  // Determine size range from employee count
  const sizeRange = getEmployeeSizeRange(org.estimated_num_employees);

  const normalized: NormalizedCompany = {
    // Basic info
    name: org.name,
    domain: org.website_url ? extractDomain(org.website_url) : null,
    website: org.website_url || null,

    // Contact info
    phone: org.sanitized_phone || org.phone || org.primary_phone?.sanitized_number || null,

    // Size & revenue
    industry: org.industry || null,
    size: sizeRange,
    estimatedEmployees: org.estimated_num_employees || null,

    // Revenue
    estimatedRevenue: org.annual_revenue || null,
    estimatedRevenueRange: org.annual_revenue_printed || org.estimated_annual_revenue || null,

    // Location
    location: buildLocationString(org),
    city: org.city || null,
    state: org.state || null,
    country: org.country || null,
    address: org.raw_address || org.street_address || null,

    // Details
    linkedinUrl: org.linkedin_url || null,
    foundedYear: org.founded_year || null,
    description: org.short_description || org.seo_description || null,

    // Source tracking
    apolloId: org.id,

    // Enrichment data
    enrichmentData: {
      // Technology signals
      technologies: org.technologies || [],
      technographicTags: org.technographic_tags || [],

      // Growth signals
      employeeCount: org.estimated_num_employees || undefined,
      fundingTotal: org.total_funding || undefined,
      fundingStage: org.latest_funding_stage || undefined,
      fundingDate: org.latest_funding_round_date || undefined,

      // Review signals
      retailLocations: org.retail_location_count || undefined,

      // Additional signals
      alexaRanking: org.alexa_ranking || undefined,
      keywords: org.keywords || [],
      publiclyTraded: !!(org.publicly_traded_symbol || org.publicly_traded_exchange),
      stockSymbol: org.publicly_traded_symbol || undefined,
      stockExchange: org.publicly_traded_exchange || undefined,

      // Social & web
      socialUrls: {
        linkedin: org.linkedin_url || undefined,
        twitter: org.twitter_url || undefined,
        facebook: org.facebook_url || undefined,
        angellist: org.angellist_url || undefined,
        crunchbase: org.crunchbase_url || undefined,
      },
    },
  };

  logger.debug({
    apolloId: org.id,
    name: normalized.name,
    employees: normalized.estimatedEmployees,
  }, 'Normalized Apollo company');

  return normalized;
}

/**
 * Extract email from employment history if not directly available
 */
function extractEmailFromHistory(person: ApolloPersonResponse): string | null {
  if (!person.employment_history) return null;

  for (const job of person.employment_history) {
    if (job.emails && job.emails.length > 0) {
      return job.emails[0];
    }
  }

  return null;
}

/**
 * Extract domain from URL
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
    return urlObj.hostname.replace(/^www\./, '');
  } catch {
    return url.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  }
}

/**
 * Build location string from organization data
 */
function buildLocationString(org: ApolloOrganizationResponse): string | null {
  const parts: string[] = [];

  if (org.city) parts.push(org.city);
  if (org.state) parts.push(org.state);
  if (org.country) parts.push(org.country);

  return parts.length > 0 ? parts.join(', ') : null;
}

/**
 * Get employee size range from count
 */
function getEmployeeSizeRange(count: number | null): string | null {
  if (!count) return null;

  if (count < 10) return '1-10';
  if (count < 50) return '10-50';
  if (count < 100) return '50-100';
  if (count < 250) return '100-250';
  if (count < 500) return '250-500';
  if (count < 1000) return '500-1000';
  if (count < 5000) return '1000-5000';
  if (count < 10000) return '5000-10000';
  return '10000+';
}

/**
 * Infer timezone from state/country
 * Note: This is a simplified implementation. For production, consider using a proper timezone library.
 */
function inferTimezone(state: string | null, country: string | null): string | null {
  if (!country || country !== 'United States') {
    return null;
  }

  if (!state) return null;

  // US state to timezone mapping (simplified)
  const timezoneMap: Record<string, string> = {
    // Eastern
    'CT': 'America/New_York',
    'DE': 'America/New_York',
    'FL': 'America/New_York',
    'GA': 'America/New_York',
    'MA': 'America/New_York',
    'MD': 'America/New_York',
    'ME': 'America/New_York',
    'NC': 'America/New_York',
    'NH': 'America/New_York',
    'NJ': 'America/New_York',
    'NY': 'America/New_York',
    'OH': 'America/New_York',
    'PA': 'America/New_York',
    'RI': 'America/New_York',
    'SC': 'America/New_York',
    'VT': 'America/New_York',
    'VA': 'America/New_York',
    'WV': 'America/New_York',
    
    // Central
    'AL': 'America/Chicago',
    'AR': 'America/Chicago',
    'IA': 'America/Chicago',
    'IL': 'America/Chicago',
    'IN': 'America/Chicago',
    'KS': 'America/Chicago',
    'KY': 'America/Chicago',
    'LA': 'America/Chicago',
    'MN': 'America/Chicago',
    'MO': 'America/Chicago',
    'MS': 'America/Chicago',
    'ND': 'America/Chicago',
    'NE': 'America/Chicago',
    'OK': 'America/Chicago',
    'SD': 'America/Chicago',
    'TN': 'America/Chicago',
    'TX': 'America/Chicago',
    'WI': 'America/Chicago',
    
    // Mountain
    'AZ': 'America/Phoenix',
    'CO': 'America/Denver',
    'ID': 'America/Denver',
    'MT': 'America/Denver',
    'NM': 'America/Denver',
    'UT': 'America/Denver',
    'WY': 'America/Denver',
    
    // Pacific
    'CA': 'America/Los_Angeles',
    'NV': 'America/Los_Angeles',
    'OR': 'America/Los_Angeles',
    'WA': 'America/Los_Angeles',
    
    // Alaska & Hawaii
    'AK': 'America/Anchorage',
    'HI': 'Pacific/Honolulu',
  };

  return timezoneMap[state.toUpperCase()] || null;
}

/**
 * Build Apollo search params for specific industries and criteria
 */
export function buildSearchParamsForIndustry(
  industry: 'HVAC' | 'SOLAR' | 'ROOFING',
  options: {
    revenueMin?: number;
    revenueMax?: number;
    employeesMin?: number;
    employeesMax?: number;
    locations?: string[];
    excludeLocations?: string[];
    jobTitles?: string[];
    technologies?: string[];
    page?: number;
    perPage?: number;
  } = {}
): any {
  const {
    revenueMin = 2000000,
    revenueMax = 10000000,
    employeesMin = 10,
    employeesMax = 50,
    locations = [],
    excludeLocations = [],
    jobTitles = [
      'Owner',
      'CEO',
      'President',
      'COO',
      'VP Operations',
      'General Manager',
    ],
    technologies = [],
    page = 1,
    perPage = 100,
  } = options;

  const params: any = {
    // Person filters
    person_titles: jobTitles,
    
    // Organization filters
    organization_num_employees_ranges: [`${employeesMin},${employeesMax}`],
    revenue_range: {
      min: revenueMin,
      max: revenueMax,
    },
    
    // Pagination
    page,
    per_page: perPage,
    
    // Reveal contact info
    reveal_personal_emails: true,
    reveal_phone_number: true,
  };

  // Industry-specific logic
  if (industry === 'HVAC') {
    params.q_organization_keywords = 'HVAC OR "Heating and Air Conditioning" OR "Air Conditioning Contractor" OR "HVAC Services"';
  } else if (industry === 'SOLAR') {
    params.q_organization_keywords = '"Solar Energy" OR "battery installer" OR "Solar Installation" OR "Renewable Energy" OR "Solar Contractor"';
  } else if (industry === 'ROOFING') {
    params.q_organization_keywords = 'Roofing OR "Roofing Contractor" OR "Roof Installation" OR "Residential Roofing"';
  }

  // Location filters
  if (locations.length > 0) {
    params.organization_locations = locations;
  } else {
    // Default to US
    params.organization_locations = ['United States'];
  }

  // Technology filters
  if (technologies.length > 0) {
    params.organization_technologies = technologies;
  }

  return params;
}


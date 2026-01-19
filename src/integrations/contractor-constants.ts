/**
 * Contractor Lead Generation Constants
 * Spec: January 2, 2026 - Stark
 * 
 * ⚠️ WARNING: These are SUGGESTED values only
 * Do NOT use these as defaults in the application
 * All scraper configuration MUST come from user Settings
 */

/**
 * SUGGESTED Metro Areas for Google Maps Scraper
 * These are examples only - actual values must be configured in Settings
 */
export const SUGGESTED_METROS = [
  // California (excluding Southern CA metros)
  'San Francisco, CA',
  'San Jose, CA',
  'Sacramento, CA',
  
  // Texas
  'Houston, TX',
  'Dallas, TX',
  'Austin, TX',
  'Fort Worth, TX',
  'San Antonio, TX',
  
  // Florida
  'Miami, FL',
  'Tampa, FL',
  'Orlando, FL',
  'Jacksonville, FL',
  
  // Arizona
  'Phoenix, AZ',
  'Tucson, AZ',
  
  // North Carolina
  'Charlotte, NC',
  'Raleigh, NC',
  'Durham, NC',
  'Greensboro, NC',
  
  // Georgia
  'Atlanta, GA',
  'Savannah, GA',
];

/**
 * @deprecated Use SUGGESTED_METROS instead
 * Kept for backward compatibility
 */
export const TARGET_METROS = SUGGESTED_METROS;

/**
 * SUGGESTED Excluded Metro Areas (Southern California)
 * These are examples only - actual values must be configured in Settings
 */
export const SUGGESTED_EXCLUDED_METROS = [
  'Los Angeles, CA',
  'Orange County, CA',
  'San Diego, CA',
  'Riverside, CA',
  'San Bernardino, CA',
];

/**
 * SUGGESTED Priority State Order by Industry
 * These are examples only - actual values must be configured in Settings
 */
export const SUGGESTED_PRIORITY_STATES = {
  SOLAR: ['CA', 'TX', 'FL', 'AZ', 'NC'],
  HVAC: ['TX', 'AZ', 'FL', 'CA', 'NC', 'GA'],
  ROOFING: ['TX', 'FL', 'CA', 'NC', 'GA', 'AZ'],
};

/**
 * @deprecated Use SUGGESTED_PRIORITY_STATES instead
 * Kept for backward compatibility
 */
export const PRIORITY_STATES = SUGGESTED_PRIORITY_STATES;

/**
 * Company Name Exclusion Terms
 * Filter out manufacturers, wholesalers, distributors, and suppliers
 */
export const EXCLUDED_COMPANY_TERMS = [
  'wholesale',
  'distribution',
  'distributor',
  'manufacturer',
  'manufacturing',
  'supply',
  'supplier',
];

/**
 * SUGGESTED Google Maps Search Terms by Industry
 * These are examples only - actual values must be configured in Settings
 */
export const SUGGESTED_GOOGLE_MAPS_SEARCH_TERMS = {
  SOLAR: [
    'solar installer',
    'solar contractor',
    'solar panel installation',
    'solar energy company',
  ],
  HVAC: [
    'HVAC contractor',
    'heating and cooling',
    'air conditioning contractor',
    'HVAC repair',
  ],
  ROOFING: [
    'roofing contractor',
    'roof repair',
    'roof installation',
    'roofer',
  ],
};

/**
 * SUGGESTED Quality Filters for Google Maps Scraper
 * These are examples only - actual values must be configured in Settings
 */
export const SUGGESTED_GOOGLE_MAPS_QUALITY_FILTERS = {
  minReviews: 10,
  minRating: 3.5,
  excludeClosed: true,
};

/**
 * SUGGESTED Job Titles for Contractor Decision Makers
 * These are examples only - actual values must be configured in Settings
 */
export const SUGGESTED_CONTRACTOR_JOB_TITLES = [
  'Owner',
  'CEO',
  'President',
  'COO',
  'VP Operations',
  'General Manager',
  'VP Sales',
  'Operations Manager',
];

/**
 * @deprecated Use SUGGESTED_CONTRACTOR_JOB_TITLES instead
 * Kept for backward compatibility
 */
export const CONTRACTOR_JOB_TITLES = SUGGESTED_CONTRACTOR_JOB_TITLES;

/**
 * SUGGESTED Company Size Filters
 * These are examples only - actual values must be configured in Settings
 */
export const SUGGESTED_CONTRACTOR_SIZE_FILTERS = {
  employeesMin: 10,
  employeesMax: 100,
  revenueMin: 1000000, // $1M
  revenueMax: 10000000, // $10M
};

/**
 * @deprecated Use SUGGESTED_CONTRACTOR_SIZE_FILTERS instead
 * Kept for backward compatibility
 */
export const CONTRACTOR_SIZE_FILTERS = SUGGESTED_CONTRACTOR_SIZE_FILTERS;

/**
 * Check if company name should be excluded based on negative filters
 */
export function shouldExcludeCompany(companyName: string): boolean {
  if (!companyName) return false;
  
  const lowerName = companyName.toLowerCase();
  return EXCLUDED_COMPANY_TERMS.some(term => lowerName.includes(term));
}

/**
 * Filter companies by removing excluded terms
 */
export function filterCompanies<T extends { name?: string }>(companies: T[]): T[] {
  return companies.filter(company => !shouldExcludeCompany(company.name || ''));
}


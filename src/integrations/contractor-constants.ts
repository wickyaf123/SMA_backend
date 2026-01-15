/**
 * Contractor Lead Generation Constants
 * Spec: January 2, 2026 - Stark
 */

/**
 * Target Metro Areas for Google Maps Scraper
 * Priority order for Solar, HVAC, and Roofing contractors
 */
export const TARGET_METROS = [
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
 * Excluded Metro Areas (Southern California)
 * Per spec: exclude Los Angeles, Orange County, San Diego, Riverside, San Bernardino
 */
export const EXCLUDED_METROS = [
  'Los Angeles, CA',
  'Orange County, CA',
  'San Diego, CA',
  'Riverside, CA',
  'San Bernardino, CA',
];

/**
 * Priority State Order by Industry
 */
export const PRIORITY_STATES = {
  SOLAR: ['CA', 'TX', 'FL', 'AZ', 'NC'],
  HVAC: ['TX', 'AZ', 'FL', 'CA', 'NC', 'GA'],
  ROOFING: ['TX', 'FL', 'CA', 'NC', 'GA', 'AZ'],
};

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
 * Google Maps Search Terms by Industry
 */
export const GOOGLE_MAPS_SEARCH_TERMS = {
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
 * Quality Filters for Google Maps Scraper
 */
export const GOOGLE_MAPS_QUALITY_FILTERS = {
  minReviews: 10,
  minRating: 3.5,
  excludeClosed: true,
};

/**
 * Default Job Titles for Contractor Decision Makers
 */
export const CONTRACTOR_JOB_TITLES = [
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
 * Default Company Size Filters
 */
export const CONTRACTOR_SIZE_FILTERS = {
  employeesMin: 10,
  employeesMax: 100,
  revenueMin: 1000000, // $1M
  revenueMax: 10000000, // $10M
};

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


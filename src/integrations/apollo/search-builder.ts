import { ApolloSearchParams } from './types';

/**
 * Apollo Search Builder
 * 
 * Fluent API for building Apollo search queries with type-safe filters.
 * Supports all filters needed for HVAC, Solar, and Roofing lead generation.
 */
export class ApolloSearchBuilder {
  private params: Partial<ApolloSearchParams> = {};

  /**
   * Add industry-specific keywords
   */
  withIndustry(industry: 'HVAC' | 'SOLAR' | 'ROOFING'): this {
    const keywords = {
      HVAC: 'HVAC OR "Heating and Air Conditioning" OR "Air Conditioning Contractor" OR "HVAC Services"',
      SOLAR: '"Solar Energy" OR "battery installer" OR "Solar Installation" OR "Renewable Energy" OR "Solar Contractor"',
      ROOFING: 'Roofing OR "Roofing Contractor" OR "Roof Installation" OR "Residential Roofing"',
    };
    this.params.q_organization_keywords = keywords[industry];
    return this;
  }

  /**
   * Add custom keyword search
   */
  withKeywords(keywords: string): this {
    this.params.q_organization_keywords = keywords;
    return this;
  }

  /**
   * Filter by locations (states, cities, or countries)
   */
  withLocations(locations: string[]): this {
    this.params.organization_locations = locations;
    return this;
  }

  /**
   * Exclude specific locations
   */
  excludeLocations(locations: string[]): this {
    this.params.organization_not_locations = locations;
    return this;
  }

  /**
   * Filter by employee count range
   */
  withEmployeeRange(min: number, max: number): this {
    this.params.organization_num_employees_ranges = [`${min},${max}`];
    return this;
  }

  /**
   * Filter by revenue range
   */
  withRevenueRange(min: number, max: number): this {
    this.params.revenue_range = { min, max };
    return this;
  }

  /**
   * Filter by technologies used
   */
  withTechnologies(techs: string[]): this {
    this.params.organization_technologies = techs;
    return this;
  }

  /**
   * Filter by employee growth rate (e.g., "20%" for 20% YoY growth)
   */
  withEmployeeGrowth(minPercentage: number): this {
    this.params.organization_employee_growth_rate = `${minPercentage}%`;
    return this;
  }

  /**
   * Filter by job titles
   */
  withTitles(titles: string[]): this {
    this.params.person_titles = titles;
    return this;
  }

  /**
   * Filter by person locations
   */
  withPersonLocations(locations: string[]): this {
    this.params.person_locations = locations;
    return this;
  }

  /**
   * Filter by seniority levels
   */
  withSeniorities(seniorities: string[]): this {
    this.params.person_seniorities = seniorities;
    return this;
  }

  /**
   * Set pagination parameters
   */
  page(pageNum: number, perPage: number = 100): this {
    this.params.page = pageNum;
    this.params.per_page = Math.min(perPage, 100); // Apollo max is 100
    return this;
  }

  /**
   * Enable/disable email revelation (for enrichment)
   */
  revealEmails(reveal: boolean = true): this {
    this.params.reveal_personal_emails = reveal;
    return this;
  }

  /**
   * Enable/disable phone revelation (for enrichment)
   */
  revealPhones(reveal: boolean = true): this {
    this.params.reveal_phone_number = reveal;
    return this;
  }

  /**
   * Build and return the final search params
   */
  build(): ApolloSearchParams {
    return {
      ...this.params,
      reveal_personal_emails: this.params.reveal_personal_emails ?? true,
      reveal_phone_number: this.params.reveal_phone_number ?? true,
    } as ApolloSearchParams;
  }
}

/**
 * Preset builder for HVAC companies
 */
export function buildHVACSearch(options: {
  locations?: string[];
  excludeLocations?: string[];
  revenueMin?: number;
  revenueMax?: number;
  employeesMin?: number;
  employeesMax?: number;
  technologies?: string[];
  employeeGrowth?: number;
  titles?: string[];
  page?: number;
  perPage?: number;
}): ApolloSearchParams {
  const builder = new ApolloSearchBuilder()
    .withIndustry('HVAC')
    .withTitles(options.titles || [
      'Owner',
      'CEO',
      'President',
      'COO',
      'VP Operations',
      'General Manager',
    ]);

  if (options.locations) builder.withLocations(options.locations);
  if (options.excludeLocations) builder.excludeLocations(options.excludeLocations);
  if (options.revenueMin && options.revenueMax) {
    builder.withRevenueRange(options.revenueMin, options.revenueMax);
  }
  if (options.employeesMin && options.employeesMax) {
    builder.withEmployeeRange(options.employeesMin, options.employeesMax);
  }
  if (options.technologies) builder.withTechnologies(options.technologies);
  if (options.employeeGrowth) builder.withEmployeeGrowth(options.employeeGrowth);

  return builder.page(options.page || 1, options.perPage || 100).build();
}

/**
 * Preset builder for Solar companies
 */
export function buildSolarSearch(options: {
  locations?: string[];
  excludeLocations?: string[];
  revenueMin?: number;
  revenueMax?: number;
  employeesMin?: number;
  employeesMax?: number;
  technologies?: string[];
  employeeGrowth?: number;
  titles?: string[];
  excludeSouthernCalifornia?: boolean;
  page?: number;
  perPage?: number;
}): ApolloSearchParams {
  const builder = new ApolloSearchBuilder()
    .withIndustry('SOLAR')
    .withTitles(options.titles || [
      'Owner',
      'CEO',
      'President',
      'COO',
      'VP Operations',
      'General Manager',
    ]);

  // Handle Southern California exclusion for solar
  const excludeLocations = options.excludeLocations || [];
  if (options.excludeSouthernCalifornia) {
    excludeLocations.push(
      'Los Angeles, California',
      'San Diego, California',
      'Orange County, California',
      'Riverside, California',
      'San Bernardino, California'
    );
  }

  if (options.locations) builder.withLocations(options.locations);
  if (excludeLocations.length > 0) builder.excludeLocations(excludeLocations);
  if (options.revenueMin && options.revenueMax) {
    builder.withRevenueRange(options.revenueMin, options.revenueMax);
  }
  if (options.employeesMin && options.employeesMax) {
    builder.withEmployeeRange(options.employeesMin, options.employeesMax);
  }
  if (options.technologies) builder.withTechnologies(options.technologies);
  if (options.employeeGrowth) builder.withEmployeeGrowth(options.employeeGrowth);

  return builder.page(options.page || 1, options.perPage || 100).build();
}

/**
 * Preset builder for Roofing companies
 */
export function buildRoofingSearch(options: {
  locations?: string[];
  excludeLocations?: string[];
  revenueMin?: number;
  revenueMax?: number;
  employeesMin?: number;
  employeesMax?: number;
  technologies?: string[];
  employeeGrowth?: number;
  titles?: string[];
  page?: number;
  perPage?: number;
}): ApolloSearchParams {
  const builder = new ApolloSearchBuilder()
    .withIndustry('ROOFING')
    .withTitles(options.titles || [
      'Owner',
      'CEO',
      'President',
      'COO',
      'VP Operations',
      'General Manager',
    ]);

  if (options.locations) builder.withLocations(options.locations);
  if (options.excludeLocations) builder.excludeLocations(options.excludeLocations);
  if (options.revenueMin && options.revenueMax) {
    builder.withRevenueRange(options.revenueMin, options.revenueMax);
  }
  if (options.employeesMin && options.employeesMax) {
    builder.withEmployeeRange(options.employeesMin, options.employeesMax);
  }
  if (options.technologies) builder.withTechnologies(options.technologies);
  if (options.employeeGrowth) builder.withEmployeeGrowth(options.employeeGrowth);

  return builder.page(options.page || 1, options.perPage || 100).build();
}

/**
 * Priority solar markets helper
 */
export const PRIORITY_SOLAR_MARKETS = [
  'Texas',
  'Florida',
  'Arizona',
  'North Carolina',
  'Nevada',
  'Colorado',
];

/**
 * Default technology signals for contractor businesses
 */
export const DEFAULT_CONTRACTOR_TECHNOLOGIES = [
  'Jobber',
  'ServiceTitan',
  'Housecall Pro',
];


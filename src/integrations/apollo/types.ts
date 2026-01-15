/**
 * Apollo API Types
 * Documentation: https://apolloio.github.io/apollo-api-docs/
 */

// ==================== Search Request Types ====================

export interface ApolloSearchParams {
  // Person filters
  person_titles?: string[];
  person_locations?: string[];
  person_seniorities?: string[];
  
  // Organization filters - KEYWORD SEARCH (most effective for contractors)
  q_organization_keyword_tags?: string[];      // Industry keyword tags (e.g., "HVAC", "Solar", "Roofing")
  q_organization_name?: string;                // Search company name
  q_organization_domains?: string;             // Search by domain
  q_organization_keywords?: string;            // Free-text keyword search in company description
  
  // Organization filters - LOCATION & SIZE
  organization_locations?: string[];
  organization_not_locations?: string[];
  organization_num_employees_ranges?: string[];
  revenue_range?: {
    min?: number;
    max?: number;
  };
  
  // Organization filters - INDUSTRY (broad categories)
  organization_industry_tag_ids?: string[];    // Apollo industry tag IDs (use for broad categories)
  
  // Negative filters
  q_organization_not_keyword_tags?: string[];  // Exclude companies with these keywords
  
  // Technology filters
  organization_technologies?: string[];
  
  // Growth signals
  organization_employee_growth_rate?: string;
  
  // Pagination
  page?: number;
  per_page?: number;
  
  // Include fields
  reveal_personal_emails?: boolean;
  reveal_phone_number?: boolean;
}

// ==================== Response Types ====================

// Search Preview Response (Free - Obfuscated Data)
export interface ApolloSearchPreviewResponse {
  total_entries: number;
  people: Array<{
    id: string;
    first_name: string;
    last_name_obfuscated: string;
    title: string;
    has_email: boolean;
    has_direct_phone: string; // "Yes", "No", "Maybe: please request..."
    organization: {
      name: string;
      has_industry: boolean;
      has_phone: boolean;
      has_revenue: boolean;
      has_employee_count: boolean;
    };
  }>;
}

export interface ApolloPersonResponse {
  id: string;
  first_name: string;
  last_name: string;
  name: string;
  title: string;
  email: string | null;
  email_status: string | null;
  photo_url: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  facebook_url: string | null;
  github_url: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  
  // Phone numbers
  phone_numbers: Array<{
    raw_number: string;
    sanitized_number: string;
    type: string;
    position: number;
    status: string;
  }>;
  
  // Organization
  organization: ApolloOrganizationResponse | null;
  organization_id: string | null;
  
  // Employment
  employment_history: Array<{
    id: string;
    created_at: string;
    current: boolean;
    degree: string | null;
    description: string | null;
    emails: string[] | null;
    end_date: string | null;
    grade_level: string | null;
    kind: string | null;
    major: string | null;
    organization_id: string | null;
    organization_name: string | null;
    raw_address: string | null;
    start_date: string | null;
    title: string | null;
    updated_at: string;
    _id: string;
  }>;
  
  // Metadata
  headline: string | null;
  seniority: string | null;
  departments: string[];
}

export interface ApolloOrganizationResponse {
  id: string;
  name: string;
  website_url: string | null;
  blog_url: string | null;
  angellist_url: string | null;
  linkedin_url: string | null;
  twitter_url: string | null;
  facebook_url: string | null;
  
  // Company info
  primary_phone: {
    number: string;
    source: string;
    sanitized_number: string;
  } | null;
  languages: string[];
  alexa_ranking: number | null;
  phone: string | null;
  linkedin_uid: string | null;
  publicly_traded_symbol: string | null;
  publicly_traded_exchange: string | null;
  logo_url: string | null;
  crunchbase_url: string | null;
  
  // Size & revenue
  estimated_num_employees: number | null;
  snippets_loaded: boolean;
  industry: string | null;
  keywords: string[];
  estimated_annual_revenue: string | null;
  
  // Location
  city: string | null;
  state: string | null;
  country: string | null;
  raw_address: string | null;
  street_address: string | null;
  postal_code: string | null;
  
  // Business details
  founded_year: number | null;
  short_description: string | null;
  annual_revenue_printed: string | null;
  annual_revenue: number | null;
  
  // Technology
  technologies: string[];
  technographic_tags: string[];
  
  // Growth signals
  total_funding: number | null;
  total_funding_printed: string | null;
  latest_funding_round_date: string | null;
  latest_funding_stage: string | null;
  funding_events: Array<{
    id: string;
    date: string;
    news_url: string | null;
    type: string;
    investors: string | null;
    amount: string | null;
    currency: string | null;
  }>;
  
  // Review signals
  sanitized_phone: string | null;
  account_id: string | null;
  retail_location_count: number | null;
  
  // SEO
  seo_description: string | null;
  
  // Metadata
  organization_raw_address: string | null;
  organization_city: string | null;
  organization_street_address: string | null;
  organization_state: string | null;
  organization_country: string | null;
  organization_postal_code: string | null;
}

export interface ApolloSearchResponse {
  breadcrumbs: Array<{
    label: string;
    signal_field_name: string;
    value: string;
    display_name: string;
  }>;
  partial_results_only: boolean;
  disable_eu_prospecting: boolean;
  partial_results_limit: number;
  pagination: {
    page: number;
    per_page: number;
    total_entries: number;
    total_pages: number;
  };
  contacts: ApolloPersonResponse[];
  people: ApolloPersonResponse[];
  num_fetch_result: number | null;
}

// ==================== Enrichment Types ====================

export interface ApolloEnrichPersonRequest {
  id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  organization_name?: string;
  domain?: string;
  reveal_personal_emails?: boolean;
  reveal_phone_number?: boolean;
}

export interface ApolloEnrichPersonResponse {
  person: ApolloPersonResponse;
}

// Bulk Match/Enrichment Types
export interface ApolloBulkMatchRequest {
  details: Array<{
    id: string; // Apollo Person ID
    email?: string;
    first_name?: string;
    last_name?: string;
    organization_name?: string;
    domain?: string;
    linkedin_url?: string;
  }>;
  reveal_personal_emails?: boolean;
  // For mobile phone numbers, a webhook is required
  webhook_url?: string;
  webhook_headers?: Record<string, string>;
  webhook_body_format?: 'json' | 'form_urlencoded';
}

export interface ApolloBulkMatchResponse {
  people: ApolloPersonResponse[]; // Full person objects
  matches: number;
  credits_consumed: number;
  // If webhook_url is provided, this will indicate the status of the webhook delivery
  webhook_delivery_status?: string;
}

// Bulk Enrichment (alias for bulk_match)
export interface ApolloBulkEnrichRequest extends ApolloBulkMatchRequest {}
export interface ApolloBulkEnrichResponse extends ApolloBulkMatchResponse {}

// Mobile Phone Request (requires webhook)
export interface ApolloMobilePhoneRequest {
  id?: string;
  email?: string;
  first_name?: string;
  last_name?: string;
  organization_name?: string;
  reveal_phone_number: true;
  webhook_url: string;
}

// Mobile Phone Webhook Payload (received from Apollo)
export interface ApolloMobilePhoneWebhookPayload {
  person: {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
  };
  phone_numbers: Array<{
    raw_number: string;
    sanitized_number: string;
    type: string; // 'mobile', 'work', 'direct', etc.
    position?: number;
    status?: string;
  }>;
}

// ==================== Internal Normalized Types ====================

export interface NormalizedContact {
  // Basic info
  email: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  title: string | null;
  phone: string | null;
  linkedinUrl: string | null;
  
  // Location
  city: string | null;
  state: string | null;
  country: string | null;
  timezone: string | null;
  
  // Source tracking
  source: 'apollo';
  sourceId: string;
  apolloId: string;
  
  // Enrichment data
  enrichmentData: {
    photoUrl?: string | null;
    headline?: string | null;
    seniority?: string | null;
    departments?: string[];
    emailStatus?: string | null;
    socialUrls?: {
      twitter?: string;
      facebook?: string;
      github?: string;
    };
    employmentHistory?: Array<{
      title: string;
      company: string;
      current: boolean;
      startDate?: string;
      endDate?: string;
    }>;
  };
  
  // Company reference
  company?: NormalizedCompany;
}

export interface NormalizedCompany {
  // Basic info
  name: string;
  domain: string | null;
  website: string | null;
  
  // Contact info
  phone: string | null;
  
  // Size & revenue
  industry: string | null;
  size: string | null;
  estimatedEmployees: number | null;
  
  // Revenue
  estimatedRevenue: number | null;
  estimatedRevenueRange: string | null;
  
  // Location
  location: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  address: string | null;
  
  // Details
  linkedinUrl: string | null;
  foundedYear: number | null;
  description: string | null;
  
  // Source tracking
  apolloId: string;
  
  // Enrichment data
  enrichmentData: {
    // Technology signals
    technologies?: string[];
    technographicTags?: string[];
    
    // Growth signals
    employeeCount?: number;
    employeeGrowthRate?: number;
    fundingTotal?: number;
    fundingStage?: string;
    fundingDate?: string;
    
    // Review signals
    reviewCount?: number;
    retailLocations?: number;
    
    // Additional signals
    alexaRanking?: number;
    keywords?: string[];
    publiclyTraded?: boolean;
    stockSymbol?: string;
    stockExchange?: string;
    
    // Social & web
    socialUrls?: {
      linkedin?: string;
      twitter?: string;
      facebook?: string;
      angellist?: string;
      crunchbase?: string;
    };
  };
}

// ==================== Error Types ====================

export interface ApolloError {
  error: string;
  message: string;
  status: number;
}

export interface ApolloRateLimitInfo {
  limit: number;
  remaining: number;
  reset: number;
}

// ==================== Industry & Title Constants ====================

export const APOLLO_INDUSTRIES = {
  HVAC: 'Heating, Ventilation & Air Conditioning',
  SOLAR: 'Solar Energy',
  ROOFING: 'Roofing',
} as const;

export const APOLLO_JOB_TITLES = [
  'Owner',
  'CEO',
  'Chief Executive Officer',
  'President',
  'COO',
  'Chief Operating Officer',
  'VP Operations',
  'Vice President of Operations',
  'General Manager',
] as const;

export const APOLLO_TECHNOLOGIES = [
  'Jobber',
  'ServiceTitan',
  'Housecall Pro',
] as const;


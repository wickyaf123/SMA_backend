/**
 * Hunter.io Integration Types
 * Phase 3.5 - Email Enrichment
 */

/**
 * Hunter.io domain search request
 */
export interface HunterDomainSearchRequest {
  domain: string;
  limit?: number;
  offset?: number;
  type?: 'personal' | 'generic';
  seniority?: string[];
  department?: string[];
}

/**
 * Hunter.io email result
 */
export interface HunterEmail {
  value: string;
  type: 'personal' | 'generic';
  confidence: number;
  firstName?: string;
  lastName?: string;
  position?: string;
  seniority?: string;
  department?: string;
  linkedin?: string;
  twitter?: string;
  phoneNumber?: string;
  verification?: {
    date: string;
    status: 'valid' | 'invalid' | 'accept_all' | 'webmail' | 'disposable' | 'unknown';
  };
  sources?: Array<{
    domain: string;
    uri: string;
    extractedOn: string;
    lastSeenOn: string;
    stillOnPage: boolean;
  }>;
}

/**
 * Hunter.io domain search response
 */
export interface HunterDomainSearchResponse {
  data: {
    domain: string;
    disposable: boolean;
    webmail: boolean;
    accept_all: boolean;
    pattern: string;
    organization: string;
    description?: string;
    industry?: string;
    twitter?: string;
    facebook?: string;
    linkedin?: string;
    instagram?: string;
    youtube?: string;
    technologies?: string[];
    country?: string;
    state?: string;
    city?: string;
    postal_code?: string;
    street?: string;
    headcount?: string;
    company_type?: string;
    emails: HunterEmail[];
  };
  meta: {
    results: number;
    limit: number;
    offset: number;
    params: {
      domain: string;
      company?: string;
      type?: string;
    };
  };
}

/**
 * Hunter.io email finder request
 */
export interface HunterEmailFinderRequest {
  domain: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  max_duration?: number;
}

/**
 * Hunter.io email finder response
 */
export interface HunterEmailFinderResponse {
  data: {
    first_name: string;
    last_name: string;
    email: string;
    score: number;
    domain: string;
    accept_all: boolean;
    position?: string;
    twitter?: string;
    linkedin_url?: string;
    phone_number?: string;
    company?: string;
    sources: Array<{
      domain: string;
      uri: string;
      extracted_on: string;
      last_seen_on: string;
      still_on_page: boolean;
    }>;
    verification?: {
      date: string;
      status: 'valid' | 'invalid' | 'accept_all' | 'webmail' | 'disposable' | 'unknown';
    };
  };
  meta: {
    params: {
      first_name?: string;
      last_name?: string;
      full_name?: string;
      domain: string;
      company?: string;
    };
  };
}

/**
 * Hunter.io email verifier request
 */
export interface HunterEmailVerifierRequest {
  email: string;
}

/**
 * Hunter.io email verifier response
 */
export interface HunterEmailVerifierResponse {
  data: {
    status: 'valid' | 'invalid' | 'accept_all' | 'webmail' | 'disposable' | 'unknown';
    result: 'deliverable' | 'undeliverable' | 'risky' | 'unknown';
    score: number;
    email: string;
    regexp: boolean;
    gibberish: boolean;
    disposable: boolean;
    webmail: boolean;
    mx_records: boolean;
    smtp_server: boolean;
    smtp_check: boolean;
    accept_all: boolean;
    block: boolean;
    sources: Array<{
      domain: string;
      uri: string;
      extracted_on: string;
      last_seen_on: string;
      still_on_page: boolean;
    }>;
  };
  meta: {
    params: {
      email: string;
    };
  };
}

/**
 * Hunter.io account information response
 */
export interface HunterAccountInfoResponse {
  data: {
    first_name: string;
    last_name: string;
    email: string;
    plan_name: string;
    plan_level: number;
    reset_date: string;
    team_id: number;
    calls: {
      used: number;
      available: number;
    };
  };
}

/**
 * Hunter.io error response
 */
export interface HunterErrorResponse {
  errors: Array<{
    id: string;
    code: number;
    details: string;
  }>;
}

/**
 * Normalized Hunter.io result
 */
export interface NormalizedHunterResult {
  email: string;
  confidence: number;
  firstName?: string;
  lastName?: string;
  position?: string;
  linkedinUrl?: string;
  phoneNumber?: string;
  verificationStatus?: 'valid' | 'invalid' | 'accept_all' | 'webmail' | 'disposable' | 'unknown';
  sources: number;
  foundAt: Date;
}

/**
 * Bulk enrichment result
 */
export interface BulkEnrichmentResult {
  total: number;
  enriched: number;
  failed: number;
  skipped: number;
  results: Array<{
    contactId: string;
    email?: string;
    confidence?: number;
    error?: string;
  }>;
}

/**
 * Enrichment job status
 */
export interface EnrichmentJobStatus {
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  progress: {
    total: number;
    processed: number;
    enriched: number;
    failed: number;
  };
  startedAt: Date;
  completedAt?: Date;
  durationMs?: number;
}


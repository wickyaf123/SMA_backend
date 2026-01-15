/**
 * NeverBounce API Types
 * Documentation: https://developers.neverbounce.com/docs
 */

// ==================== Request Types ====================

export interface NeverBounceVerifyRequest {
  email: string;
  address_info?: boolean;
  credits_info?: boolean;
  timeout?: number;
}

export interface NeverBounceBulkRequest {
  input: Array<{
    id: string;
    email: string;
  }>;
  auto_parse?: boolean;
  auto_start?: boolean;
}

// ==================== Response Types ====================

export type NeverBounceResult = 
  | 'valid' 
  | 'invalid' 
  | 'disposable' 
  | 'catchall' 
  | 'unknown';

export interface NeverBounceVerifyResponse {
  status: string;
  result: NeverBounceResult;
  flags: string[];
  suggested_correction: string | null;
  execution_time: number;
  
  // Optional address info
  addr_info?: {
    original_email: string;
    normalized_email: string;
    addr: string;
    alias: string;
    host: string;
    fqdn: string;
    domain: string;
    subdomain: string;
    tld: string;
  };
  
  // Optional credits info
  credits_info?: {
    paid_credits_used: number;
    free_credits_used: number;
    paid_credits_remaining: number;
    free_credits_remaining: number;
  };
}

export interface NeverBounceBulkResponse {
  status: string;
  job_id: string;
  message?: string;
}

export interface NeverBounceJobStatus {
  status: string;
  id: string;
  job_status: 'under_review' | 'queued' | 'running' | 'complete' | 'failed';
  filename: string;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  total: {
    records: number;
    billable: number;
    processed: number;
    valid: number;
    invalid: number;
    catchall: number;
    disposable: number;
    unknown: number;
    duplicates: number;
    bad_syntax: number;
  };
  bounce_estimate: number;
  percent_complete: number;
  execution_time: number | null;
}

// ==================== Error Types ====================

export interface NeverBounceError {
  status: string;
  message: string;
  error_code?: number;
}

// ==================== Internal Types ====================

export interface EmailValidationResult {
  email: string;
  isValid: boolean;
  result: NeverBounceResult;
  flags: string[];
  suggestedCorrection: string | null;
  normalizedEmail?: string;
  executionTime: number;
  validatedAt: Date;
}

// ==================== Status Mapping ====================

export const NEVERBOUNCE_TO_DB_STATUS: Record<NeverBounceResult, string> = {
  'valid': 'VALID',
  'invalid': 'INVALID',
  'disposable': 'DISPOSABLE',
  'catchall': 'CATCH_ALL',
  'unknown': 'UNKNOWN',
};


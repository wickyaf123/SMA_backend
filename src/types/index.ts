/**
 * Shared TypeScript types and interfaces
 */

// API Response types
export interface SuccessResponse<T = any> {
  success: true;
  data: T;
  meta?: ResponseMeta;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
  };
  meta?: ResponseMeta;
}

export interface ResponseMeta {
  timestamp?: string;
  requestId?: string;
  [key: string]: any;
}

export type ApiResponse<T = any> = SuccessResponse<T> | ErrorResponse;

// Pagination types
export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginationMeta extends PaginationParams {
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: PaginationMeta;
  meta?: ResponseMeta;
}

// Queue job types
export interface QueueJob<T = any> {
  id: string;
  data: T;
  attemptsMade?: number;
  timestamp?: number;
}

export interface QueueJobResult {
  success: boolean;
  error?: string;
  data?: any;
}

// Service response types
export interface ServiceResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

// Filter and search types
export interface SearchParams {
  search?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface DateRangeFilter {
  startDate?: Date;
  endDate?: Date;
}

// Re-export common types
export type { Logger } from '../utils/logger';
export type { Config } from '../config';

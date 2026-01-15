import { Response } from 'express';
import { SuccessResponse, PaginatedResponse, PaginationMeta, ResponseMeta } from '../types';

/**
 * Send success response
 */
export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode: number = 200,
  meta?: ResponseMeta
): Response {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };

  return res.status(statusCode).json(response);
}

/**
 * Send paginated response
 */
export function sendPaginated<T>(
  res: Response,
  data: T[],
  pagination: PaginationMeta,
  statusCode: number = 200
): Response {
  const response: PaginatedResponse<T> = {
    success: true,
    data,
    pagination,
    meta: {
      timestamp: new Date().toISOString(),
    },
  };

  return res.status(statusCode).json(response);
}

/**
 * Send created response (201)
 */
export function sendCreated<T>(res: Response, data: T, meta?: ResponseMeta): Response {
  return sendSuccess(res, data, 201, meta);
}

/**
 * Send no content response (204)
 */
export function sendNoContent(res: Response): Response {
  return res.status(204).send();
}

/**
 * Calculate pagination metadata
 */
export function calculatePagination(
  page: number,
  limit: number,
  total: number
): PaginationMeta {
  const totalPages = Math.ceil(total / limit);
  
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

/**
 * Success response helper
 */
export function successResponse<T>(data: T, meta?: ResponseMeta): any {
  return {
    success: true,
    data,
    meta: {
      timestamp: new Date().toISOString(),
      ...meta,
    },
  };
}

/**
 * Error response helper
 */
export function errorResponse(message: string, statusCode?: number, details?: any): any {
  return {
    success: false,
    error: {
      message,
      code: statusCode?.toString(),
      details,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  };
}


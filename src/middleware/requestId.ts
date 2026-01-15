import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Request ID Middleware
 * Generates a unique request ID for each request for tracing and debugging.
 * Uses existing x-request-id header if provided, otherwise generates a new UUID.
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  // Use existing request ID if provided, otherwise generate new one
  const requestId = (req.headers['x-request-id'] as string) || randomUUID();

  // Set on request headers for downstream use
  req.headers['x-request-id'] = requestId;

  // Set on response headers for client
  res.setHeader('x-request-id', requestId);

  next();
}

/**
 * Get the request ID from a request object
 */
export function getRequestId(req: Request): string {
  return (req.headers['x-request-id'] as string) || 'unknown';
}


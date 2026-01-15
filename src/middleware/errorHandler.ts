import { Request, Response, NextFunction } from 'express';
import { AppError, formatErrorResponse, isOperationalError } from '../utils/errors';
import { logger } from '../utils/logger';
import { config } from '../config';
import * as Sentry from '@sentry/node';

/**
 * Express error handling middleware
 * Must be the last middleware in the chain
 */
export function errorHandler(
  error: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  next: NextFunction
) {
  // Capture unexpected errors in Sentry (not operational errors like validation)
  if (!isOperationalError(error)) {
    Sentry.captureException(error, {
      extra: {
        path: req.path,
        method: req.method,
        query: req.query,
        requestId: req.headers['x-request-id'],
      },
    });
  }

  // Log error
  if (isOperationalError(error)) {
    logger.warn(
      {
        error: error.message,
        code: (error as AppError).code,
        path: req.path,
        method: req.method,
      },
      'Operational error'
    );
  } else {
    logger.error(
      {
        error: error.message,
        stack: error.stack,
        path: req.path,
        method: req.method,
      },
      'Unexpected error'
    );
  }

  // Format error response
  const response = formatErrorResponse(error);

  // Add stack trace in development
  if (config.isDevelopment && !isOperationalError(error)) {
    (response.error as any).stack = error.stack;
  }

  // Add request ID if available
  const requestId = req.headers['x-request-id'] as string;
  if (requestId) {
    (response as any).meta = {
      requestId,
      timestamp: new Date().toISOString(),
    };
  }

  // Send response
  const statusCode = error instanceof AppError ? error.statusCode : 500;
  res.status(statusCode).json(response);
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response, next: NextFunction) {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Async handler wrapper to catch async errors
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}


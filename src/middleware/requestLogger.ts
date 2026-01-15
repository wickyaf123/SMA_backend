import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { nanoid } from 'nanoid';

/**
 * Request logging middleware
 * Logs all incoming requests and outgoing responses
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  // Generate request ID
  const requestId = (req.headers['x-request-id'] as string) || nanoid();
  req.headers['x-request-id'] = requestId;

  // Add request ID to response header
  res.setHeader('X-Request-ID', requestId);

  // Start timer
  const start = Date.now();

  // Log request
  logger.info(
    {
      requestId,
      method: req.method,
      path: req.path,
      query: req.query,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    },
    'Incoming request'
  );

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;

    logger.info(
      {
        requestId,
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        duration: `${duration}ms`,
      },
      'Request completed'
    );
  });

  next();
}


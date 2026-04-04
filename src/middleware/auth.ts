import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import { logger } from '../utils/logger';

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
}

function getApiKey(): string | undefined {
  return process.env.API_KEY;
}

interface JwtPayload {
  userId: string;
  email: string;
  role: string;
}

/**
 * Authentication middleware
 *
 * Supports two mechanisms for backward compatibility:
 *   1. JWT Bearer token — standard user authentication
 *   2. x-api-key header  — legacy system/service authentication (OpenClaw / Jerry API)
 *
 * On success, `req.user` is populated with { userId, email, role }.
 */
export const authMiddleware = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // --- 1. Try JWT Bearer token ---
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7);
      try {
        const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload;
        req.user = {
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role,
        };
        return next();
      } catch (err) {
        // If a Bearer token was provided but is invalid, reject immediately
        // rather than falling through to API key check.
        throw new AuthenticationError('Invalid or expired access token');
      }
    }

    // --- 2. Try legacy x-api-key header ---
    const apiKey = req.headers['x-api-key'] as string | undefined;
    const expectedKey = getApiKey();

    if (apiKey && expectedKey && apiKey === expectedKey) {
      // Create a system-level user context for service-to-service calls
      req.user = {
        userId: 'system',
        email: 'system@internal',
        role: 'ADMIN',
      };
      return next();
    }

    // --- 3. No valid credentials ---
    throw new AuthenticationError('Missing or invalid authentication credentials');
  } catch (error) {
    next(error);
  }
};

/**
 * Authorization middleware — requires ADMIN role.
 * Must be placed AFTER authMiddleware in the middleware chain.
 */
export const requireAdmin = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    return next(new AuthenticationError('Authentication required'));
  }

  if (req.user.role !== 'ADMIN') {
    return next(new AuthorizationError('Admin access required'));
  }

  next();
};

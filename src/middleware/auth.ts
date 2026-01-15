import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { AuthenticationError } from '../utils/errors';

/**
 * API Key Authentication Middleware
 * Validates Bearer token in Authorization header
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      throw new AuthenticationError('Authorization header is required');
    }

    const [bearer, token] = authHeader.split(' ');

    if (bearer !== 'Bearer' || !token) {
      throw new AuthenticationError('Invalid authorization format. Use: Bearer <token>');
    }

    if (token !== config.apiKey) {
      throw new AuthenticationError('Invalid API key');
    }

    // Authentication successful
    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication - doesn't fail if no auth provided
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;

    if (authHeader) {
      const [bearer, token] = authHeader.split(' ');
      
      if (bearer === 'Bearer' && token === config.apiKey) {
        // Valid auth provided
        next();
        return;
      }
    }

    // No auth or invalid auth, but continue anyway
    next();
  } catch (error) {
    // Even if error, continue for optional auth
    next();
  }
}

// Export alias
export const authenticateApiKey = authenticate;


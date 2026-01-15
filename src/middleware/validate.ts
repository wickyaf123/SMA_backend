import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { ValidationError } from '../utils/errors';

/**
 * Validation middleware factory
 * Validates request against a Zod schema
 * @param schema - Zod schema (either full request shape or just body shape)
 * @param source - Which part of request to validate ('body', 'query', 'params', or 'all')
 */
export function validate(schema: AnyZodObject, source: 'body' | 'query' | 'params' | 'all' = 'all') {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (source === 'all') {
        // Validate the full request object (body, query, params)
        await schema.parseAsync({
          body: req.body,
          query: req.query,
          params: req.params,
        });
      } else {
        // Validate only the specified source
        await schema.parseAsync(req[source]);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        next(
          new ValidationError('Validation failed', {
            errors: details,
          })
        );
      } else {
        next(error);
      }
    }
  };
}

/**
 * Validate pagination parameters
 */
export function validatePagination(req: Request, res: Response, next: NextFunction) {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 25;

    if (page < 1) {
      throw new ValidationError('Page must be greater than 0');
    }

    if (limit < 1 || limit > 100) {
      throw new ValidationError('Limit must be between 1 and 100');
    }

    // Attach validated pagination to request
    req.pagination = { page, limit };

    next();
  } catch (error) {
    next(error);
  }
}

// Extend Express Request type to include pagination
declare global {
  namespace Express {
    interface Request {
      pagination?: {
        page: number;
        limit: number;
      };
    }
  }
}


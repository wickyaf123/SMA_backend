/**
 * Extend the Express Request type to include authenticated user context.
 *
 * This declaration merges with the global Express namespace so that
 * req.user is available on every route handler without manual casting.
 */
declare namespace Express {
  interface Request {
    user?: {
      userId: string;
      email: string;
      role: string;
    };
  }
}

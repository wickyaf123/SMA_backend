import rateLimit from 'express-rate-limit';

/**
 * Global API rate limiter
 * Limits requests per IP address
 */
export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Limit each IP to 1000 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests, please try again later',
        details: { retryAfter: 900 },
      },
      meta: { timestamp: new Date().toISOString() },
    });
  },
});

/**
 * Strict rate limiter for write operations
 */
export const strictRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // Limit each IP to 100 requests per minute
  message: 'Too many requests, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded for this operation',
        details: { retryAfter: 60 },
      },
      meta: { timestamp: new Date().toISOString() },
    });
  },
});

/**
 * Auth rate limiter - prevents brute force
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // 50 failed auth attempts
  message: 'Too many authentication attempts',
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many authentication attempts',
        details: { retryAfter: 900 },
      },
      meta: { timestamp: new Date().toISOString() },
    });
  },
});

/**
 * Chat message rate limiter
 * Prevents spam messages and excessive Anthropic API usage
 */
export const chatRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // 10 messages per minute per IP
  message: 'Too many messages, please slow down',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // Key by IP + conversation ID for more granular limiting
    return `${req.ip}-${req.params?.id || 'unknown'}`;
  },
  handler: (_req, res) => {
    res.status(429).json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Chat rate limit exceeded. Please wait before sending more messages.',
        details: { retryAfter: 60 },
      },
      meta: { timestamp: new Date().toISOString() },
    });
  },
});


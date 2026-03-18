import rateLimit from 'express-rate-limit';
import { RateLimitError } from '../utils/errors';

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
  handler: (req, res) => {
    throw new RateLimitError('Too many requests, please try again later', 900);
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
  handler: (req, res) => {
    throw new RateLimitError('Rate limit exceeded for this operation', 60);
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
  handler: (req, res) => {
    throw new RateLimitError('Too many authentication attempts', 900);
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
  handler: (req, res) => {
    throw new RateLimitError('Chat rate limit exceeded. Please wait before sending more messages.', 60);
  },
});


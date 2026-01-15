/**
 * Sentry Error Tracking Configuration
 * Captures errors, exceptions, and performance data
 */

import * as Sentry from '@sentry/node';
import { config } from './index';

export function initSentry() {
  if (!config.sentry.dsn) {
    console.warn('⚠️ Sentry DSN not configured - error tracking disabled');
    return;
  }

  Sentry.init({
    dsn: config.sentry.dsn,
    environment: config.nodeEnv,

    // Performance monitoring sample rate
    // 100% in dev, 10% in production
    tracesSampleRate: config.isProduction ? 0.1 : 1.0,

    // Filter sensitive data before sending to Sentry
    beforeSend(event) {
      if (event.request?.headers) {
        delete event.request.headers['authorization'];
        delete event.request.headers['x-api-key'];
        delete event.request.headers['cookie'];
      }
      return event;
    },

    // Ignore certain errors
    ignoreErrors: [
      // Rate limit errors are expected, not bugs
      'Rate limit exceeded',
      // Network errors from external services
      'ECONNRESET',
      'ETIMEDOUT',
    ],
  });

  console.log('✓ Sentry error tracking initialized');
}

export { Sentry };


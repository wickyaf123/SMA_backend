import pino from 'pino';

const isDevelopment = process.env.NODE_ENV !== 'production';
const isTest = process.env.NODE_ENV === 'test';

/**
 * Google Cloud Logging severity levels mapping
 * https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#LogSeverity
 */
const gcpSeverityMap: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

/**
 * Logger configuration
 * 
 * In development: Pretty-printed colorized logs
 * In production/GCP: Structured JSON logs compatible with Google Cloud Logging
 * 
 * Key fields for Google Cloud Logging:
 * - severity: Log level (DEBUG, INFO, WARNING, ERROR, CRITICAL)
 * - message: The log message
 * - timestamp: ISO 8601 timestamp
 * - requestId/trace: For request correlation
 * - httpRequest: HTTP request details (method, url, status, latency)
 */
export const logger = pino({
  level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info'),
  
  // Pretty print in development, structured JSON in production
  transport: isDevelopment && !isTest
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
          messageFormat: '{msg}',
        },
      }
    : undefined,

  formatters: {
    // Map pino levels to Google Cloud Logging severity
    level: (label) => {
      return {
        level: label,
        severity: gcpSeverityMap[label] || 'DEFAULT',
      };
    },
    
    // Format the log object for GCP compatibility
    log: (obj) => {
      // Extract and restructure for GCP
      const { requestId, method, path, statusCode, duration, ...rest } = obj as any;
      
      const formatted: Record<string, any> = { ...rest };
      
      // Add request ID as trace for correlation
      if (requestId) {
        formatted['logging.googleapis.com/trace'] = requestId;
        formatted.requestId = requestId;
      }
      
      // Format HTTP request details for GCP
      if (method || path || statusCode) {
        formatted.httpRequest = {
          requestMethod: method,
          requestUrl: path,
          status: statusCode,
          latency: duration,
        };
      }
      
      return formatted;
    },
  },
  
  // ISO timestamp for GCP compatibility
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  
  // Base properties included in every log
  base: {
    service: 'james-outbound',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  },
});

/**
 * Create a child logger with additional context
 * Useful for adding request-specific or job-specific context
 */
export function createChildLogger(bindings: Record<string, any>) {
  return logger.child(bindings);
}

/**
 * Log levels reference:
 * - trace: Very detailed debugging (rarely used)
 * - debug: Debugging information for development
 * - info: General operational information
 * - warn: Warning conditions that should be reviewed
 * - error: Error conditions that need attention
 * - fatal: Critical errors that may cause termination
 */

export type Logger = typeof logger;


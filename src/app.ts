import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config';
import { requestIdMiddleware } from './middleware/requestId';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { globalRateLimiter } from './middleware/rateLimit';

/**
 * Create and configure Express application
 */
export function createApp(): Express {
  const app = express();

  // Security middleware
  app.use(helmet());
  
  const allowedOrigins: string[] = [];
  if (config.isProduction && process.env.FRONTEND_URL) {
    for (const raw of process.env.FRONTEND_URL.split(',')) {
      const u = raw.trim();
      if (!u) continue;
      allowedOrigins.push(u);
      // Auto-include www / non-www counterpart
      const url = new URL(u);
      if (url.hostname.startsWith('www.')) {
        url.hostname = url.hostname.slice(4);
      } else {
        url.hostname = `www.${url.hostname}`;
      }
      allowedOrigins.push(url.origin);
    }
  }

  app.use(cors({
    origin: config.isProduction
      ? (origin, callback) => {
          if (!origin || allowedOrigins.includes(origin)) {
            callback(null, origin || false);
          } else {
            callback(null, false);
          }
        }
      : '*',
    credentials: true,
  }));

  // Request ID (for tracing)
  app.use(requestIdMiddleware);

  // Body parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Compression
  app.use(compression());

  // Request logging
  app.use(requestLogger);

  // Global rate limiting
  app.use(globalRateLimiter);

  // Import and use routes
  const routes = require('./routes').default;
  app.use('/', routes);

  // 404 handler
  app.use(notFoundHandler);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

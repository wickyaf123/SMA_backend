import express, { Express } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config';
import { requestIdMiddleware } from './middleware/requestId';
import { requestLogger } from './middleware/requestLogger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { globalRateLimiter } from './middleware/rateLimit';
import routes from './routes';

/**
 * Create and configure Express application
 */
export function createApp(): Express {
  const app = express();

  // Railway terminates TLS at its edge proxy and sets X-Forwarded-For.
  // Trust exactly one hop so express-rate-limit can extract the real client
  // IP without over-trusting (which would allow IP spoofing).
  if (config.isProduction) {
    app.set('trust proxy', 1);
  }

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

  // Routes
  app.use('/', routes);

  // 404 handler
  app.use(notFoundHandler);

  // Error handler (must be last)
  app.use(errorHandler);

  return app;
}

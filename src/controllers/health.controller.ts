import { Request, Response } from 'express';
import axios from 'axios';
import { asyncHandler } from '../middleware/errorHandler';
import { sendSuccess } from '../utils/response';
import { checkDatabaseHealth } from '../config/database';
import { checkRedisHealth } from '../config/redis';
import { config } from '../config';
import { logger } from '../utils/logger';

interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'degraded' | 'unconfigured';
  latencyMs?: number;
  message?: string;
}

/**
 * Check external API health with timeout
 */
async function checkExternalApi(
  name: string,
  checkFn: () => Promise<boolean>
): Promise<ServiceHealth> {
  const start = Date.now();
  try {
    const isHealthy = await Promise.race([
      checkFn(),
      new Promise<boolean>((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), 5000)
      ),
    ]);
    return {
      status: isHealthy ? 'healthy' : 'unhealthy',
      latencyMs: Date.now() - start,
    };
  } catch (error: any) {
    logger.warn({ service: name, error: error.message }, 'External API health check failed');
    return {
      status: 'unhealthy',
      latencyMs: Date.now() - start,
      message: error.message,
    };
  }
}

/**
 * Check if GHL API is reachable
 */
async function checkGHLHealth(): Promise<boolean> {
  if (!config.ghl.apiKey || !config.ghl.locationId) {
    return false; // Not configured
  }
  const response = await axios.get(
    `${config.ghl.baseUrl}/locations/${config.ghl.locationId}`,
    {
      headers: { 
        Authorization: `Bearer ${config.ghl.apiKey}`,
        Version: '2021-07-28',
      },
      timeout: 5000,
    }
  );
  return response.status === 200;
}

/**
 * Check if Instantly API is reachable
 */
async function checkInstantlyHealth(): Promise<boolean> {
  if (!config.instantly.apiKey) {
    return false;
  }
  // Try v2 API first (Bearer token auth)
  const response = await axios.get(
    'https://api.instantly.ai/api/v2/campaigns',
    {
      headers: { Authorization: `Bearer ${config.instantly.apiKey}` },
      params: { limit: 1 },
      timeout: 5000,
    }
  );
  return response.status === 200;
}

/**
 * Check if Apollo API is reachable
 */
async function checkApolloHealth(): Promise<boolean> {
  if (!config.apollo.apiKey) {
    return false;
  }
  const response = await axios.post(
    'https://api.apollo.io/api/v1/mixed_people/api_search',
    { per_page: 1, page: 1 },
    {
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': config.apollo.apiKey,
      },
      timeout: 5000,
    }
  );
  return response.status === 200;
}

/**
 * Check if NeverBounce API is reachable
 */
async function checkNeverBounceHealth(): Promise<boolean> {
  if (!config.neverBounce.apiKey) {
    return false;
  }
  const response = await axios.get(
    `${config.neverBounce.baseUrl}/account/info`,
    {
      params: { key: config.neverBounce.apiKey },
      timeout: 5000,
    }
  );
  return response.status === 200 && response.data.status === 'success';
}

/**
 * Check if Twilio API is reachable
 */
async function checkTwilioHealth(): Promise<boolean> {
  if (!config.twilio.accountSid || !config.twilio.authToken) {
    return false;
  }
  const response = await axios.get(
    `https://api.twilio.com/2010-04-01/Accounts/${config.twilio.accountSid}.json`,
    {
      auth: {
        username: config.twilio.accountSid,
        password: config.twilio.authToken,
      },
      timeout: 5000,
    }
  );
  return response.status === 200;
}

/**
 * Check if Apify API is reachable
 */
async function checkApifyHealth(): Promise<boolean> {
  if (!config.apify.apiKey) {
    return false;
  }
  const response = await axios.get(
    'https://api.apify.com/v2/users/me',
    {
      headers: { Authorization: `Bearer ${config.apify.apiKey}` },
      timeout: 5000,
    }
  );
  return response.status === 200;
}

/**
 * Check if Hunter.io API is reachable
 */
async function checkHunterHealth(): Promise<boolean> {
  if (!config.hunter.apiKey) {
    return false;
  }
  const response = await axios.get(
    `${config.hunter.baseUrl}/account`,
    {
      params: { api_key: config.hunter.apiKey },
      timeout: 5000,
    }
  );
  return response.status === 200;
}

/**
 * Basic health check (no auth required)
 * GET /health
 */
export const getBasicHealth = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * Detailed system health check (requires auth)
 * GET /api/v1/health
 */
export const getSystemHealth = asyncHandler(async (req: Request, res: Response) => {
  // Check core services
  const [databaseHealthy, redisHealthy] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
  ]);

  const services: Record<string, ServiceHealth> = {
    database: { status: databaseHealthy ? 'healthy' : 'unhealthy' },
    redis: { status: redisHealthy ? 'healthy' : 'unhealthy' },
  };

  // Determine overall status based on core services
  const coreHealthy = databaseHealthy && redisHealthy;
  const overallStatus = coreHealthy ? 'healthy' : 'degraded';
  const statusCode = coreHealthy ? 200 : 503;

  return res.status(statusCode).json({
    success: true,
    data: {
      status: overallStatus,
      version: '1.0.0',
      environment: config.nodeEnv,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services,
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Extended health check including external APIs (requires auth)
 * GET /api/v1/health/extended
 */
export const getExtendedHealth = asyncHandler(async (req: Request, res: Response) => {
  // Check core services
  const [databaseHealthy, redisHealthy] = await Promise.all([
    checkDatabaseHealth(),
    checkRedisHealth(),
  ]);

  // Check external APIs in parallel
  const [
    ghlHealth, 
    instantlyHealth, 
    apolloHealth, 
    neverBounceHealth, 
    twilioHealth,
    apifyHealth,
    hunterHealth,
  ] = await Promise.all([
    config.ghl.apiKey
      ? checkExternalApi('GoHighLevel', checkGHLHealth)
      : Promise.resolve({ status: 'unconfigured' as const }),
    config.instantly.apiKey
      ? checkExternalApi('Instantly', checkInstantlyHealth)
      : Promise.resolve({ status: 'unconfigured' as const }),
    config.apollo.apiKey
      ? checkExternalApi('Apollo', checkApolloHealth)
      : Promise.resolve({ status: 'unconfigured' as const }),
    config.neverBounce.apiKey
      ? checkExternalApi('NeverBounce', checkNeverBounceHealth)
      : Promise.resolve({ status: 'unconfigured' as const }),
    config.twilio.accountSid
      ? checkExternalApi('Twilio', checkTwilioHealth)
      : Promise.resolve({ status: 'unconfigured' as const }),
    config.apify.apiKey
      ? checkExternalApi('Apify', checkApifyHealth)
      : Promise.resolve({ status: 'unconfigured' as const }),
    config.hunter.apiKey
      ? checkExternalApi('Hunter', checkHunterHealth)
      : Promise.resolve({ status: 'unconfigured' as const }),
  ]);

  const services: Record<string, ServiceHealth> = {
    database: { status: databaseHealthy ? 'healthy' : 'unhealthy' },
    redis: { status: redisHealthy ? 'healthy' : 'unhealthy' },
    ghl: ghlHealth,
    instantly: instantlyHealth,
    apollo: apolloHealth,
    neverBounce: neverBounceHealth,
    twilio: twilioHealth,
    apify: apifyHealth,
    hunter: hunterHealth,
  };

  // Core services determine overall status
  const coreHealthy = databaseHealthy && redisHealthy;
  
  // External services affect status but don't cause failure
  const externalServices = [ghlHealth, instantlyHealth, apolloHealth, neverBounceHealth, twilioHealth, apifyHealth, hunterHealth];
  const unhealthyCount = externalServices.filter(s => s.status === 'unhealthy').length;
  const externalHealthy = unhealthyCount === 0;

  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';
  if (!coreHealthy) {
    overallStatus = 'unhealthy';
  } else if (!externalHealthy) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'healthy';
  }

  const statusCode = coreHealthy ? 200 : 503;

  return res.status(statusCode).json({
    success: true,
    data: {
      status: overallStatus,
      version: '1.0.0',
      environment: config.nodeEnv,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      services,
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
    },
    meta: {
      timestamp: new Date().toISOString(),
    },
  });
});

/**
 * Get API version info
 * GET /api/v1/version
 */
export const getVersion = asyncHandler(async (req: Request, res: Response) => {
  return sendSuccess(res, {
    version: '1.0.0',
    apiVersion: 'v1',
    environment: config.nodeEnv,
    buildDate: new Date().toISOString(),
  });
});


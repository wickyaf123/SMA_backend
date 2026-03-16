import dotenv from 'dotenv';
import { z } from 'zod';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

/**
 * Environment variable schema with Zod validation
 */
const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  API_KEY: z.string().min(1, 'API_KEY is required'),
  FRONTEND_URL: z.string().url().optional(),

  // Database
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  DIRECT_URL: z.string().url('DIRECT_URL must be a valid URL').optional(),

  // Redis
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),

  // Apollo
  APOLLO_API_KEY: z.string().optional(),
  APOLLO_WEBHOOK_URL: z.string().url().optional(),

  // Instantly
  INSTANTLY_API_KEY: z.string().min(1, 'INSTANTLY_API_KEY is required'),
  INSTANTLY_CAMPAIGN_ID: z.string().optional(),

  // Twilio
  TWILIO_ACCOUNT_SID: z.string().min(1, 'TWILIO_ACCOUNT_SID is required'),
  TWILIO_AUTH_TOKEN: z.string().min(1, 'TWILIO_AUTH_TOKEN is required'),
  TWILIO_PHONE_NUMBER: z.string().min(1, 'TWILIO_PHONE_NUMBER is required'),

  // NeverBounce
  NEVERBOUNCE_API_KEY: z.string().min(1, 'NEVERBOUNCE_API_KEY is required'),

  // PhantomBuster
  PHANTOMBUSTER_API_KEY: z.string().min(1, 'PHANTOMBUSTER_API_KEY is required'),
  PHANTOMBUSTER_PROFILE_VISITOR_AGENT_ID: z.string().optional(),
  PHANTOMBUSTER_CONNECTION_AGENT_ID: z.string().optional(),
  PHANTOMBUSTER_MESSAGE_AGENT_ID: z.string().optional(),
  PHANTOMBUSTER_INBOX_AGENT_ID: z.string().optional(),

  // Google Sheets (for PhantomBuster input)
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().email().optional(),
  GOOGLE_PRIVATE_KEY: z.string().optional(),

  // Hunter.io (Phase 3.5 - Email Enrichment)
  HUNTER_API_KEY: z.string().optional(),

  // Apify (Phase 3.5 - Google Maps Scraper)
  APIFY_API_KEY: z.string().optional(),

  // Shovels (Permit Intelligence)
  SHOVELS_API_KEY: z.string().min(1, 'SHOVELS_API_KEY is required'),

  // Realie (Property Data Enrichment)
  REALIE_API_KEY: z.string().optional(),

  // Clay (Enrichment)
  CLAY_WEBHOOK_SECRET: z.string().optional(),
  CLAY_TABLE_URL: z.string().url().optional(),

  // Anthropic (Reply Classification)
  ANTHROPIC_API_KEY: z.string().optional(),

  // GoHighLevel (Phase 3.5 - SMS + Unified Inbox + Email Notifications)
  GHL_API_KEY: z.string().optional(),
  GHL_LOCATION_ID: z.string().optional(),
  GHL_PHONE_NUMBER: z.string().optional(),
  GHL_BASE_URL: z.string().url().optional().default('https://rest.gohighlevel.com/v1'),

  // Email Notifications (Phase 3.5)
  NOTIFICATION_EMAIL: z.string().email().optional(),

  // Slack (optional - DEPRECATED in Phase 3.5, replaced by GHL email)
  SLACK_WEBHOOK_URL: z.string().url().optional().or(z.literal('')),
  SLACK_BOT_TOKEN: z.string().optional().or(z.literal('')),

  // Sentry (Error Tracking)
  SENTRY_DSN: z.string().url().optional(),

  // Rate Limits
  EMAIL_RATE_LIMIT_PER_HOUR: z.string().default('100'),
  SMS_RATE_LIMIT_PER_HOUR: z.string().default('50'),
  LINKEDIN_RATE_LIMIT_PER_DAY: z.string().default('50'),

  // Business Hours
  BUSINESS_HOURS_START: z.string().default('9'),
  BUSINESS_HOURS_END: z.string().default('17'),
});

/**
 * Validate and parse environment variables
 */
function validateEnv() {
  try {
    const env = envSchema.parse(process.env);
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      logger.error({ errors: error.errors }, 'Environment variable validation failed');
      const missingVars = error.errors.map((err) => `${err.path.join('.')}: ${err.message}`);
      throw new Error(
        `Invalid environment variables:\n${missingVars.join('\n')}\n\nPlease check your .env file.`
      );
    }
    throw error;
  }
}

const env = validateEnv();

/**
 * Type-safe configuration object
 */
export const config = {
  nodeEnv: env.NODE_ENV,
  port: parseInt(env.PORT, 10),
  apiKey: env.API_KEY,
  isDevelopment: env.NODE_ENV === 'development',
  isProduction: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',

  database: {
    url: env.DATABASE_URL,
  },

  redis: {
    url: env.REDIS_URL,
  },

  apollo: {
    apiKey: env.APOLLO_API_KEY,
    baseUrl: 'https://api.apollo.io/v1',
    webhookUrl: env.APOLLO_WEBHOOK_URL,
  },

  instantly: {
    apiKey: env.INSTANTLY_API_KEY,
    campaignId: env.INSTANTLY_CAMPAIGN_ID,
    baseUrl: 'https://api.instantly.ai/api/v1',
  },

  twilio: {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    phoneNumber: env.TWILIO_PHONE_NUMBER,
  },

  neverBounce: {
    apiKey: env.NEVERBOUNCE_API_KEY,
    baseUrl: 'https://api.neverbounce.com/v4',
  },

  phantomBuster: {
    apiKey: env.PHANTOMBUSTER_API_KEY,
    baseUrl: 'https://api.phantombuster.com/api/v2',
    agents: {
      profileVisitor: env.PHANTOMBUSTER_PROFILE_VISITOR_AGENT_ID,
      connection: env.PHANTOMBUSTER_CONNECTION_AGENT_ID,
      message: env.PHANTOMBUSTER_MESSAGE_AGENT_ID,
      inbox: env.PHANTOMBUSTER_INBOX_AGENT_ID,
    },
  },

  googleSheets: {
    serviceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    privateKey: env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'), // Replace escaped newlines
  },

  // Phase 3.5: New Integrations
  hunter: {
    apiKey: env.HUNTER_API_KEY,
    baseUrl: 'https://api.hunter.io/v2',
  },

  apify: {
    apiKey: env.APIFY_API_KEY,
    baseUrl: 'https://api.apify.com/v2',
  },

  shovels: {
    apiKey: env.SHOVELS_API_KEY,
    baseUrl: 'https://api.shovels.ai/v2',
  },

  realie: {
    apiKey: env.REALIE_API_KEY,
    baseUrl: 'https://app.realie.ai/api',
  },

  clay: {
    webhookSecret: env.CLAY_WEBHOOK_SECRET,
    tableUrl: env.CLAY_TABLE_URL,
  },

  anthropic: {
    apiKey: env.ANTHROPIC_API_KEY,
  },

  ghl: {
    apiKey: env.GHL_API_KEY,
    locationId: env.GHL_LOCATION_ID,
    phoneNumber: env.GHL_PHONE_NUMBER,
    baseUrl: env.GHL_BASE_URL || 'https://rest.gohighlevel.com/v1',
  },

  notifications: {
    email: env.NOTIFICATION_EMAIL,
  },

  // Deprecated in Phase 3.5
  slack: {
    webhookUrl: env.SLACK_WEBHOOK_URL,
    botToken: env.SLACK_BOT_TOKEN,
  },

  // Sentry Error Tracking
  sentry: {
    dsn: env.SENTRY_DSN,
  },

  rateLimits: {
    email: {
      perHour: parseInt(env.EMAIL_RATE_LIMIT_PER_HOUR, 10),
    },
    sms: {
      perHour: parseInt(env.SMS_RATE_LIMIT_PER_HOUR, 10),
    },
    linkedin: {
      perDay: parseInt(env.LINKEDIN_RATE_LIMIT_PER_DAY, 10),
    },
  },

  businessHours: {
    start: parseInt(env.BUSINESS_HOURS_START, 10),
    end: parseInt(env.BUSINESS_HOURS_END, 10),
  },
} as const;

export type Config = typeof config;

// Log successful configuration load
if (config.isDevelopment) {
  logger.info('Configuration loaded successfully');
  logger.debug(
    {
      nodeEnv: config.nodeEnv,
      port: config.port,
      hasDatabaseUrl: !!config.database.url,
      hasRedisUrl: !!config.redis.url,
    },
    'Config details'
  );
}


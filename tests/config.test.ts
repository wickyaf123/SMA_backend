import { describe, it, expect, beforeAll } from 'vitest';

describe('Configuration', () => {
  beforeAll(() => {
    // Ensure required env vars are set for tests
    process.env.NODE_ENV = 'test';
    process.env.API_KEY = 'test-api-key';
    process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.APOLLO_API_KEY = 'test-apollo-key';
    process.env.INSTANTLY_API_KEY = 'test-instantly-key';
    process.env.TWILIO_ACCOUNT_SID = 'ACtest123';
    process.env.TWILIO_AUTH_TOKEN = 'test-token';
    process.env.TWILIO_PHONE_NUMBER = '+15551234567';
    process.env.NEVERBOUNCE_API_KEY = 'test-neverbounce-key';
    process.env.PHANTOMBUSTER_API_KEY = 'test-phantombuster-key';
  });

  it('should load configuration without errors', async () => {
    const { config } = await import('../src/config');
    expect(config).toBeDefined();
    expect(config.nodeEnv).toBe('test');
  });

  it('should have all required configuration properties', async () => {
    const { config } = await import('../src/config');

    expect(config.port).toBeTypeOf('number');
    expect(config.apiKey).toBeDefined();
    expect(config.database.url).toBeDefined();
    expect(config.redis.url).toBeDefined();
    expect(config.apollo.apiKey).toBeDefined();
    expect(config.instantly.apiKey).toBeDefined();
    expect(config.twilio.accountSid).toBeDefined();
    expect(config.neverBounce.apiKey).toBeDefined();
    expect(config.phantomBuster.apiKey).toBeDefined();
  });

  it('should have correct rate limit defaults', async () => {
    const { config } = await import('../src/config');

    expect(config.rateLimits.email.perHour).toBe(100);
    expect(config.rateLimits.sms.perHour).toBe(50);
    expect(config.rateLimits.linkedin.perDay).toBe(50);
  });

  it('should have correct business hours defaults', async () => {
    const { config } = await import('../src/config');

    expect(config.businessHours.start).toBe(9);
    expect(config.businessHours.end).toBe(17);
  });

  it('should have correct base URLs', async () => {
    const { config } = await import('../src/config');

    expect(config.apollo.baseUrl).toBe('https://api.apollo.io/v1');
    expect(config.instantly.baseUrl).toBe('https://api.instantly.ai/api/v1');
    expect(config.neverBounce.baseUrl).toBe('https://api.neverbounce.com/v4');
    expect(config.phantomBuster.baseUrl).toBe('https://api.phantombuster.com/api/v2');
  });

  it('should identify environment correctly', async () => {
    const { config } = await import('../src/config');

    expect(config.isTest).toBe(true);
    expect(config.isDevelopment).toBe(false);
    expect(config.isProduction).toBe(false);
  });
});


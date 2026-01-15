import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';
import { connectDatabase, disconnectDatabase } from '../../src/config/database';
import { disconnectRedis } from '../../src/config/redis';
import { Express } from 'express';

describe('Health API', () => {
  let app: Express;
  const apiKey = process.env.API_KEY || 'test-api-key';

  beforeAll(async () => {
    await connectDatabase();
    app = createApp();
  });

  afterAll(async () => {
    await disconnectDatabase();
    await disconnectRedis();
  });

  describe('GET /health', () => {
    it('should return basic health status without auth', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status', 'ok');
      expect(response.body.data).toHaveProperty('timestamp');
      expect(response.body.data).toHaveProperty('uptime');
    });

    it('should include uptime as a number', async () => {
      const response = await request(app).get('/health');

      expect(response.status).toBe(200);
      expect(typeof response.body.data.uptime).toBe('number');
      expect(response.body.data.uptime).toBeGreaterThan(0);
    });
  });

  describe('GET /api/v1/health', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/v1/health');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should return detailed health status with auth', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .set('Authorization', `Bearer ${apiKey}`);

      expect(response.status).toBeOneOf([200, 503]); // 200 if healthy, 503 if degraded
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('version');
      expect(response.body.data).toHaveProperty('environment');
      expect(response.body.data).toHaveProperty('services');
    });

    it('should check database health', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .set('Authorization', `Bearer ${apiKey}`);

      expect(response.body.data.services).toHaveProperty('database');
      expect(['healthy', 'unhealthy']).toContain(
        response.body.data.services.database
      );
    });

    it('should check redis health', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .set('Authorization', `Bearer ${apiKey}`);

      expect(response.body.data.services).toHaveProperty('redis');
      expect(['healthy', 'unhealthy']).toContain(
        response.body.data.services.redis
      );
    });

    it('should include version information', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .set('Authorization', `Bearer ${apiKey}`);

      expect(response.body.data).toHaveProperty('version');
      expect(typeof response.body.data.version).toBe('string');
    });
  });

  describe('GET /api/v1/version', () => {
    it('should require authentication', async () => {
      const response = await request(app).get('/api/v1/version');

      expect(response.status).toBe(401);
    });

    it('should return version information with auth', async () => {
      const response = await request(app)
        .get('/api/v1/version')
        .set('Authorization', `Bearer ${apiKey}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('version');
      expect(response.body.data).toHaveProperty('apiVersion');
      expect(response.body.data).toHaveProperty('environment');
    });
  });

  describe('404 Not Found', () => {
    it('should return 404 for unknown routes', async () => {
      const response = await request(app).get('/api/v1/unknown');

      expect(response.status).toBe(404);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('Response Format', () => {
    it('should include meta information', async () => {
      const response = await request(app).get('/health');

      expect(response.body).toHaveProperty('meta');
      expect(response.body.meta).toHaveProperty('timestamp');
    });

    it('should include X-Request-ID header', async () => {
      const response = await request(app).get('/health');

      expect(response.headers).toHaveProperty('x-request-id');
    });
  });
});


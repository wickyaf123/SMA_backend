import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express, { Express } from 'express';
import { authenticate } from '../src/middleware/auth';
import { validate } from '../src/middleware/validate';
import { errorHandler } from '../src/middleware/errorHandler';
import { z } from 'zod';

describe('Middleware', () => {
  let app: Express;

  beforeEach(() => {
    app = express();
    app.use(express.json());
  });

  describe('Authentication Middleware', () => {
    beforeEach(() => {
      app.get('/protected', authenticate, (req, res) => {
        res.json({ success: true, message: 'Authenticated' });
      });
      app.use(errorHandler);
    });

    it('should reject requests without authorization header', async () => {
      const response = await request(app).get('/protected');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject requests with invalid format', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'InvalidFormat');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should reject requests with wrong API key', async () => {
      const response = await request(app)
        .get('/protected')
        .set('Authorization', 'Bearer wrong-key');

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it('should accept requests with valid API key', async () => {
      // Get API key from environment (set in test config)
      const apiKey = process.env.API_KEY || 'test-api-key';
      
      const response = await request(app)
        .get('/protected')
        .set('Authorization', `Bearer ${apiKey}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Validation Middleware', () => {
    const testSchema = z.object({
      email: z.string().email(),
      age: z.number().min(18),
    });

    beforeEach(() => {
      app.post('/validate', validate(testSchema, 'body'), (req, res) => {
        res.json({ success: true, data: req.body });
      });
      app.use(errorHandler);
    });

    it('should reject invalid data', async () => {
      const response = await request(app).post('/validate').send({
        email: 'invalid-email',
        age: 15,
      });

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should accept valid data', async () => {
      const response = await request(app).post('/validate').send({
        email: 'test@example.com',
        age: 25,
      });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should provide detailed validation errors', async () => {
      const response = await request(app).post('/validate').send({
        email: 'invalid',
        age: 'not-a-number',
      });

      expect(response.status).toBe(400);
      expect(response.body.error.details).toBeDefined();
      expect(response.body.error.details.errors).toBeInstanceOf(Array);
    });
  });

  describe('Error Handler Middleware', () => {
    beforeEach(() => {
      app.get('/error', () => {
        throw new Error('Test error');
      });
      app.use(errorHandler);
    });

    it('should catch and format errors', async () => {
      const response = await request(app).get('/error');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();
    });

    it('should include request ID in error response', async () => {
      const response = await request(app)
        .get('/error')
        .set('X-Request-ID', 'test-request-id');

      expect(response.body.meta).toBeDefined();
      expect(response.body.meta.requestId).toBe('test-request-id');
    });
  });
});


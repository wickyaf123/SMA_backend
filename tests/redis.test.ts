import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { redis, checkRedisHealth, disconnectRedis } from '../src/config/redis';

describe('Redis', () => {
  beforeAll(async () => {
    // Wait for Redis to connect
    await new Promise((resolve) => setTimeout(resolve, 1000));
  });

  afterAll(async () => {
    await disconnectRedis();
  });

  it('should be defined', () => {
    expect(redis).toBeDefined();
  });

  it('should connect to Redis', async () => {
    const isHealthy = await checkRedisHealth();
    expect(isHealthy).toBe(true);
  });

  it('should set and get a value', async () => {
    const key = `test:${Date.now()}`;
    const value = 'test-value';

    await redis.set(key, value);
    const result = await redis.get(key);

    expect(result).toBe(value);

    // Cleanup
    await redis.del(key);
  });

  it('should set a value with expiration', async () => {
    const key = `test:expiry:${Date.now()}`;
    const value = 'expiring-value';

    await redis.set(key, value, 'EX', 1); // Expires in 1 second
    const result = await redis.get(key);
    expect(result).toBe(value);

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 1100));
    const expired = await redis.get(key);
    expect(expired).toBeNull();
  });

  it('should increment a counter', async () => {
    const key = `test:counter:${Date.now()}`;

    const count1 = await redis.incr(key);
    expect(count1).toBe(1);

    const count2 = await redis.incr(key);
    expect(count2).toBe(2);

    // Cleanup
    await redis.del(key);
  });

  it('should handle hash operations', async () => {
    const key = `test:hash:${Date.now()}`;

    await redis.hset(key, 'field1', 'value1');
    await redis.hset(key, 'field2', 'value2');

    const value1 = await redis.hget(key, 'field1');
    const value2 = await redis.hget(key, 'field2');

    expect(value1).toBe('value1');
    expect(value2).toBe('value2');

    const all = await redis.hgetall(key);
    expect(all).toEqual({ field1: 'value1', field2: 'value2' });

    // Cleanup
    await redis.del(key);
  });
});


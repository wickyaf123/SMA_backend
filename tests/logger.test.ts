import { describe, it, expect } from 'vitest';
import { logger } from '../src/utils/logger';

describe('Logger', () => {
  it('should be defined', () => {
    expect(logger).toBeDefined();
  });

  it('should have standard logging methods', () => {
    expect(logger.info).toBeTypeOf('function');
    expect(logger.error).toBeTypeOf('function');
    expect(logger.warn).toBeTypeOf('function');
    expect(logger.debug).toBeTypeOf('function');
  });

  it('should log without errors', () => {
    expect(() => logger.info('Test log message')).not.toThrow();
    expect(() => logger.error('Test error message')).not.toThrow();
    expect(() => logger.warn('Test warning message')).not.toThrow();
    expect(() => logger.debug('Test debug message')).not.toThrow();
  });

  it('should handle objects in logs', () => {
    expect(() =>
      logger.info({ test: 'data', number: 123 }, 'Test with object')
    ).not.toThrow();
  });
});


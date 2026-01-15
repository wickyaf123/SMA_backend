import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        'tests/',
        '**/*.test.ts',
        '**/*.config.ts',
      ],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@config': path.resolve(__dirname, './src/config'),
      '@services': path.resolve(__dirname, './src/services'),
      '@integrations': path.resolve(__dirname, './src/integrations'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@types': path.resolve(__dirname, './src/types'),
      '@middleware': path.resolve(__dirname, './src/middleware'),
      '@controllers': path.resolve(__dirname, './src/controllers'),
      '@routes': path.resolve(__dirname, './src/routes'),
      '@jobs': path.resolve(__dirname, './src/jobs'),
    },
  },
});


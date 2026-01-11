import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['lib/src/**/*.ts'],
      exclude: ['lib/src/**/*.d.ts', 'lib/src/**/index.ts'],
    },
    // Timeout for each test
    testTimeout: 10000,
    // Mock timers
    fakeTimers: {
      shouldAdvanceTime: true,
    },
  },
  resolve: {
    alias: {
      '@israeli-law-rag/lib': './lib/src',
    },
  },
});

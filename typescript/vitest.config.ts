import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'istanbul',
      include: ['src/**/*.ts'],
      // types.ts and index.ts are type-only — no executable lines to cover
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/types.ts', 'src/index.ts'],
      thresholds: {
        lines: 90,
        functions: 90,
        branches: 85,
        statements: 90,
      },
      reporter: ['text', 'lcov'],
    },
  },
});

import { defineConfig } from 'vitest/config';

/** The Expo domain suite is independent of the web workspace and Playwright. */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'frontend/**', 'backend/**', 'dist/**', 'web-build/**'],
  },
});

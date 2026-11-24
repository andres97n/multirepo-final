import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

/**
 * `server-only` resolves to a throwing module outside the `react-server`
 * condition. Tests run outside Next, so alias it to an empty stub — the
 * src/lib/server-only.test.ts fixture proves the real package throws for
 * client imports (AC-M08.7).
 */
const serverOnlyStub = fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url));

export default defineConfig({
  test: {
    projects: [
      {
        oxc: { jsx: { runtime: 'automatic' } },
        resolve: { alias: { 'server-only': serverOnlyStub } },
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/lib/**/*.test.ts', 'src/proxy*.test.ts', 'src/app/api/**/*.test.ts'],
        },
      },
      {
        oxc: { jsx: { runtime: 'automatic' } },
        resolve: { alias: { 'server-only': serverOnlyStub } },
        test: {
          name: 'jsdom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['src/test/setup.ts'],
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/test/**'],
      thresholds: {
        lines: 80,
        statements: 80,
        functions: 80,
        branches: 80,
        // @module:auth
        'src/lib/session.ts': { lines: 90, statements: 90, functions: 90, branches: 90 },
        'src/lib/csrf.ts': { lines: 90, statements: 90, functions: 90, branches: 90 },
        'src/lib/safe-redirect.ts': { lines: 90, statements: 90, functions: 90, branches: 90 },
        // @end-module:auth
      },
    },
  },
});

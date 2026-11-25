import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
        target: 'es2023',
      },
    }),
  ],
  test: {
    include: ['src/**/*.spec.ts'],
    // First run downloads the mongodb-memory-server binary.
    hookTimeout: 120000,
    testTimeout: 30000,
    coverage: {
      provider: 'v8',
      include: [
        'src/common/**/*.ts',
        'src/config/**/*.ts',
        'src/infra/database/**/*.ts',
        // @module:auth
        'src/modules/auth/**/*.ts',
        // @end-module:auth
      ],
      exclude: [
        'src/**/*.spec.ts',
        'src/**/testing/**',
        'src/**/*.contract.ts',
        'src/infra/database/mongo/sync-indexes.ts',
        'src/**/index.ts',
      ],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 80,
        'src/infra/database/**': { lines: 85 },
        // @module:auth
        // Security-critical module (AC-M06.18); services land in slice 2.
        'src/modules/auth/**': { lines: 90 },
        // @end-module:auth
      },
    },
  },
});

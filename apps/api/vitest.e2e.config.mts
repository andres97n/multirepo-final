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
    include: ['test/**/*.e2e-spec.ts'],
    // @module:db-mongo
    globalSetup: ['./test/global-setup.ts'],
    // @end-module:db-mongo
    // @module:db-postgres
    // globalSetup: ['./test/global-setup-postgres.ts'],
    // @end-module:db-postgres
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 120000,
  },
});

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
    coverage: {
      provider: 'v8',
      include: ['src/common/**/*.ts', 'src/config/**/*.ts'],
      exclude: ['src/**/*.spec.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: { lines: 80 },
    },
  },
});

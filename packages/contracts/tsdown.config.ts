import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    http: 'src/http/index.ts',
    errors: 'src/errors/index.ts',
    pagination: 'src/pagination/index.ts',
    filters: 'src/filters/index.ts',
    health: 'src/health/index.ts',
    auth: 'src/auth/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  platform: 'neutral',
  deps: { neverBundle: ['zod'] },
});

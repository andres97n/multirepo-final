import base from '@repo/config-eslint/base';

// Fixture trees for scripts/modules.test.mjs are data, not project sources.
export default [{ ignores: ['scripts/__fixtures__/**'] }, ...base];

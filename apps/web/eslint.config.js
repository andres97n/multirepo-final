import next from '@repo/config-eslint/next';

// Next + react-hooks rules with 0 warnings (AC-M08.11).
export default [
  ...next,
  {
    // Node globals for the build scripts (the shared config only maps globals for ts/tsx/js/jsx).
    files: ['**/*.mjs'],
    languageOptions: { globals: { console: 'readonly', process: 'readonly' } },
  },
];

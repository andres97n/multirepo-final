import nextPlugin from '@next/eslint-plugin-next';
import playwright from 'eslint-plugin-playwright';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

import base from './base.js';

export default tseslint.config(
  base,
  {
    files: ['**/*.{ts,tsx,js,jsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    plugins: { '@next/next': nextPlugin, 'react-hooks': reactHooks },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      ...reactHooks.configs.recommended.rules,
    },
  },
  {
    // Playwright specs (M10).
    files: ['**/e2e/**/*.ts'],
    ...playwright.configs['flat/recommended'],
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/no-focused-test': 'error',
      'playwright/no-skipped-test': 'error',
    },
  },
);

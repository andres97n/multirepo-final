import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';

import { API_URL, WEB_URL, apiEnv, webEnv } from './e2e/env';

// The project follows the installed modules: the auth project exists only
// while the `(auth)` route group does (AC-M10.4). Pruning `auth` selects no-auth.
const hasAuth = existsSync(fileURLToPath(new URL('./src/app/(auth)', import.meta.url)));
const projectName = hasAuth ? 'auth' : 'no-auth';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: WEB_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: projectName,
      testMatch: [`${projectName}/**/*.spec.ts`, 'shared/**/*.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node scripts/e2e-server.mjs',
      cwd: '../api',
      url: `${API_URL}/api/v1/health/ready`,
      env: apiEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'pnpm build && pnpm start',
      url: `${WEB_URL}/api/health`,
      env: webEnv,
      reuseExistingServer: !process.env.CI,
      timeout: 180_000,
    },
  ],
});

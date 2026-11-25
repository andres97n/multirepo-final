import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

import { expect, type Page } from '@playwright/test';

import { apiEnv } from '../env';

const execFileAsync = promisify(execFile);

/** `apps/api`, where the built seed command lives. */
const API_DIR = new URL('../../../api/', import.meta.url);

/** The exact string rendered by `login-form.tsx` for every login failure. */
export const GENERIC_ERROR =
  'Unable to sign in. Please check your email and password and try again.';

export interface TestUser {
  email: string;
  password: string;
}

/**
 * Creates a fresh admin for one test through the built `seed:admin` command
 * (no test-only endpoint). Each call uses a unique email, so tests never share
 * state (AC-M10.8).
 */
export async function createUser(): Promise<TestUser> {
  const user: TestUser = {
    email: `e2e-${randomUUID()}@example.com`,
    password: `e2e-password-${randomUUID()}`,
  };
  await execFileAsync(process.execPath, ['dist/modules/auth/seed-admin.js'], {
    cwd: API_DIR,
    env: {
      ...process.env,
      ...apiEnv,
      SEED_ADMIN_EMAIL: user.email,
      SEED_ADMIN_PASSWORD: user.password,
    },
  });
  return user;
}

/** Fills and submits the login form. */
export async function login(page: Page, email: string, password: string): Promise<void> {
  if (!new URL(page.url()).pathname.startsWith('/login')) {
    await page.goto('/login');
  }
  const signIn = page.getByRole('button', { name: 'Sign in' });
  // The form keeps submit disabled until it has hydrated.
  await expect(signIn).toBeEnabled();
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await signIn.click();
}

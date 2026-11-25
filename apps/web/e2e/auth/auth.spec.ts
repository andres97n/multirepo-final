import { randomUUID } from 'node:crypto';

import { WEB_URL } from '../env';
import { test, expect } from '../fixtures';
import { GENERIC_ERROR, createUser, login } from './users';

test('login reaches the dashboard and shows the signed-in email', async ({ page }) => {
  const user = await createUser();

  await page.goto('/login');
  await login(page, user.email, user.password);

  await expect(page).toHaveURL(`${WEB_URL}/dashboard`);
  await expect(page.getByText(`Signed in as ${user.email}`)).toBeVisible();
});

test('a wrong password shows the generic error and stays on login', async ({ page }) => {
  const user = await createUser();

  await page.goto('/login');
  await login(page, user.email, `${user.password}-wrong`);

  await expect(page.getByText(GENERIC_ERROR)).toBeVisible();
  await expect(page).toHaveURL(`${WEB_URL}/login`);
});

test('a protected page redirects to login and keeps next', async ({ page }) => {
  const user = await createUser();

  await page.goto('/dashboard');
  await expect(page).toHaveURL(`${WEB_URL}/login?next=%2Fdashboard`);

  await login(page, user.email, user.password);
  await expect(page).toHaveURL(`${WEB_URL}/dashboard`);
});

test('logout returns to login and the dashboard is protected again', async ({ page }) => {
  const user = await createUser();

  await page.goto('/login');
  await login(page, user.email, user.password);
  await expect(page).toHaveURL(`${WEB_URL}/dashboard`);

  await page.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(`${WEB_URL}/login`);

  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard$/);
});

test('the session cookie is httpOnly and not readable from JavaScript', async ({
  page,
  context,
}) => {
  const user = await createUser();

  await page.goto('/login');
  await login(page, user.email, user.password);
  await expect(page).toHaveURL(`${WEB_URL}/dashboard`);

  const documentCookie = await page.evaluate(() => document.cookie);
  expect(documentCookie).not.toMatch(/(^|;\s*)(__Host-)?session=/);

  const cookies = await context.cookies();
  const session = cookies.find((cookie) => cookie.name === '__Host-session');
  expect(session?.httpOnly).toBe(true);
});

test('lockout after the configured failures rejects even the correct password', async ({
  page,
}) => {
  // LOCKOUT_THRESHOLD=2 in the e2e api env (see e2e/env.ts).
  const user = await createUser();
  const signIn = page.getByRole('button', { name: 'Sign in' });

  await page.goto('/login');
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await login(page, user.email, `${user.password}-wrong`);
    await expect(page.getByText(GENERIC_ERROR)).toBeVisible();
    await expect(signIn).toBeEnabled();
  }

  // Same generic text by design (AC-M06.10): a locked account is not revealed.
  await login(page, user.email, user.password);
  await expect(page.getByText(GENERIC_ERROR)).toBeVisible();
  await expect(page).toHaveURL(`${WEB_URL}/login`);
});

test('an unknown email shows the same generic error', async ({ page }) => {
  await page.goto('/login');
  await login(page, `e2e-unknown-${randomUUID()}@example.com`, 'e2e-unknown-password-1234');

  await expect(page.getByText(GENERIC_ERROR)).toBeVisible();
  await expect(page).toHaveURL(`${WEB_URL}/login`);
});

import { WEB_URL } from '../env';
import { test, expect } from '../fixtures';

test('home loads with the API health status', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByText('API health')).toBeVisible();
  await expect(page.getByText('Status: ok')).toBeVisible();
});

test('navigates to a public page and back', async ({ page }) => {
  await page.goto('/');
  await page.goto('/about');
  await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(`${WEB_URL}/`);
  await expect(page.getByText('API health')).toBeVisible();
});

test('an unknown route renders the 404 page', async ({ page }) => {
  const response = await page.goto('/does-not-exist');

  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: '404 — Page not found' })).toBeVisible();
});

test('/api/health reports ok', async ({ request }) => {
  const response = await request.get('/api/health');

  expect(response.status()).toBe(200);
  const body = (await response.json()) as unknown;
  expect(body).toMatchObject({ status: 'ok' });
});

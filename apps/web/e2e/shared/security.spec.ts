import { test, expect } from '../fixtures';

// /login is a public page only when the auth module is installed; without it
// the route is a 404 and still goes through the proxy, so it is checked too.
const PAGES = ['/', '/about', '/does-not-exist', '/login'];

for (const path of PAGES) {
  // The auto `violations` fixture asserts no CSP violation once the page settles.
  test(`CSP header is set and no violations on ${path}`, async ({ page }) => {
    const response = await page.goto(path);

    expect(response?.headers()['content-security-policy']).toBeDefined();
  });
}

test('the violation detector reports a blocked image', async ({ page, violations }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const image = document.createElement('img');
    image.src = 'https://example.invalid/x.png';
    document.body.append(image);
  });

  // The event and the CSP console error both record the blocked URL.
  await expect
    .poll(() => violations.filter((entry) => entry.includes('example.invalid')).length)
    .toBeGreaterThanOrEqual(2);
  // Clear the self-check's own violations so the fixture teardown passes.
  violations.length = 0;
});

test('the 404 page has a document title', async ({ page }) => {
  await page.goto('/does-not-exist');

  await expect(page).toHaveTitle('404 — Page not found');
});

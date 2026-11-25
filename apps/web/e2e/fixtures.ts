import { test as base, expect } from '@playwright/test';

/**
 * Shared test fixture. Every spec imports `test` and `expect` from here.
 *
 * The `violations` fixture is automatic: it records CSP violations
 * (`securitypolicyviolation` events plus CSP console errors) and uncaught page
 * errors for each test, and fails the test if any were recorded (AC-M10.6).
 */
export const test = base.extend<{ violations: string[] }>({
  violations: [
    async ({ page }, use) => {
      const violations: string[] = [];

      await page.exposeFunction('__cspViolation', (description: string) => {
        violations.push(description);
      });
      await page.addInitScript(() => {
        document.addEventListener('securitypolicyviolation', (event) => {
          (window as unknown as { __cspViolation: (d: string) => void }).__cspViolation(
            `${event.violatedDirective} ${event.blockedURI}`,
          );
        });
      });
      // Only CSP console errors: an expected 401 from the login form also logs.
      page.on('console', (message) => {
        if (/Content Security Policy/i.test(message.text())) {
          violations.push(message.text());
        }
      });
      page.on('pageerror', (error) => {
        violations.push(error.message);
      });

      await use(violations);
      // Let pending violation events and binding calls arrive before asserting.
      // The catch only covers a page that is already closed.
      await page
        .evaluate(
          () =>
            new Promise<void>((resolve) =>
              requestIdleCallback(
                () => {
                  resolve();
                },
                { timeout: 2000 },
              ),
            ),
        )
        .catch(() => undefined);
      expect(violations).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

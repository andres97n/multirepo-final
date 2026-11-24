/**
 * Empty stand-in for the `server-only` package: tests run outside Next, where
 * the real package throws on import. The vitest config aliases `server-only`
 * to this file; src/lib/server-only.test.ts proves the real package throws for
 * client imports (AC-M08.7).
 */
export {};

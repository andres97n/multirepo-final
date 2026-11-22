import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// vitest runs with cwd = apps/api (where vitest.config.mts lives).
const MARKER_FILES = [
  'src/app.module.ts',
  'src/config/env.schema.ts',
  '.env.example',
  '../../compose.dev.yaml',
];

const BEGIN = '@module:db-mongo';
const END = '@end-module:db-mongo';

/**
 * AC-M04.12: every file needed to remove the adapter carries balanced
 * `@module:db-mongo` regions (import, wiring, env docs, compose service).
 */
describe('db-mongo module markers (AC-M04.12)', () => {
  it.each(MARKER_FILES)('%s has balanced @module:db-mongo regions', (file) => {
    const content = readFileSync(path.join(process.cwd(), file), 'utf8');
    // The longer token must come first so `@end-module` is not counted as a begin.
    const tokens = content.match(/@end-module:db-mongo|@module:db-mongo/g) ?? [];

    const begins = tokens.filter((token) => token === BEGIN);
    const ends = tokens.filter((token) => token === END);
    expect(begins.length, `${file} must contain at least one region`).toBeGreaterThanOrEqual(1);
    expect(begins.length, `${file} begin/end counts must match`).toBe(ends.length);

    // Properly nested: every end closes the most recent open begin.
    const stack: string[] = [];
    for (const token of tokens) {
      if (token === BEGIN) {
        stack.push(token);
      } else {
        expect(stack.pop(), `${file}: ${END} without a matching ${BEGIN}`).toBe(BEGIN);
      }
    }
    expect(stack, `${file}: unclosed ${BEGIN} region`).toHaveLength(0);
  });
});

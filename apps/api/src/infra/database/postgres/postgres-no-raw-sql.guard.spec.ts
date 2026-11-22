import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const POSTGRES_DIR = __dirname;

function collectTsFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      return entry === 'testing' ? [] : collectTsFiles(full);
    }
    return entry.endsWith('.ts') && !entry.endsWith('.spec.ts') ? [full] : [];
  });
}

/** AC-M05.7: the adapter never builds SQL from strings. */
describe('postgres adapter has no raw / concatenated SQL (AC-M05.7)', () => {
  const files = collectTsFiles(POSTGRES_DIR);

  it('scans the adapter sources', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each([
    ['sql.raw', /\bsql\.raw\s*\(/],
    ['sql.identifier from input', /\bsql\.identifier\s*\(/],
    ['${...} inside sql`...` templates', /\bsql`[^`]*\$\{/],
    ['string-built raw queries', /\.(query|execute)\(\s*[`'"][^`'"]*(\$\{|['"`]\s*\+)/],
  ])('no adapter file uses %s', (_label, pattern) => {
    for (const file of files) {
      expect(
        pattern.test(readFileSync(file, 'utf8')),
        `${file} must not match ${String(pattern)}`,
      ).toBe(false);
    }
  });
});

import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// vitest runs with cwd = apps/api (where vitest.config.mts lives).
const CORE_DIR = path.join(process.cwd(), 'src', 'infra', 'database', 'core');

/** AC-M04.10: `core/` must stay driver-free (zero driver imports). */
const FORBIDDEN = ['mongoose', 'mongodb', 'mongodb-memory-server', 'pg', 'drizzle-orm'];

function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectTsFiles(full));
    } else if (entry.endsWith('.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('core has zero driver imports (AC-M04.10)', () => {
  const files = collectTsFiles(CORE_DIR);

  it('scans every file under core/ including testing/', () => {
    expect(files.length).toBeGreaterThan(3);
    expect(files.some((file) => file.includes(`testing${path.sep}`))).toBe(true);
  });

  it.each(FORBIDDEN)('no core file imports %s', (driver) => {
    const pattern = new RegExp(`from ['"]${driver}(/[^'"]*)?['"]|require\\(['"]${driver}`);
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      expect(pattern.test(source), `${file} must not import ${driver}`).toBe(false);
    }
  });
});

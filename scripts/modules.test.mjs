/**
 * Tests for scripts/modules.mjs using node:test.
 *
 * Tests operate on a copy of scripts/__fixtures__/base in a temp directory.
 * They verify: check errors, apply, idempotency, and dry-run.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import process from 'node:process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPT = join(__dirname, 'modules.mjs');
const FIXTURE_BASE = join(__dirname, '__fixtures__', 'base');

/**
 * Copies the fixture tree to a fresh temp directory. Returns the temp path.
 */
function makeTempFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'modules-test-'));
  cpSync(FIXTURE_BASE, dir, { recursive: true });
  cpSync(join(__dirname, '..', 'modules.schema.json'), join(dir, 'modules.schema.json'));
  return dir;
}

/**
 * Runs the modules script in the given root directory. Returns stdout + stderr.
 */
function run(root, args, opts = {}) {
  try {
    const stdout = execFileSync('node', [SCRIPT, ...args], {
      cwd: root,
      env: { ...process.env, MODULES_ROOT: root },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...opts,
    });
    return { stdout, stderr: '', code: 0 };
  } catch (err) {
    const e = err;
    return {
      stdout: e.stdout ?? '',
      stderr: e.stderr ?? '',
      code: e.status ?? 1,
    };
  }
}

describe('modules.mjs check', () => {
  it('passes on the base fixture', () => {
    const root = makeTempFixture();
    try {
      const { stdout, code } = run(root, ['check']);
      assert.equal(code, 0);
      assert.match(stdout, /modules:check ok/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails on an unbalanced marker (missing end)', () => {
    const root = makeTempFixture();
    try {
      // Break app.ts: remove the first @end-module:db-mongo
      const appPath = join(root, 'api/src/app.ts');
      const text = readFileSync(appPath, 'utf8');
      const broken = text.replace('// @end-module:db-mongo\n', '');
      writeFileSync(appPath, broken);
      const { stderr, code } = run(root, ['check']);
      assert.equal(code, 1);
      assert.match(stderr, /not closed by end-module/);
      assert.match(stderr, /api\/src\/app\.ts/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails on an unknown module name in a marker', () => {
    const root = makeTempFixture();
    try {
      const appPath = join(root, 'api/src/app.ts');
      const text = readFileSync(appPath, 'utf8');
      // Change BOTH start and end to unknown-db so the region is balanced but uses an unknown name
      const broken = text
        .replace(/@module:db-mongo/g, '@module:unknown-db')
        .replace(/@end-module:db-mongo/g, '@end-module:unknown-db');
      writeFileSync(appPath, broken);
      const { stderr, code } = run(root, ['check']);
      assert.equal(code, 1);
      assert.match(stderr, /unknown module name in marker: unknown-db/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails on a missing path', () => {
    const root = makeTempFixture();
    try {
      const manifestPath = join(root, 'modules.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      manifest.modules[0].paths.push('nonexistent/path');
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      const { stderr, code } = run(root, ['check']);
      assert.equal(code, 1);
      assert.match(stderr, /path does not exist: nonexistent\/path/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('fails when both db-mongo and db-postgres are selected (conflict)', () => {
    // This is validated during apply, not check. Check just validates the manifest structure.
    // But we can test that conflicts are symmetric:
    const root = makeTempFixture();
    try {
      const manifestPath = join(root, 'modules.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      // Remove the reverse conflict
      const dbPostgres = manifest.modules.find((m) => m.name === 'db-postgres');
      dbPostgres.conflicts = [];
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      const { stderr, code } = run(root, ['check']);
      assert.equal(code, 1);
      assert.match(stderr, /does not list the reverse/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  /** Edits the temp manifest, runs check, returns stderr (asserts failure). */
  function checkWith(mutate, extra = () => {}) {
    const root = makeTempFixture();
    try {
      const manifestPath = join(root, 'modules.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      mutate(manifest);
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      extra(root);
      const { stderr, code } = run(root, ['check']);
      assert.equal(code, 1);
      return stderr;
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
  const byName = (manifest, name) => manifest.modules.find((m) => m.name === name);

  it('fails when db-mongo and db-postgres are both selected', () => {
    const stderr = checkWith((m) => {
      byName(m, 'db-postgres').default = true;
    });
    assert.match(stderr, /conflict: db-mongo and db-postgres cannot both be selected/);
  });

  it('fails when auth is selected without a db module', () => {
    const stderr = checkWith(
      (m) => {
        m.modules = m.modules.filter((x) => x.group !== 'db');
      },
      (root) => {
        writeFileSync(join(root, 'api/src/app.ts'), '');
        writeFileSync(join(root, 'api/.env.example'), '');
        writeFileSync(join(root, 'compose.dev.yaml'), '');
      },
    );
    assert.match(stderr, /auth requires a module from group "db" but none is selected/);
  });

  it('fails on a marker in a file not listed in markers[] (orphan)', () => {
    const stderr = checkWith(
      () => {},
      (root) => {
        writeFileSync(
          join(root, 'api/src/orphan.ts'),
          '// @module:auth\nx;\n// @end-module:auth\n',
        );
      },
    );
    assert.match(stderr, /api\/src\/orphan\.ts:1: marker for auth in a file not listed/);
  });

  it('fails on a requires cycle', () => {
    const stderr = checkWith((m) => {
      byName(m, 'auth').requires.push('db-mongo');
      byName(m, 'db-mongo').requires.push('auth');
    });
    assert.match(stderr, /requires cycle: db-mongo -> auth -> db-mongo/);
  });

  it('fails on a schema violation', () => {
    const stderr = checkWith((m) => {
      byName(m, 'auth').kind = 'weird';
    });
    assert.match(stderr, /schema: \$\.modules\[2\]\.kind must be one of/);
  });

  it('fails when auth requires a db group but none is default', () => {
    const root = makeTempFixture();
    try {
      const manifestPath = join(root, 'modules.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      // Remove default from both db modules
      for (const m of manifest.modules) {
        if (m.group === 'db') m.default = false;
      }
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      const { stderr, code } = run(root, ['check']);
      assert.equal(code, 1);
      assert.match(stderr, /expected exactly 1 default db-group module/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('modules.mjs apply', () => {
  it('applies --db=mongo --without=auth (removes auth and db-postgres)', () => {
    const root = makeTempFixture();
    try {
      const { stdout, code } = run(root, ['apply', '--db=mongo', '--without=auth']);
      assert.equal(code, 0);
      assert.match(stdout, /Selected: db-mongo/);
      assert.match(stdout, /Removed:.*db-postgres.*auth/);

      // Paths deleted
      assert.ok(!existsSync(join(root, 'api/src/db/postgres')));
      assert.ok(!existsSync(join(root, 'api/src/auth')));
      assert.ok(!existsSync(join(root, 'web/src/auth-page')));

      // Paths kept
      assert.ok(existsSync(join(root, 'api/src/db/mongo')));

      // Deps pruned
      const apiPkg = JSON.parse(readFileSync(join(root, 'api/package.json'), 'utf8'));
      assert.ok(!Object.hasOwn(apiPkg.dependencies, 'drizzle-orm'));
      assert.ok(!Object.hasOwn(apiPkg.dependencies, 'pg'));
      assert.ok(!Object.hasOwn(apiPkg.dependencies, '@nestjs/jwt'));
      assert.ok(Object.hasOwn(apiPkg.dependencies, 'mongoose'));

      const webPkg = JSON.parse(readFileSync(join(root, 'web/package.json'), 'utf8'));
      assert.ok(!Object.hasOwn(webPkg.dependencies, 'jose'));

      // Scripts pruned
      assert.ok(!Object.hasOwn(apiPkg.scripts, 'seed:admin'));

      // Exports pruned
      const contractsPkg = JSON.parse(
        readFileSync(join(root, 'packages/contracts/package.json'), 'utf8'),
      );
      assert.ok(!Object.hasOwn(contractsPkg.exports, './auth'));

      // Markers stripped from app.ts
      const appText = readFileSync(join(root, 'api/src/app.ts'), 'utf8');
      assert.ok(!appText.includes('@module:'));
      // Kept module content present
      assert.match(appText, /MongoModule/);
      // Removed module content gone
      assert.ok(!appText.includes('PostgresModule'));
      assert.ok(!appText.includes('AuthModule'));

      // modules.json rewritten
      const newManifest = JSON.parse(readFileSync(join(root, 'modules.json'), 'utf8'));
      assert.equal(newManifest.modules.length, 1);
      assert.equal(newManifest.modules[0].name, 'db-mongo');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('applies --db=postgres (keeps auth + db-postgres)', () => {
    const root = makeTempFixture();
    try {
      const { code } = run(root, ['apply', '--db=postgres']);
      assert.equal(code, 0);

      // db-mongo removed
      assert.ok(!existsSync(join(root, 'api/src/db/mongo')));
      // db-postgres kept
      assert.ok(existsSync(join(root, 'api/src/db/postgres')));
      // auth kept
      assert.ok(existsSync(join(root, 'api/src/auth')));

      // app.ts: mongo regions stripped, postgres uncommented, auth kept
      const appText = readFileSync(join(root, 'api/src/app.ts'), 'utf8');
      assert.ok(!appText.includes('@module:'));
      assert.ok(!appText.includes('MongoModule'));
      // The commented-out engine is enabled (live code, not comments)
      assert.match(appText, /^import \{ PostgresModule \} from '\.\/db\/postgres';$/m);
      assert.match(appText, /^ {2}PostgresModule,$/m);
      assert.match(appText, /AuthModule/);

      // env: KEY=value lines uncommented, descriptions stay comments
      const env = readFileSync(join(root, 'api/.env.example'), 'utf8');
      assert.match(env, /^DATABASE_URL=postgres:/m);
      assert.match(env, /^# PostgreSQL connection string$/m);
      assert.ok(!env.includes('MONGO_URI'));

      // compose: mongo service gone, postgres kept
      const compose = readFileSync(join(root, 'compose.dev.yaml'), 'utf8');
      assert.ok(!compose.includes('mongo'));
      assert.match(compose, /postgres:/);

      // The rewritten manifest still passes check (AC-M11.7)
      assert.equal(run(root, ['check']).code, 0);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('strips a removed region nested inside a kept one', () => {
    const root = makeTempFixture();
    try {
      const proxy = join(root, 'web/src/proxy.ts');
      writeFileSync(
        proxy,
        [
          '// @module:auth',
          'const a = 1;',
          '// @module:db-postgres',
          'const pg = 2;',
          '// @end-module:db-postgres',
          'const b = 3;',
          '// @end-module:auth',
          '',
        ].join('\n'),
      );
      const manifestPath = join(root, 'modules.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      manifest.modules.find((m) => m.name === 'db-postgres').markers.push('web/src/proxy.ts');
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      assert.equal(run(root, ['apply', '--db=mongo']).code, 0);
      assert.equal(readFileSync(proxy, 'utf8'), 'const a = 1;\nconst b = 3;\n');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('strips JSX marker regions in .tsx files', () => {
    const root = makeTempFixture();
    try {
      const page = join(root, 'web/src/page.tsx');
      writeFileSync(
        page,
        [
          'export const Page = () => (',
          '  <main>',
          '    {/* @module:auth */}',
          '    <nav />',
          '    {/* @end-module:auth */}',
          '  </main>',
          ');',
          '',
        ].join('\n'),
      );
      const manifestPath = join(root, 'modules.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      manifest.modules.find((m) => m.name === 'auth').markers.push('web/src/page.tsx');
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
      assert.equal(run(root, ['check']).code, 0);
      assert.equal(run(root, ['apply', '--db=mongo', '--without=auth']).code, 0);
      assert.equal(
        readFileSync(page, 'utf8'),
        'export const Page = () => (\n  <main>\n  </main>\n);\n',
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects unknown and missing arguments', () => {
    const root = makeTempFixture();
    try {
      assert.match(run(root, ['apply']).stderr, /requires --db/);
      assert.match(run(root, ['apply', '--db=mysql']).stderr, /--db must be/);
      assert.match(run(root, ['apply', '--db=mongo', '--bogus']).stderr, /unknown argument/);
      assert.match(run(root, ['nope']).stderr, /Usage/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('refuses to write when a marker file is unbalanced', () => {
    const root = makeTempFixture();
    try {
      const appPath = join(root, 'api/src/app.ts');
      writeFileSync(appPath, readFileSync(appPath, 'utf8').replace('// @end-module:auth\n', ''));
      const { stderr, code } = run(root, ['apply', '--db=mongo']);
      assert.equal(code, 1);
      assert.match(stderr, /api\/src\/app\.ts:\d+: module:auth is not closed/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('modules.mjs apply idempotency', () => {
  it('second apply produces no changes', () => {
    const root = makeTempFixture();
    try {
      // First apply
      const { code: code1 } = run(root, ['apply', '--db=postgres', '--without=auth']);
      assert.equal(code1, 0);

      // Snapshot the tree after first apply
      const snapshot = snapshotTree(root);

      // Second apply (should have nothing to do)
      const { code: code2 } = run(root, ['apply', '--db=postgres', '--without=auth']);
      assert.equal(code2, 0);

      // No changes
      const after = snapshotTree(root);
      assert.deepEqual(after, snapshot, 'second apply should produce no file changes');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('modules.mjs apply --dry-run', () => {
  it('writes nothing', () => {
    const root = makeTempFixture();
    try {
      const before = snapshotTree(root);
      const { stdout, code } = run(root, ['apply', '--db=mongo', '--without=auth', '--dry-run']);
      assert.equal(code, 0);
      assert.match(stdout, /dry-run/);
      assert.match(stdout, /DELETE/);

      // Nothing changed
      const after = snapshotTree(root);
      assert.deepEqual(after, before, 'dry-run should not modify any files');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe('modules.mjs list', () => {
  it('shows all modules', () => {
    const root = makeTempFixture();
    try {
      const { stdout, code } = run(root, ['list']);
      assert.equal(code, 0);
      assert.match(stdout, /db-mongo/);
      assert.match(stdout, /db-postgres/);
      assert.match(stdout, /auth/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Snapshots the file tree (relative paths → content hash) for idempotency checks.
 */
function snapshotTree(root) {
  const entries = {};
  function walk(dir, prefix) {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '.git') continue;
      const full = join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full, rel);
      } else {
        const content = readFileSync(full);
        entries[rel] = createHash('sha256').update(content).digest('hex');
      }
    }
  }
  walk(root, '');
  return entries;
}

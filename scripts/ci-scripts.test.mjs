/**
 * Tests for scripts/ci-prepare.mjs, scripts/audit-gate.mjs and scripts/combos.mjs (node:test).
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { planSteps } from './ci-prepare.mjs';
import { evaluate } from './audit-gate.mjs';
import { writeEnvFiles } from './combos.mjs';
import { touchesModules } from './ci-changes.mjs';

describe('ci-changes touchesModules', () => {
  const manifest = {
    modules: [
      {
        paths: ['apps/api/src/infra/database/postgres', 'apps/api/drizzle.config.ts'],
        markers: ['compose.yaml'],
      },
    ],
  };
  it('module paths (folder prefix or exact file) and marked files trigger the matrix', () => {
    assert.equal(touchesModules(['apps/api/src/infra/database/postgres/repo.ts'], manifest), true);
    assert.equal(touchesModules(['apps/api/drizzle.config.ts'], manifest), true);
    assert.equal(touchesModules(['compose.yaml'], manifest), true);
  });
  it('manifest, apply scripts and dependency files trigger the matrix', () => {
    for (const f of [
      'modules.json',
      'scripts/modules.mjs',
      'pnpm-lock.yaml',
      'apps/web/package.json',
    ]) {
      assert.equal(touchesModules([f], manifest), true, f);
    }
  });
  it('unrelated files do not, and prefixes must match whole segments', () => {
    assert.equal(touchesModules(['README.md', 'apps/web/src/app/page.tsx'], manifest), false);
    assert.equal(
      touchesModules(['apps/api/src/infra/database/postgres-notes.md'], manifest),
      false,
    );
  });
});

describe('ci-prepare planSteps', () => {
  it('default selection only does a frozen install', () => {
    assert.deepEqual(planSteps(undefined), [['pnpm', 'install', '--frozen-lockfile']]);
  });

  it('a combo applies, checks, re-resolves the lockfile', () => {
    const steps = planSteps('mongo');
    assert.deepEqual(steps[0], [
      'node',
      'scripts/modules.mjs',
      'apply',
      '--db=mongo',
      '--without=auth',
    ]);
    assert.deepEqual(steps[1], ['node', 'scripts/modules.mjs', 'check']);
    assert.deepEqual(steps[2], ['pnpm', 'install', '--no-frozen-lockfile']);
    assert.equal(steps.length, 3);
  });

  it('postgres combos regenerate the migration journal', () => {
    for (const label of ['postgres', 'postgres+auth']) {
      assert.deepEqual(planSteps(label).at(-1), ['pnpm', '--filter', 'api', 'db:generate']);
    }
  });

  it('rejects an unknown combo', () => {
    assert.throws(() => planSteps('mysql'), /unknown combo "mysql"/);
  });
});

describe('combos writeEnvFiles', () => {
  it('fills every *_SECRET (commented or not) with fresh random values', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ci-env-'));
    try {
      mkdirSync(join(dir, 'apps/api'), { recursive: true });
      mkdirSync(join(dir, 'apps/web'), { recursive: true });
      writeFileSync(
        join(dir, 'apps/api/.env.example'),
        'PORT=3001\nJWT_ACCESS_SECRET=\n# JWT_REFRESH_SECRET=\n',
      );
      writeFileSync(
        join(dir, 'apps/web/.env.example'),
        'API_URL=http://localhost:3001\nSESSION_SECRET=change-me\n',
      );
      writeEnvFiles(dir);
      const api = readFileSync(join(dir, 'apps/api/.env'), 'utf8');
      const web = readFileSync(join(dir, 'apps/web/.env.local'), 'utf8');
      assert.match(api, /^PORT=3001$/m);
      assert.match(api, /^JWT_ACCESS_SECRET=[\w-]{64}$/m);
      assert.match(api, /^JWT_REFRESH_SECRET=[\w-]{64}$/m);
      assert.match(web, /^SESSION_SECRET=[\w-]{64}$/m);
      assert.doesNotMatch(web, /change-me/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

const TODAY = '2026-11-28';
const adv = (over = {}) => ({
  id: 1,
  title: 'bad thing',
  module_name: 'pkg',
  severity: 'high',
  github_advisory_id: 'GHSA-aaaa-bbbb-cccc',
  url: 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc',
  findings: [{ dev: false }],
  ...over,
});
const report = (...advisories) => ({
  advisories: Object.fromEntries(advisories.map((a, i) => [i, a])),
});
const exc = (over = {}) => ({
  id: 'EXC-1',
  tool: 'pnpm-audit',
  advisories: ['GHSA-aaaa-bbbb-cccc'],
  reason: 'r',
  owner: 'o',
  expires: '2027-01-01',
  ...over,
});

describe('audit-gate evaluate', () => {
  it('passes on an empty report', () => {
    assert.deepEqual(evaluate(report(), [], TODAY).failures, []);
  });

  it('blocks an uncovered high or critical advisory in production deps', () => {
    for (const severity of ['high', 'critical']) {
      const { failures } = evaluate(report(adv({ severity })), [], TODAY);
      assert.equal(failures.length, 1);
      assert.match(failures[0], /^blocking: .*GHSA-aaaa-bbbb-cccc pkg/);
    }
  });

  it('only reports moderate advisories and dev-only advisories', () => {
    const { failures, notes } = evaluate(
      report(adv({ severity: 'moderate' }), adv({ findings: [{ dev: true }] })),
      [],
      TODAY,
    );
    assert.deepEqual(failures, []);
    assert.equal(notes.length, 2);
  });

  it('a live pnpm-audit exception covers the advisory (by GHSA or numeric id)', () => {
    assert.deepEqual(evaluate(report(adv()), [exc()], TODAY).failures, []);
    assert.deepEqual(evaluate(report(adv()), [exc({ advisories: ['1'] })], TODAY).failures, []);
  });

  it('an exception for another tool does not cover an audit advisory', () => {
    assert.equal(evaluate(report(adv()), [exc({ tool: 'trivy' })], TODAY).failures.length, 1);
  });

  it('an expired exception fails and stops covering its advisory', () => {
    const { failures } = evaluate(report(adv()), [exc({ expires: '2026-11-27' })], TODAY);
    assert.equal(failures.length, 2);
    assert.match(failures[0], /EXC-1 expired on 2026-11-27/);
    assert.match(failures[1], /^blocking:/);
  });

  it('an expired exception of any tool fails even with a clean report', () => {
    assert.match(
      evaluate(report(), [exc({ tool: 'trivy', expires: '2020-01-01' })], TODAY).failures[0],
      /expired/,
    );
  });

  it('an exception expiring today is still live', () => {
    assert.deepEqual(evaluate(report(adv()), [exc({ expires: TODAY })], TODAY).failures, []);
  });

  it('rejects a malformed expires date', () => {
    assert.match(
      evaluate(report(), [exc({ expires: '01/01/2027' })], TODAY).failures[0],
      /YYYY-MM-DD/,
    );
  });

  it('the committed exceptions file is valid and not expired today', () => {
    const { exceptions } = JSON.parse(
      readFileSync(join(import.meta.dirname, '../.security/exceptions.json'), 'utf8'),
    );
    const today = new Date().toISOString().slice(0, 10);
    assert.deepEqual(evaluate(report(), exceptions, today).failures, []);
  });
});

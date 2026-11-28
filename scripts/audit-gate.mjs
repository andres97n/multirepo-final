#!/usr/bin/env node

/**
 * scripts/audit-gate.mjs — the `audit-command` for the platform-config security workflow.
 *
 * 1. Fails if any entry in .security/exceptions.json is past its `expires` date
 *    (every tool's exceptions, not only audit ones).
 * 2. Runs `pnpm audit --prod --json` and fails on high/critical advisories in production
 *    dependencies that no live `pnpm-audit` exception covers. Dev-only and lower-severity
 *    advisories are reported but never fail.
 *
 *   node scripts/audit-gate.mjs                       run pnpm audit
 *   node scripts/audit-gate.mjs --report audit.json   use a saved report (tests, offline)
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BLOCKING = new Set(['high', 'critical']);

/**
 * Pure evaluation. `today` is an ISO date (YYYY-MM-DD).
 * Returns { failures: string[], notes: string[] }.
 */
export function evaluate(report, exceptions, today) {
  const failures = [];
  const notes = [];

  for (const e of exceptions) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(e.expires ?? '')) {
      failures.push(`exception ${e.id}: "expires" must be YYYY-MM-DD`);
    } else if (e.expires < today) {
      failures.push(
        `exception ${e.id} expired on ${e.expires}: renew it with a new reason or fix the finding`,
      );
    }
  }

  const live = exceptions.filter((e) => e.tool === 'pnpm-audit' && (e.expires ?? '') >= today);
  const covered = (adv) =>
    live.some((e) =>
      (e.advisories ?? []).some((id) => id === adv.github_advisory_id || id === String(adv.id)),
    );

  for (const adv of Object.values(report.advisories ?? {})) {
    const prod = (adv.findings ?? []).some((f) => !f.dev);
    const label = `${adv.severity} ${adv.github_advisory_id ?? adv.id} ${adv.module_name}: ${adv.title}`;
    if (!prod || !BLOCKING.has(adv.severity))
      notes.push(`report only: ${label}${prod ? '' : ' (dev)'}`);
    else if (covered(adv)) notes.push(`excepted: ${label}`);
    else failures.push(`blocking: ${label} (${adv.url ?? 'no url'})`);
  }
  return { failures, notes };
}

function loadReport(path) {
  if (path) return JSON.parse(readFileSync(path, 'utf8'));
  let out;
  try {
    out = execFileSync('pnpm', ['audit', '--prod', '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      shell: process.platform === 'win32',
    });
  } catch (err) {
    // pnpm audit exits non-zero whenever it finds anything; the JSON is still on stdout.
    out = err.stdout;
  }
  if (!out) throw new Error('pnpm audit produced no output');
  return JSON.parse(out);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const i = process.argv.indexOf('--report');
    const report = loadReport(i > -1 ? process.argv[i + 1] : undefined);
    const { exceptions } = JSON.parse(
      readFileSync(join(REPO_ROOT, '.security/exceptions.json'), 'utf8'),
    );
    const today = new Date().toISOString().slice(0, 10);
    const { failures, notes } = evaluate(report, exceptions, today);
    for (const n of notes) process.stdout.write(`  ${n}\n`);
    for (const f of failures) process.stderr.write(`✗ ${f}\n`);
    process.stdout.write(
      failures.length ? `audit gate FAILED (${failures.length})\n` : 'audit gate passed\n',
    );
    process.exit(failures.length ? 1 : 0);
  } catch (err) {
    process.stderr.write(`audit-gate error: ${err.message}\n`);
    process.exit(1);
  }
}

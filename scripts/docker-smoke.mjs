#!/usr/bin/env node
// M12 smoke test: builds and starts the compose stack from the current tree (migrations first when
// the tree is pruned to Postgres), runs the health, identity, leak and SIGTERM checks, then always
// tears the stack down. Usage (repo root): pnpm docker:smoke
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import console from 'node:console';
import process from 'node:process';

/* global fetch, AbortSignal -- Node >= 24 built-ins */

const PROJECT = 'smoke';
const API_PORT = 3916;
const WEB_PORT = 3917;
const APP_ORIGIN = `http://localhost:${WEB_PORT}`;
const API = `http://localhost:${API_PORT}`;
const WEB = `http://localhost:${WEB_PORT}`;
const COMPOSE = ['compose', '-p', PROJECT, '-f', 'compose.yaml'];
const DEV_DEPS = {
  api: ['vitest', 'typescript', '@nestjs/testing', 'drizzle-kit', 'supertest'],
  web: ['vitest', 'typescript', '@playwright/test'],
};

const results = [];
let childEnv = process.env;

function run(cmd, args) {
  const r = spawnSync(cmd, args, {
    cwd: process.cwd(),
    env: childEnv,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  return { code: r.status ?? -1, out: r.stdout ?? '', err: r.stderr ?? '' };
}

const compose = (args) => run('docker', [...COMPOSE, ...args]);

function record(name, ok, detail = '') {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` (${detail})` : ''}`);
}

async function http(url) {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    return { status: r.status, text: await r.text() };
  } catch (error) {
    return { status: 0, text: '', error: error.message };
  }
}

function renderEnv(file, overrides) {
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((line) => {
      const secret = /^(\w*_SECRET)=$/.exec(line);
      if (secret) return `${secret[1]}=${randomBytes(48).toString('base64url')}`;
      const key = Object.keys(overrides).find((k) => line.startsWith(`${k}=`));
      return key ? `${key}=${overrides[key]}` : line;
    })
    .join('\n');
}

function leakScript(svc) {
  const devDeps = DEV_DEPS[svc].map((n) => `[ -e /app/node_modules/${n} ] && echo devdep:${n}`);
  return [
    `find /app -name '.env*' 2>/dev/null | sed 's/^/env:/'`,
    `find /app -name .git -type d 2>/dev/null | sed 's/^/git:/'`,
    `find /app -path /app/node_modules -prune -o -name '*.ts' ! -name '*.d.ts' -print 2>/dev/null | sed 's/^/ts:/'`,
    `for d in /pnpm /root/.cache /home/node/.cache /home/node/.local/share/pnpm; do [ -e "$d" ] && echo cache:$d; done`,
    `for p in npm npx pnpm yarn corepack; do command -v $p > /dev/null && echo pm:$p; done`,
    ...devDeps,
  ].join('; ');
}

function postgresSteps() {
  const up = compose(['up', '-d', '--wait', 'postgres']);
  if (up.code !== 0) throw new Error(`postgres did not start: ${up.err.trim()}`);
  const build = compose(['build', 'api']);
  if (build.code !== 0) throw new Error(`api build failed: ${build.err.slice(-2000)}`);
  for (const attempt of [1, 2]) {
    const migrate = compose([
      'run',
      '--rm',
      '--no-deps',
      'api',
      'node',
      'dist/infra/database/postgres/migrate.js',
    ]);
    if (migrate.code !== 0)
      throw new Error(`migrate run ${attempt} exited ${migrate.code}: ${migrate.err.slice(-2000)}`);
  }
  record('MIGRATE', true, 'applied twice, exit 0');
}

async function runChecks(imageIds) {
  const live = await http(`${API}/api/v1/health/live`);
  record('API_LIVE', live.status === 200, `status ${live.status}`);

  const ready = await http(`${API}/api/v1/health/ready`);
  record('API_READY', ready.status === 200, `status ${ready.status}`);

  const webHealth = await http(`${WEB}/api/health`);
  record('WEB_HEALTH', webHealth.status === 200, `status ${webHealth.status}`);

  const deep = await http(`${WEB}/api/health?deep=1`);
  let apiStatus;
  try {
    apiStatus = JSON.parse(deep.text).checks?.api?.status;
  } catch {
    apiStatus = undefined;
  }
  record(
    'WEB_DEEP',
    deep.status === 200 && apiStatus === 'ok',
    `status ${deep.status}, api ${apiStatus ?? 'missing'}`,
  );

  const about = await http(`${WEB}/about`);
  const asset = /\/_next\/static\/[^"'\s<>]+?\.(?:js|css)/.exec(about.text)?.[0];
  const assetRes = asset ? await http(`${WEB}${asset}`) : { status: 0 };
  record(
    'WEB_STATIC',
    assetRes.status === 200,
    asset
      ? `${asset.split('/').pop()} status ${assetRes.status}`
      : `no asset in /about (status ${about.status})`,
  );

  for (const svc of ['api', 'web']) {
    const uid = compose(['exec', '-T', svc, 'id', '-u']).out.trim();
    const imageUser = run('docker', [
      'inspect',
      '-f',
      '{{.Config.User}}',
      imageIds[svc],
    ]).out.trim();
    record(
      `NON_ROOT_${svc.toUpperCase()}`,
      uid !== '' && uid !== '0' && imageUser !== '',
      `uid ${uid || 'none'}, image user ${imageUser || 'empty'}`,
    );
  }

  for (const svc of ['api', 'web']) {
    const findings = compose(['exec', '-T', svc, 'sh', '-c', leakScript(svc)])
      .out.split(/\r?\n/)
      .filter(Boolean);
    record(
      `NO_LEAKS_${svc.toUpperCase()}`,
      findings.length === 0,
      findings.slice(0, 5).join(', ') || 'clean',
    );
  }
}

function sigtermCheck() {
  const cid = compose(['ps', '-a', '-q', 'api']).out.trim();
  const t0 = Date.now();
  const stop = compose(['stop', '-t', '10', 'api']);
  const elapsed = (Date.now() - t0) / 1000;
  const logs = compose(['logs', '--no-color', 'api']).out;
  const exitCode = run('docker', ['inspect', '-f', '{{.State.ExitCode}}', cid]).out.trim();
  const shutdownLog = logs.includes('shutting down (SIGTERM)');
  const ok = stop.code === 0 && elapsed < 10 && shutdownLog && ['0', '143'].includes(exitCode);
  record(
    'SIGTERM',
    ok,
    `stop ${elapsed.toFixed(1)}s, exit ${exitCode}, shutdown log ${shutdownLog ? 'yes' : 'no'}`,
  );
}

function sizes(imageIds) {
  const out = {};
  for (const svc of ['api', 'web']) {
    const bytes = Number(run('docker', ['inspect', '-f', '{{.Size}}', imageIds[svc]]).out.trim());
    const fsKB = Number(
      run('docker', [
        'run',
        '--rm',
        '--entrypoint',
        'sh',
        imageIds[svc],
        '-c',
        'du -sx / | cut -f1',
      ]).out.trim(),
    );
    console.log(
      `${svc}: ${(bytes / 1048576).toFixed(1)} MB image, ${(fsKB / 1024).toFixed(1)} MB filesystem`,
    );
    out[svc] = { bytes, fsKB };
  }
  return out;
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-smoke-'));
  let tornDown = false;
  const teardown = () => {
    if (tornDown) return;
    tornDown = true;
    const down = compose(['down', '-v', '--remove-orphans']);
    console.log(`teardown: compose down exit ${down.code}`);
    fs.rmSync(tmp, { recursive: true, force: true });
  };
  for (const sig of ['SIGINT', 'SIGTERM']) {
    process.on(sig, () => {
      teardown();
      process.exit(130);
    });
  }

  try {
    const apiEnv = path.join(tmp, 'api.env');
    const webEnv = path.join(tmp, 'web.env');
    fs.writeFileSync(
      apiEnv,
      renderEnv(path.join('docker', 'api.env.example'), { CORS_ORIGIN: APP_ORIGIN }),
      { mode: 0o600 },
    );
    fs.writeFileSync(webEnv, renderEnv(path.join('docker', 'web.env.example'), { APP_ORIGIN }), {
      mode: 0o600,
    });
    childEnv = {
      ...process.env,
      API_PORT: String(API_PORT),
      WEB_PORT: String(WEB_PORT),
      APP_ORIGIN,
      API_ENV_FILE: apiEnv,
      WEB_ENV_FILE: webEnv,
    };

    const services = compose(['config', '--services']).out.split(/\s+/).filter(Boolean);
    const postgresEngine =
      services.includes('postgres') && /^DATABASE_URL=/m.test(fs.readFileSync(apiEnv, 'utf8'));
    if (postgresEngine) postgresSteps();

    const build = compose(['build']);
    if (build.code !== 0) throw new Error(`build failed: ${build.err.slice(-2000)}`);

    const t0 = Date.now();
    const up = compose(['up', '-d', '--wait', '--wait-timeout', '90']);
    const upSeconds = Math.round((Date.now() - t0) / 1000);
    if (up.code !== 0) throw new Error(`up failed: ${up.err.slice(-3000)}`);
    console.log(`stack up in ${upSeconds}s`);

    const imageIds = {};
    for (const svc of ['api', 'web']) {
      const cid = compose(['ps', '-q', svc]).out.trim();
      imageIds[svc] = run('docker', ['inspect', '-f', '{{.Image}}', cid]).out.trim();
    }

    await runChecks(imageIds);
    const imageSizes = sizes(imageIds);
    sigtermCheck();

    console.log(JSON.stringify({ images: imageSizes, upSeconds }));
    process.exitCode = results.every(Boolean) ? 0 : 1;
  } catch (error) {
    console.error(`FAIL ${error.message}`);
    process.exitCode = 1;
  } finally {
    teardown();
  }
}

await main();

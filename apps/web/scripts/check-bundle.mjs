/**
 * AC-M08.12: the client bundle must not contain server-only modules.
 * Greps `.next/static` for the env schema marker string; exits 1 if found.
 *
 * Run after a build: `pnpm --filter web check:bundle`
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const STATIC_DIR = join(import.meta.dirname, '..', '.next', 'static');
/** Marker that only exists in src/lib/env.schema.ts (client bundles must never include it). */
const MARKER = 'API_TIMEOUT_MS';

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else {
      yield full;
    }
  }
}

let files = 0;
try {
  if (!statSync(STATIC_DIR).isDirectory()) {
    throw new Error('missing');
  }
} catch {
  console.error(`check-bundle: ${STATIC_DIR} not found — run \`pnpm --filter web build\` first.`);
  process.exit(1);
}

for (const file of walk(STATIC_DIR)) {
  files += 1;
  if (readFileSync(file, 'utf8').includes(MARKER)) {
    console.error(
      `check-bundle: marker "${MARKER}" found in client bundle file ${file} (AC-M08.12).`,
    );
    process.exit(1);
  }
}

console.log(`check-bundle: OK — "${MARKER}" absent from ${files} client bundle files.`);

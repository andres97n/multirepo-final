import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const packageJson = JSON.parse(
  readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'),
);

const subpaths = Object.keys(packageJson.exports);

for (const subpath of subpaths) {
  const specifier = subpath === '.' ? '@repo/contracts' : `@repo/contracts${subpath.slice(1)}`;

  const cjs = require(specifier);
  if (Object.keys(cjs).length === 0) {
    throw new Error(`no exports exposed via require("${specifier}")`);
  }

  const esm = await import(specifier);
  if (Object.keys(esm).length === 0) {
    throw new Error(`no exports exposed via import("${specifier}")`);
  }
}

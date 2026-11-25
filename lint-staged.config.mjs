import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';

// modules:check runs when the manifest or any file with @module markers is staged.
// Exact paths, not globs: route groups like `(public)` are glob syntax.
const { modules } = JSON.parse(readFileSync(new URL('./modules.json', import.meta.url), 'utf8'));
const marked = new Set(['modules.json', ...modules.flatMap((m) => m.markers)]);
const isMarked = (file) => marked.has(relative(process.cwd(), file).replaceAll('\\', '/'));

export default {
  '*': 'prettier --write --ignore-unknown',
  '*.{ts,tsx,js,mjs,cjs}': 'eslint --fix --max-warnings 0 --no-warn-ignored',
  '**/*': (files) => (files.some(isMarked) ? 'node scripts/modules.mjs check' : []),
};

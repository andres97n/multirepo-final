// Usage: node scripts/live-check/flip-engine.mjs <file>...
// Flips @module:db-mongo -> @module:db-postgres per apps/api/AGENTS.md "Switching database engine":
// comments out db-mongo regions and uncomments db-postgres regions (inner lines only).
// Temporary: scripts/modules.mjs apply (M11) supersedes it.
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const FILES = process.argv.slice(2);
if (FILES.length === 0) throw new Error('pass the files to flip');

for (const file of FILES) {
  let region = null;
  const out = readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => {
      const start = /@module:(db-mongo|db-postgres)\s*$/.exec(line);
      if (start && !line.includes('@end-module')) {
        region = start[1];
        return line;
      }
      if (line.includes('@end-module:db-')) {
        region = null;
        return line;
      }
      if (region === 'db-mongo' && line.trim() && !line.trimStart().startsWith('//')) {
        return line.replace(/^(\s*)/, '$1// ');
      }
      if (region === 'db-postgres') return line.replace(/^(\s*)\/\/ ?/, '$1');
      return line;
    })
    .join('\n');
  writeFileSync(file, out);
}
process.stdout.write(`flipped ${FILES.length} files\n`);

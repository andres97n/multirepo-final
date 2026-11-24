import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * AC-M08.7: `src/lib/env.ts` cannot be imported from a client component.
 *
 * How this is proven without running `next build`:
 * 1. `env.ts`'s FIRST import is the bare `server-only` side-effect import, so
 *    Next's `react-server`-condition resolution is the only thing keeping it
 *    server-side — a client bundle resolves `server-only` to its throwing
 *    entry point and the build fails at import time.
 * 2. The real `server-only` package, resolved WITHOUT the `react-server`
 *    condition (i.e. how Node/clients resolve it — the package's `default`
 *    export condition), throws when imported. The vitest config aliases
 *    `server-only` to a stub for all other tests; this test bypasses the alias
 *    by resolving the package to its file path and importing that URL directly.
 */
describe('server-only guard on env.ts', () => {
  it("starts with the bare `import 'server-only';` statement", () => {
    const source = readFileSync(fileURLToPath(new URL('./env.ts', import.meta.url)), 'utf8');
    const firstImport = /^import[^\n]*$/m.exec(source)?.[0];

    expect(firstImport).toBe("import 'server-only';");
  });

  it('throws when the real server-only package is imported outside a react-server context', async () => {
    const require = createRequire(import.meta.url);
    const serverOnlyEntry = require.resolve('server-only');

    await expect(import(pathToFileURL(serverOnlyEntry).href)).rejects.toThrow(/Client Component/);
  });
});

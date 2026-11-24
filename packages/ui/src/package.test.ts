import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

interface PackageJson {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  exports?: Record<string, string>;
  sideEffects?: unknown;
}

const packageJsonPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  'package.json',
);
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageJson;

describe('package contract (AC-M07.9)', () => {
  it('has no dependency on Next.js', () => {
    for (const section of [
      packageJson.dependencies,
      packageJson.devDependencies,
      packageJson.peerDependencies,
    ]) {
      expect(Object.keys(section ?? {})).not.toContain('next');
    }
  });

  it('declares react and react-dom as peer dependencies', () => {
    expect(packageJson.peerDependencies).toHaveProperty('react');
    expect(packageJson.peerDependencies).toHaveProperty('react-dom');
  });

  it('exports tokens.css, components and the cn helper', () => {
    expect(packageJson.exports).toMatchObject({
      './tokens.css': './src/tokens.css',
      './components/*': './src/components/*.tsx',
      './lib/cn': './src/lib/cn.ts',
    });
  });

  it('only treats CSS as side-effectful', () => {
    expect(packageJson.sideEffects).toEqual(['**/*.css']);
  });
});

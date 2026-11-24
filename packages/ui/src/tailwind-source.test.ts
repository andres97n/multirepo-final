import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile } from '@tailwindcss/node';
import { describe, expect, it } from 'vitest';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(srcDir, '..');

function toCssUrl(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

/** The utility classes the package's components use (mirrors src/components/*.tsx). */
const PACKAGE_UTILITIES = [
  'bg-primary',
  'text-primary-foreground',
  'bg-secondary',
  'text-secondary-foreground',
  'bg-muted',
  'text-muted-foreground',
  'bg-destructive',
  'text-destructive-foreground',
  'bg-background',
  'text-foreground',
  'bg-card',
  'text-card-foreground',
  'border-border',
  'ring-ring',
] as const;

describe('tailwind source wiring (AC-M07.1)', () => {
  it('generates the package utilities from tokens.css with @source configured', async () => {
    const css = [
      '@import "tailwindcss";',
      `@import "${toCssUrl(path.join(srcDir, 'tokens.css'))}";`,
      `@source "${toCssUrl(srcDir)}";`,
    ].join('\n');

    const compiled = await compile(css, {
      base: packageRoot,
      onDependency: () => {},
    });

    // The @source directive pointing at the package source is registered.
    expect(compiled.sources.length).toBeGreaterThan(0);
    expect(compiled.sources.map((source) => source.pattern).join(' ')).toContain('src');

    const output = compiled.build([...PACKAGE_UTILITIES]);

    for (const utility of PACKAGE_UTILITIES) {
      expect(output, `.${utility} generated`).toContain(`.${utility}`);
    }
    expect(output).toContain('var(--primary)');
  });
});

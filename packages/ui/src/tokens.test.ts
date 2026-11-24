import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const tokensPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'tokens.css');
const css = readFileSync(tokensPath, 'utf8');

type Declarations = Record<string, string>;

function parseDeclarations(block: string): Declarations {
  const declarations: Declarations = {};
  for (const entry of block.split(';')) {
    const separator = entry.indexOf(':');
    if (separator === -1) continue;
    const name = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    if (name.startsWith('--')) {
      declarations[name] = value;
    }
  }
  return declarations;
}

function token(declarations: Declarations, name: string): string {
  const value = declarations[name];
  if (value === undefined) {
    throw new Error(`token ${name} is not defined`);
  }
  return value;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHexColor(value: string): Rgb {
  const hex = value.trim().replace(/^#/, '');
  const full = hex.length === 3 ? hex.replace(/./g, '$&$&') : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) {
    throw new Error(`expected a hex color, got ${value}`);
  }
  return {
    r: Number.parseInt(full.slice(0, 2), 16),
    g: Number.parseInt(full.slice(2, 4), 16),
    b: Number.parseInt(full.slice(4, 6), 16),
  };
}

function channelLuminance(channel: number): number {
  const c = channel / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * channelLuminance(color.r) +
    0.7152 * channelLuminance(color.g) +
    0.0722 * channelLuminance(color.b)
  );
}

function contrast(foreground: string, background: string): number {
  const light = relativeLuminance(parseHexColor(foreground));
  const dark = relativeLuminance(parseHexColor(background));
  const [brighter, dimmer] = light >= dark ? [light, dark] : [dark, light];
  return (brighter + 0.05) / (dimmer + 0.05);
}

const lightMatch = /:root\s*\{([^}]*)\}/.exec(css);
const mediaMatch =
  /@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme=['"]light['"]\]\)\s*\{([^}]*)\}/.exec(
    css,
  );
const attributeMatch = /:root\[data-theme=['"]dark['"]\]\s*\{([^}]*)\}/.exec(css);

if (lightMatch === null || mediaMatch === null || attributeMatch === null) {
  throw new Error(
    'tokens.css must define :root, prefers-color-scheme dark and [data-theme="dark"] blocks',
  );
}

const light = parseDeclarations(lightMatch[1] ?? '');
const darkMedia = parseDeclarations(mediaMatch[1] ?? '');
const darkAttribute = parseDeclarations(attributeMatch[1] ?? '');

const REQUIRED_TOKENS = [
  'background',
  'foreground',
  'primary',
  'muted',
  'destructive',
  'border',
  'ring',
] as const;

const CONTRAST_PAIRS: ReadonlyArray<readonly [string, string]> = [
  ['foreground', 'background'],
  ['primary-foreground', 'primary'],
  ['secondary-foreground', 'secondary'],
  ['muted-foreground', 'muted'],
  ['destructive-foreground', 'destructive'],
  ['card-foreground', 'card'],
  ['destructive', 'background'],
  ['destructive', 'card'],
  ['primary', 'background'],
  ['muted-foreground', 'background'],
  ['muted-foreground', 'card'],
];

describe('tokens.css', () => {
  it('defines every required token in both themes', () => {
    for (const name of REQUIRED_TOKENS) {
      expect(light, `light --${name}`).toHaveProperty(`--${name}`);
      expect(darkMedia, `dark --${name}`).toHaveProperty(`--${name}`);
    }
  });

  it('flips the background token in dark mode (AC-M07.4)', () => {
    expect(token(darkMedia, '--background')).not.toBe(token(light, '--background'));
    expect(token(darkAttribute, '--background')).not.toBe(token(light, '--background'));
  });

  it('keeps the prefers-color-scheme block and the data-theme block identical', () => {
    expect(darkMedia).toEqual(darkAttribute);
  });

  it('follows prefers-color-scheme but honours a light data-theme override', () => {
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(mediaMatch[0].replaceAll("'", '"')).toContain(':root:not([data-theme="light"])');
  });

  it('meets WCAG AA contrast (4.5:1) for every pair in both themes (AC-M07.7)', () => {
    for (const [foreground, background] of CONTRAST_PAIRS) {
      for (const theme of [light, darkMedia]) {
        const ratio = contrast(token(theme, `--${foreground}`), token(theme, `--${background}`));
        expect(ratio, `${foreground}/${background} contrast`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it('keeps the ring token visible against the background (>= 3:1)', () => {
    for (const theme of [light, darkMedia]) {
      const ratio = contrast(token(theme, '--ring'), token(theme, '--background'));
      expect(ratio, 'ring/background contrast').toBeGreaterThanOrEqual(3);
    }
  });
});

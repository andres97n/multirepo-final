# @repo/ui

Shared visual foundation: Tailwind v4 design tokens, light/dark themes and a
handful of shadcn-style primitives (Button, Input, Label, Card, FormField,
Toaster). Ships **source** — no build step; consumers compile it with their own
Tailwind.

## Boundary rule

Only **generic, unbranded primitives** live here. Business components, branded
styling, page layouts and app logic stay in `apps/web`. Never import Next.js (or
any app framework) here: React and React DOM are the only runtime peers.

## Layout

- `src/tokens.css` — semantic tokens + `@theme inline` utility mapping
- `src/lib/cn.ts` — `cn()` (clsx + tailwind-merge)
- `src/components/*.tsx` — primitives (owned code, adapted from shadcn)
- `src/test/setup.ts` — jest-dom + vitest-axe matcher registration
- `components.json` — shadcn CLI config targeting this package

## Consuming from apps/web

```css
@import 'tailwindcss';
@import '@repo/ui/tokens.css';
@source '<relative path from this file to>/packages/ui/src';
```

Import components as `@repo/ui/components/<name>`, the helper as `@repo/ui/lib/cn`.
The `@source` line is required: Tailwind v4 does not scan dependency sources.
Its path is **relative to the consuming CSS file**: compute it as the relative
path from that file's own directory to `packages/ui/src` (for example a file at
`apps/web/src/app/globals.css` needs `../../../packages/ui/src`).

## Theming

CSS-only: `prefers-color-scheme` picks the theme; `data-theme="light|dark"` on
`<html>` pins it. No JS, no flash (apps may add an inline persistence script).

## Adding a primitive

1. Copy the shadcn component, adapt every class to the tokens (no raw colors).
2. Use `cn()` and cva for variants; `forwardRef` and native props pass through.
3. Client-only hooks go behind `'use client'` where actually needed.
4. Add a test: render, ref/props forwarding, keyboard, zero-violation axe check.
5. Primitives are **owned code**. The shadcn CLI is optional and pinned:
   `pnpm dlx shadcn@4.23.0 add <name>` run from `packages/ui` (4.23.0 was the
   current release on 2026-11-23). `components.json` aliases resolve through the
   `paths` entry in `tsconfig.json`.
6. `components.json` sets `iconLibrary: "lucide"`, so the CLI may add `lucide-react`
   when a component needs icons. Accept it, pin the version exactly, and import
   icons only inside that component.

## Commands

```bash
pnpm --filter @repo/ui test          # vitest run (jsdom)
pnpm --filter @repo/ui test:coverage # + v8 coverage
pnpm --filter @repo/ui lint
pnpm --filter @repo/ui typecheck
```

## Gates

- 0 lint warnings, strict typecheck, no `any`, coverage ≥ 80% lines.
- Every primitive keeps a zero-violation axe test; token pairs pass WCAG AA
  contrast (4.5:1) in both themes (enforced by `src/tokens.test.ts`).

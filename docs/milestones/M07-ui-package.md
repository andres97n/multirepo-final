# M07 — packages/ui

| Field      | Value                                    |
| ---------- | ---------------------------------------- |
| Status     | Done                                     |
| Depends on | [M01](./M01-repo-skeleton.md)            |
| PRD refs   | §4.1 packages/ui, NFR-QUAL-1, NFR-QUAL-2 |
| Axes       | 1 (Modular), 3 (Monorepo), 4 (Quality)   |

## Goal

A minimal, accessible visual foundation shared through `@repo/ui`: Tailwind v4 design tokens, light and dark themes, and a handful of shadcn primitives. Business components stay in `apps/web`.

## Scope

Tokens, theme switching mechanism, primitives: Button, Input, Label, Card, FormField, Toaster (sonner).

## Out of scope

- Page layouts, business components, icons beyond lucide re-export, Storybook (documented as optional).

## Tasks

- [x] `packages/ui` package: `exports` for `./tokens.css`, `./components/*`, `./lib/cn`.
- [x] `tokens.css` (Tailwind v4 `@theme`): color (semantic: background, foreground, primary, muted, destructive, border, ring), radius, spacing scale, font families.
- [x] Dark mode via `prefers-color-scheme` with a `data-theme` override. No flash on load (inline script in M08, or CSS-only approach).
- [x] shadcn primitives copied in and adapted: Button (variants via cva), Input, Label, Card, FormField (label + control + description + error with `aria-describedby`/`aria-invalid`), Toaster.
- [x] `cn()` helper (clsx + tailwind-merge).
- [x] Vitest + Testing Library + jsdom tests; `vitest-axe` (or axe-core) accessibility check per component.
- [x] `components.json` so `shadcn add` targets this package.
- [x] `packages/ui/AGENTS.md`: what belongs here vs in `apps/web`.

## Deliverables

`packages/ui/src/{tokens.css,lib/cn.ts,components/*.tsx}`, tests, `components.json`, `AGENTS.md`.

## Acceptance criteria

### Functional

- **AC-M07.1** `apps/web` (or a test harness) imports `@repo/ui/tokens.css` and a component, and Tailwind classes from the package are generated (`@source` configured).
- **AC-M07.2** Button supports `variant` (default, secondary, destructive, ghost, link) and `size`, and forwards ref and native props (`type`, `disabled`).
- **AC-M07.3** FormField renders a `<label for>` linked to the control, and when it has an error sets `aria-invalid="true"` and `aria-describedby` pointing to the error id.
- **AC-M07.4** Theme: with `data-theme="dark"`, the computed background token differs from light; with no attribute it follows `prefers-color-scheme`.

### Accessibility

- **AC-M07.5** Every component passes an axe check with zero violations in its default state.
- **AC-M07.6** Interactive components are keyboard operable and show a visible focus ring (`ring` token).
- **AC-M07.7** Token color pairs (foreground/background, primary-foreground/primary) meet WCAG AA contrast (4.5:1). A test computes this from the tokens.

### Quality

- **AC-M07.8** Coverage ≥ 80% lines. Lint 0, strict typecheck.
- **AC-M07.9** The package has no dependency on Next.js. React and react-dom are peer dependencies.

### Docs

- **AC-M07.10** `packages/ui/AGENTS.md` states the boundary rule: only generic, unbranded primitives go here.
- **AC-M07.11** ADR-0007 "Shared UI package with Tailwind v4 tokens + shadcn" is written.

## Verification

```bash
pnpm --filter @repo/ui test -- --coverage
pnpm --filter @repo/ui lint typecheck
```

## ADRs produced

- ADR-0007 `packages/ui`: tokens + primitives; business components stay in apps.

## Risks & mitigations

| Risk                                         | Mitigation                                                                      |
| -------------------------------------------- | ------------------------------------------------------------------------------- |
| Tailwind v4 does not scan package sources    | Configure `@source` in the web CSS entry; covered by AC-M07.1.                  |
| shadcn CLI expectations for monorepos change | Pin the CLI version in docs; components are owned code, so the CLI is optional. |

## Definition of Done

All ACs pass, ADR-0007 is merged, the commit is made and the status is set to Done.

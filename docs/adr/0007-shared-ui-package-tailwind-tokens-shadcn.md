# ADR-0007 — Shared UI package with Tailwind v4 tokens + shadcn

- Status: Accepted
- Date: 2026-11-23
- Supersedes: — / Superseded-by: —

## Context

The boilerplate needs a minimal, accessible visual foundation shared by every
app built from it: design tokens, light/dark themes and a handful of primitives
(Button, Input, Label, Card, FormField, Toaster). Business components belong to
each project, so the shared layer must stay generic and unbranded and must not
drag a framework dependency (Next.js) into packages.

## Decision

1. **Source-only package.** `@repo/ui` ships TypeScript/CSS source with no build
   step; consumers import `@repo/ui/tokens.css`, `@repo/ui/components/<name>` and
   `@repo/ui/lib/cn` and compile them with their own bundler and Tailwind.
2. **Tokens in CSS.** Semantic variables (`--background`, `--primary`, …) live on
   `:root` and are mapped to Tailwind utilities through `@theme inline`
   (`bg-background`, `ring-ring`, …), plus a spacing base, radius scale and font
   families.
3. **Dark mode in CSS.** `prefers-color-scheme` selects the theme;
   `data-theme="light|dark"` on `<html>` pins it. No script, no flash (apps may
   add an inline persistence script).
4. **Consumers add `@source`.** The web CSS entry points `@source` at
   `packages/ui/src`, since Tailwind v4 does not scan dependency sources.
5. **Primitives are owned shadcn code.** Components are copied from shadcn
   (`new-york`), adapted to the tokens and owned from then on. The shadcn CLI is
   optional and pinned (`pnpm dlx shadcn@4.23.0 add …`); `components.json` targets
   this package.
6. **Business components stay in apps.** Only generic, unbranded primitives live
   in `@repo/ui`; page layouts, branded components and app logic live in
   `apps/web`.
7. **React as peer dependency.** `react`/`react-dom` (^19) are peers; there is no
   Next.js or `next-themes` dependency anywhere in the package.
8. **Accessibility as a gate.** Every primitive has a vitest-axe test with zero
   violations, and `src/tokens.test.ts` enforces WCAG AA contrast (4.5:1) for all
   foreground/background token pairs in both themes.

## Alternatives

- **Build the package with tsdown** (like `@repo/contracts`): rejected; Tailwind
  needs to scan the component sources, so shipping compiled output would defeat
  `@source` scanning and complicate token maintenance.
- **next-themes for dark mode**: rejected; it is a Next.js-flavoured dependency
  and the CSS-only mechanism covers the requirement without JS.
- **CSS-in-JS**: rejected; it adds runtime cost and a dependency where plain
  Tailwind v4 CSS variables suffice.

## Consequences

- Consumers must configure `@source` in their CSS entry; forgetting it means the
  package's utilities are not generated (covered by an AC-M07.1 test).
- The package is compiled by the consumer's bundler, so its TypeScript/JSX must
  stay within what consumers' toolchains accept.
- Because components are owned code, upstream shadcn changes are adopted
  manually; the pinned CLI is only a convenience for copying sources in.

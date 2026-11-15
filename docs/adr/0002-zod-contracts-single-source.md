# ADR-0002 — Zod contracts as single source

- Status: Accepted
- Date: 2026-11-15
- Supersedes: — / Superseded-by: —

## Context

HTTP request/response shapes must be shared between the Nest API and the Next
web app without drift. The previous approach relied on class-validator DTOs
duplicated across apps plus a drift-check step, which was easy to let fall out
of sync.

## Decision

Define all HTTP shapes once, in `packages/contracts` (`@repo/contracts`), as
Zod 4 schemas with inferred TypeScript types. The API validates incoming data
and the web app types responses against the same schemas/types. `zod` is
declared as a `peerDependency` so apps own the single zod version, avoiding the
dual-package hazard. The package is built to ESM and CJS with `.d.ts` via
tsdown. The `auth` subpath is kept isolated and prunable (not re-exported from
the package root) so M11 can drop it without affecting other consumers.

## Alternatives

- class-validator + drift check: duplicated shapes, weaker type inference.
- Sharing a single Nest package to the web app: couples the web app to Nest.

## Consequences

- One definition per shape; drift between apps is structurally impossible.
- Apps must declare `zod` themselves (peer dependency).
- Adding a schema requires updating the tsdown entry and the `exports` map.

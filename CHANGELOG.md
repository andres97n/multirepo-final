# Changelog

All notable changes to this project are documented here. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-11-15

### Added

- M01 repo skeleton: pnpm 11 + Turborepo workspace, shared TypeScript and ESLint presets, Prettier, Husky + lint-staged, ADR template and ADR-0001 (c20941d).
- M02 `@repo/contracts`: Zod 4 schemas for envelopes, error codes, pagination, filters and health, plus a prunable `auth` subpath; ESM + CJS builds; ADR-0002 (a55168b).

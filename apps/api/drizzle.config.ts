import { defineConfig } from 'drizzle-kit';

// Migrations are an explicit step (`pnpm --filter api db:generate|db:migrate`);
// the app never runs them on boot (ADR-0005).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/infra/database/postgres/schema/index.ts',
  out: './migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5432/app' },
});

/**
 * PGlite test schema: mirrors `users.table.ts` / `sessions.table.ts` exactly
 * (hand-written DDL, same pattern as `WIDGETS_DDL` in infra
 * `postgres/testing/pglite.ts`). Used by the auth repository contract spec
 * and the Postgres auth e2e.
 */
export const AUTH_PG_TESTING_DDL = `
  CREATE TABLE users (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    email text NOT NULL,
    password_hash text NOT NULL,
    roles text[] NOT NULL,
    status text NOT NULL,
    failed_login_count integer NOT NULL DEFAULT 0,
    locked_until timestamptz,
    CONSTRAINT users_email_unique UNIQUE (email)
  );
  CREATE TABLE sessions (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    user_id uuid NOT NULL,
    family_id uuid NOT NULL,
    token_hash text NOT NULL,
    expires_at timestamptz NOT NULL,
    family_expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    replaced_by uuid,
    previous_token_hash text,
    retired_token_hashes text[] NOT NULL DEFAULT '{}',
    rotated_at timestamptz,
    ip text,
    user_agent text,
    CONSTRAINT sessions_token_hash_unique UNIQUE (token_hash)
  );
  CREATE INDEX sessions_user_id_index ON sessions (user_id);
  CREATE INDEX sessions_family_id_index ON sessions (family_id);
  CREATE INDEX sessions_retired_token_hashes_index ON sessions USING gin (retired_token_hashes);
`;

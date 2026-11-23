import { startPglite } from '../../../infra/database/postgres/testing/pglite';
import { runAuthRepositoryContract } from '../testing/auth-repositories.contract';
import { PostgresSessionsRepository } from './postgres-sessions.repository';
import { PostgresUsersRepository } from './postgres-users.repository';

// ponytail: hand-written DDL mirrors users.table.ts / sessions.table.ts, the
// same pattern as WIDGETS_DDL in infra/testing/pglite.ts.
const AUTH_DDL = `
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

runAuthRepositoryContract('postgres', async () => {
  const { db, stop } = await startPglite(AUTH_DDL);
  return {
    users: new PostgresUsersRepository(db),
    sessions: new PostgresSessionsRepository(db),
    cleanup: stop,
  };
});

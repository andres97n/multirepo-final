import { AUTH_CLOCK } from '../src/modules/auth/auth.clock';
import { PasswordService } from '../src/modules/auth/password.service';
import { SessionsRepository } from '../src/modules/auth/sessions.repository';
import { UsersRepository } from '../src/modules/auth/users.repository';
import { AUTH_PG_TESTING_DDL } from '../src/modules/auth/postgres/testing/auth-ddl';
import { PostgresSessionsRepository } from '../src/modules/auth/postgres/postgres-sessions.repository';
import { PostgresUsersRepository } from '../src/modules/auth/postgres/postgres-users.repository';
import { startPglite } from '../src/infra/database/postgres/testing/pglite';
import { buildApp } from './helpers';
import { createTestClock, runAuthE2eSuite, type AuthSuiteFactory } from './auth-suite';

/**
 * AC-M06.16 on Postgres without touching the `@module:db-*` markers:
 * the same full app is built through `buildApp`, but the auth repository
 * tokens are overridden with the Postgres adapters bound to an in-process
 * PGlite instance (the `POSTGRES_DB` equivalent), so every HTTP assertion in
 * the shared suite runs identically on the Drizzle engine. The repository
 * port is the only seam — no driver import here, and no tracked file is
 * modified.
 */
const buildPostgres: AuthSuiteFactory = async () => {
  const { db, stop } = await startPglite(AUTH_PG_TESTING_DDL);
  const clock = createTestClock();
  try {
    const app = await buildApp([], (builder) =>
      builder
        .overrideProvider(AUTH_CLOCK)
        .useValue(clock)
        .overrideProvider(UsersRepository)
        .useValue(new PostgresUsersRepository(db))
        .overrideProvider(SessionsRepository)
        .useValue(new PostgresSessionsRepository(db)),
    );
    return {
      app,
      users: app.get(UsersRepository),
      sessions: app.get(SessionsRepository),
      passwords: app.get(PasswordService),
      clock,
      close: async () => {
        await app.close();
        await stop();
      },
    };
  } catch (error) {
    await stop();
    throw error;
  }
};

runAuthE2eSuite('postgres (PGlite over the same AppModule)', buildPostgres);

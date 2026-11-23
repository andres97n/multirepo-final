import type { Provider } from '@nestjs/common';
import { PostgresSessionsRepository } from './postgres-sessions.repository';
import { PostgresUsersRepository } from './postgres-users.repository';
import { SessionsRepository } from '../sessions.repository';
import { UsersRepository } from '../users.repository';

/**
 * Provider list for `@module:auth` on Postgres. Register it in a module that
 * also provides `POSTGRES_DB` (`PostgresDatabaseModule.forRoot()` is
 * `@Global`); the repositories reuse the shared Drizzle instance.
 */
export const postgresAuthProviders: Provider[] = [
  { provide: UsersRepository, useClass: PostgresUsersRepository },
  { provide: SessionsRepository, useClass: PostgresSessionsRepository },
];

import { AUTH_CLOCK } from '../src/modules/auth/auth.clock';
import { PasswordService } from '../src/modules/auth/password.service';
import { SessionsRepository } from '../src/modules/auth/sessions.repository';
import { UsersRepository } from '../src/modules/auth/users.repository';
import { buildApp } from './helpers';
import { createTestClock, runAuthE2eSuite, type AuthSuiteFactory } from './auth-suite';

/**
 * The canonical auth e2e run: the FULL AppModule exactly as production
 * boots it, with the wired `db-mongo` engine (mongodb-memory-server from
 * `test/global-setup.ts`), only the injectable clock overridden so no test
 * needs fake timers around the supertest sockets.
 */
const buildMongo: AuthSuiteFactory = async () => {
  const clock = createTestClock();
  const app = await buildApp([], (builder) => builder.overrideProvider(AUTH_CLOCK).useValue(clock));
  return {
    app,
    users: app.get(UsersRepository),
    sessions: app.get(SessionsRepository),
    passwords: app.get(PasswordService),
    clock,
    close: async () => {
      await app.close();
    },
  };
};

runAuthE2eSuite('mongo', buildMongo);

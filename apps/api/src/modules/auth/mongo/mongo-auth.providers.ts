import type { Provider } from '@nestjs/common';
import { MongoSessionsRepository } from './mongo-sessions.repository';
import { MongoUsersRepository } from './mongo-users.repository';
import { SessionsRepository } from '../sessions.repository';
import { UsersRepository } from '../users.repository';

/**
 * Provider list for `@module:auth` on Mongo. Register it in a module that also
 * provides `MONGO_CONNECTION` (`MongoDatabaseModule.forRoot()` is `@Global`);
 * the repositories create their models on that connection lazily.
 */
export const mongoAuthProviders: Provider[] = [
  { provide: UsersRepository, useClass: MongoUsersRepository },
  { provide: SessionsRepository, useClass: MongoSessionsRepository },
];

// @module:db-mongo
import { MongoModule } from './db/mongo';
// @end-module:db-mongo
// @module:db-postgres
// import { PostgresModule } from './db/postgres';
// @end-module:db-postgres
// @module:auth
import { AuthModule } from './auth';
// @end-module:auth

export const modules = [
  // @module:db-mongo
  MongoModule,
  // @end-module:db-mongo
  // @module:db-postgres
  // PostgresModule,
  // @end-module:db-postgres
  // @module:auth
  AuthModule,
  // @end-module:auth
];

import mongoose, { type Connection } from 'mongoose';
import { startMemoryMongo } from '../../../infra/database/mongo/testing/mongo-memory';
import { runAuthRepositoryContract } from '../testing/auth-repositories.contract';
import { MongoSessionsRepository } from './mongo-sessions.repository';
import { MongoUsersRepository } from './mongo-users.repository';
import { getSessionModel } from './session.schema';
import { getUserModel } from './user.schema';

// Same pattern as the M04 suite: real in-memory MongoDB, indexes synced before
// the cases run so the unique constraints are enforced (AC-M04.3 parity).
runAuthRepositoryContract('mongo', async () => {
  const { uri, stop } = await startMemoryMongo();
  const connection: Connection = await mongoose.createConnection(uri).asPromise();
  await Promise.all([
    getUserModel(connection).syncIndexes(),
    getSessionModel(connection).syncIndexes(),
  ]);
  const users = new MongoUsersRepository(connection);
  const sessions = new MongoSessionsRepository(connection);
  return {
    users,
    sessions,
    cleanup: async () => {
      await connection.close();
      await stop();
    },
  };
});

import { startMemoryMongo } from '../src/infra/database/mongo/testing/mongo-memory';

/**
 * Boots one mongodb-memory-server for the whole e2e run and points `MONGO_URI`
 * at it, so every `buildApp()` connects to a real database (AC-M04.5).
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const { uri, stop } = await startMemoryMongo();
  process.env.MONGO_URI = uri;
  return async () => {
    await stop();
  };
}

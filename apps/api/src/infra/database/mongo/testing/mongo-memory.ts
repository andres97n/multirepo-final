import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Pinned MongoDB binary version for tests. Keep the minor in sync with the
 * `mongo:8.0` image in the root `compose.dev.yaml`.
 */
export const MONGO_BINARY_VERSION = '8.0.4';

export interface MemoryMongo {
  uri: string;
  stop: () => Promise<void>;
}

/** Boots an ephemeral MongoDB (downloads the pinned binary on first run). */
export async function startMemoryMongo(): Promise<MemoryMongo> {
  const server = await MongoMemoryServer.create({ binary: { version: MONGO_BINARY_VERSION } });
  return {
    uri: server.getUri(),
    stop: async () => {
      await server.stop();
    },
  };
}

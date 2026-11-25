import { MongoMemoryServer } from 'mongodb-memory-server';

// ponytail: Mongo only; a Postgres project needs its own bootstrap here.
const port = Number(process.env.E2E_MONGO_PORT);
const server = await MongoMemoryServer.create({
  binary: { version: '8.0.4' }, // same as src/infra/database/mongo/testing/mongo-memory.ts
  instance: { port },
});
if (Number(new URL(server.getUri()).port) !== port) {
  await server.stop();
  throw new Error(`E2E mongo port ${port} is busy`);
}
await import('../dist/main.js');

import { NestFactory } from '@nestjs/core';
import type { Connection } from 'mongoose';
import { AppModule } from '../../../app.module';
import { MONGO_CONNECTION } from './mongo.constants';

/**
 * Explicit index sync (`pnpm --filter api db:sync-indexes`). The adapter runs
 * with `autoIndex: false` in production, so unique/search indexes are built by
 * this CLI (or the deploy pipeline) instead of implicitly on connect.
 */
async function run(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    const connection = app.get<Connection>(MONGO_CONNECTION);
    // Fail fast with a clear error instead of relying on command buffering.
    await connection.asPromise();
    let count = 0;
    for (const model of Object.values(connection.models)) {
      await model.syncIndexes();
      count += 1;
    }
    process.stdout.write(`sync-indexes: synced indexes for ${String(count)} model(s)\n`);
  } finally {
    await app.close();
  }
}

run()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`sync-indexes failed: ${message}\n`);
    process.exit(1);
  });

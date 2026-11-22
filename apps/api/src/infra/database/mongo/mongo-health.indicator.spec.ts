import mongoose, { type Connection } from 'mongoose';
import { describe, expect, it } from 'vitest';
import { MongoHealthIndicator } from './mongo-health.indicator';
import { startMemoryMongo } from './testing/mongo-memory';

function indicator(connection: Connection, timeoutMs = 2000): MongoHealthIndicator {
  return new MongoHealthIndicator(connection, { MONGO_TIMEOUT_MS: timeoutMs });
}

describe('MongoHealthIndicator.check', () => {
  it('reports ok against a live memory-server', async () => {
    const { uri, stop } = await startMemoryMongo();
    const connection = await mongoose.createConnection(uri).asPromise();
    try {
      const result = await indicator(connection).check();
      expect(result.status).toBe('ok');
    } finally {
      await connection.close();
      await stop();
    }
  });

  it('reports down with a generic message when the connection is closed', async () => {
    const { uri, stop } = await startMemoryMongo();
    const connection = await mongoose.createConnection(uri).asPromise();
    await connection.close();
    try {
      const result = await indicator(connection).check();
      expect(result.status).toBe('down');
      expect(result.message).toBe('unavailable');
    } finally {
      await stop();
    }
  });

  it('reports down without a ping when the connection never opened', async () => {
    // Port 9 (discard) with a short timeout — readyState never reaches 1.
    const connection = mongoose.createConnection('mongodb://127.0.0.1:9/never', {
      serverSelectionTimeoutMS: 200,
      connectTimeoutMS: 200,
    });
    try {
      const result = await indicator(connection, 200).check();
      expect(result.status).toBe('down');
      expect(result.message).toBe('unavailable');
    } finally {
      await connection.close();
    }
  });

  it('times out on a hanging ping without leaking URI or driver text', async () => {
    const hanging = {
      readyState: 1,
      db: { admin: () => ({ ping: () => new Promise<never>(() => {}) }) },
    } as unknown as Connection;

    const started = Date.now();
    const result = await indicator(hanging, 150).check();
    const elapsed = Date.now() - started;

    expect(result.status).toBe('down');
    expect(result.message).toBe('unavailable');
    expect(result.message).not.toMatch(/mongodb|driver|ECONNREFUSED|timeout/i);
    expect(elapsed).toBeGreaterThanOrEqual(140);
    expect(elapsed).toBeLessThan(2000);
  });
});

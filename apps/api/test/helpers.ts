import type { Type } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import type { ErrorEnvelope } from '@repo/contracts';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';

/** Casts supertest's untyped response body to the contract error envelope. */
export function asErrorEnvelope(body: unknown): ErrorEnvelope {
  return body as ErrorEnvelope;
}

/** Builds a fully-wired app (same wiring as main.ts) for supertest. */
export async function buildApp(controllers: Type<unknown>[] = []): Promise<NestExpressApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
    controllers,
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  configureApp(app);
  await app.init();
  return app;
}

/**
 * Runs `fn` with the given env overrides (`undefined` unsets) and always
 * restores the previous values, so a failing assertion cannot leak env into
 * later e2e files.
 */
export async function withEnv<T>(
  overrides: Record<string, string | undefined>,
  fn: () => Promise<T>,
): Promise<T> {
  const saved = new Map<string, string | undefined>();
  const apply = (key: string, value: string | undefined): void => {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  };
  for (const [key, value] of Object.entries(overrides)) {
    saved.set(key, process.env[key]);
    apply(key, value);
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of saved) {
      apply(key, value);
    }
  }
}

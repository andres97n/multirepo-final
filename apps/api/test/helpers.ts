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

import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { validateEnv } from './config/validate-env';

/** One pino-shaped JSON line (level 60 = fatal), then exit non-zero. */
function fatal(msg: string, error: unknown): never {
  const err =
    error instanceof Error
      ? { type: error.name, message: error.message, stack: error.stack }
      : { message: String(error) };
  console.error(JSON.stringify({ level: 60, time: Date.now(), msg, err }));
  process.exit(1);
}

process.on('uncaughtException', (error) => fatal('uncaughtException', error));
process.on('unhandledRejection', (reason) => fatal('unhandledRejection', reason));

async function bootstrap(): Promise<void> {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }

  let port: number;
  try {
    port = validateEnv().PORT;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);
  await app.listen(port);
}

void bootstrap();

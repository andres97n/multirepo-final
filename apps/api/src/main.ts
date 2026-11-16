import 'reflect-metadata';
import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './configure-app';
import { validateEnv } from './config/validate-env';

process.on('uncaughtException', (error) => {
  console.error('FATAL: uncaughtException', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('FATAL: unhandledRejection', reason);
  process.exit(1);
});

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

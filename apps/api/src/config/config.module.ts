import { Global, Module } from '@nestjs/common';
import { APP_CONFIG } from './app-config';
import type { AppConfig } from './app-config';
import { validateEnv } from './validate-env';

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): AppConfig => validateEnv(),
    },
  ],
  exports: [APP_CONFIG],
})
export class ConfigModule {}

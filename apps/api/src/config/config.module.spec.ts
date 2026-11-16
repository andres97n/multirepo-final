import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { APP_CONFIG, type AppConfig } from './app-config';
import { ConfigModule } from './config.module';

describe('ConfigModule', () => {
  it('provides APP_CONFIG parsed from the environment', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ConfigModule] }).compile();
    const config = moduleRef.get<AppConfig>(APP_CONFIG);
    expect(config.NODE_ENV).toBe('test');
    expect(config.PORT).toBe(3001);
    expect(config.CORS_ORIGIN).toEqual(['http://localhost:3000']);
    await moduleRef.close();
  });
});

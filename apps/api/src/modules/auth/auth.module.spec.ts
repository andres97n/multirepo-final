import { Test } from '@nestjs/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigModule } from '../../config/config.module';
import { LoggerModule } from '../../infra/logger/logger.module';
import { AuthModule, SessionCleanupService } from './auth.module';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { PasswordService } from './password.service';
import { RevocationCache } from './revocation.cache';
import { RolesGuard } from './roles.guard';
import { SessionsRepository } from './sessions.repository';
import { TokenService } from './token.service';
import { UsersRepository } from './users.repository';
import { FakeSessionsRepository, FakeUsersRepository } from './testing/fake-repositories';

describe('AuthModule DI graph (repositories overridden per engine)', () => {
  async function compile() {
    const users = new FakeUsersRepository();
    const sessions = new FakeSessionsRepository();
    const moduleRef = await Test.createTestingModule({
      // ConfigModule + LoggerModule stand in for the AppModule wiring the
      // module relies on (APP_CONFIG and nestjs-pino Logger are @Global).
      imports: [ConfigModule, LoggerModule, AuthModule],
    })
      .overrideProvider(UsersRepository)
      .useValue(users)
      .overrideProvider(SessionsRepository)
      .useValue(sessions)
      .compile();
    return { moduleRef, users, sessions };
  }

  it('provides services and guards once the active engine is wired', async () => {
    const { moduleRef } = await compile();
    expect(moduleRef.get(AuthService)).toBeInstanceOf(AuthService);
    expect(moduleRef.get(PasswordService)).toBeInstanceOf(PasswordService);
    expect(moduleRef.get(TokenService)).toBeInstanceOf(TokenService);
    expect(moduleRef.get(RevocationCache)).toBeInstanceOf(RevocationCache);
    // The two APP_GUARDs use these instances (authentication, then roles).
    expect(moduleRef.get(JwtAuthGuard)).toBeInstanceOf(JwtAuthGuard);
    expect(moduleRef.get(RolesGuard)).toBeInstanceOf(RolesGuard);
    await moduleRef.close();
  });

  it('starts the session cleanup timer and clears it on module destroy', async () => {
    vi.useFakeTimers();
    const { moduleRef, sessions } = await compile();
    const deleteExpired = vi.spyOn(sessions, 'deleteExpired').mockResolvedValue(2);
    await moduleRef.init();
    // SESSION_CLEANUP_INTERVAL_MINUTES defaults to 60 in the test env.
    vi.advanceTimersByTime(60 * 60_000);
    expect(deleteExpired).toHaveBeenCalledTimes(1);
    await moduleRef.close();
    vi.advanceTimersByTime(120 * 60_000);
    expect(deleteExpired).toHaveBeenCalledTimes(1); // interval was cleared
    vi.useRealTimers();
  });

  it('cleanup reports the sweep result and survives database errors', async () => {
    const { moduleRef, sessions } = await compile();
    const service = moduleRef.get(SessionCleanupService);
    const deleteExpired = vi.spyOn(sessions, 'deleteExpired');
    deleteExpired.mockResolvedValue(3);
    await expect(service.cleanup()).resolves.toBe(3);
    deleteExpired.mockRejectedValue(new Error('db down'));
    await expect(service.cleanup()).resolves.toBe(0);
    await moduleRef.close();
  });

  afterEach(() => {
    vi.useRealTimers();
  });
});

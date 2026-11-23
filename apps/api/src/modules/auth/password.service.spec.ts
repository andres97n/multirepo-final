import { describe, expect, it, vi } from 'vitest';
import { PasswordService } from './password.service';
import { authTestConfig } from './testing/spec-config';

function service(overrides = {}): PasswordService {
  return new PasswordService(authTestConfig(overrides));
}

describe('PasswordService (argon2id, AC-M06.12)', () => {
  it('hashes with the configured argon2id parameters', async () => {
    const digest = await service().hash('correct horse battery staple');
    expect(digest.startsWith('$argon2id$')).toBe(true);
    // The test config is m=64,t=1,p=1 (see spec-config): the digest embeds them.
    expect(digest).toContain('m=64,t=1,p=1');
  });

  it('verifies the right password and rejects wrong or malformed digests', async () => {
    const passwords = service();
    const digest = await passwords.hash('secret-password-123');
    expect(await passwords.verify(digest, 'secret-password-123')).toBe(true);
    expect(await passwords.verify(digest, 'wrong-password')).toBe(false);
    expect(await passwords.verify('not-a-phc-digest', 'secret-password-123')).toBe(false);
  });

  it('needsRehash is false for the current parameters and true when they differ', async () => {
    const current = service();
    const digest = await current.hash('secret-password-123');
    expect(current.needsRehash(digest)).toBe(false);
    const stronger = service({ ARGON2_MEMORY_COST: 128, ARGON2_TIME_COST: 2 });
    expect(stronger.needsRehash(digest)).toBe(true);
    // Unparseable digests are treated as stale, never thrown.
    expect(current.needsRehash('garbage')).toBe(true);
  });

  it('onModuleInit precomputes the dummy hash so the first miss costs no extra hash', async () => {
    const passwords = new PasswordService(authTestConfig());
    const hashSpy = vi.spyOn(passwords, 'hash');
    await passwords.onModuleInit();
    await passwords.verifyDummy('x');
    await passwords.verifyDummy('y');
    expect(hashSpy).toHaveBeenCalledTimes(1);
  });

  it('verifyDummy burns real argon2 work against one lazily precomputed hash', async () => {
    const passwords = service();
    const hashSpy = vi.spyOn(passwords, 'hash');
    // Wrong password: false, but the same argon2 verify cost as a real user.
    expect(await passwords.verifyDummy('definitely-wrong')).toBe(false);
    // The dummy digest itself verifies, proving it was precomputed with these params.
    expect(await passwords.verifyDummy('m06-dummy-timing-equalizer')).toBe(true);
    await passwords.verifyDummy('again');
    // One dummy hash for the whole process; every call reuses it.
    expect(hashSpy).toHaveBeenCalledTimes(1);
    hashSpy.mockRestore();
  });
});

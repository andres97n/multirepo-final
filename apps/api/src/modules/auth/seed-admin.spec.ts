import { PassThrough } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import { ConflictError } from '../../infra/database/core/errors';
import { PasswordService } from './password.service';
import { ask, resolveCredentials, runSeed, seedAdmin, type SeedDeps } from './seed-admin';
import { FakeUsersRepository } from './testing/fake-repositories';
import { authTestConfig } from './testing/spec-config';
import { UsersRepository } from './users.repository';

const EMAIL = 'Admin@Example.COM';
const PASSWORD = 'change-me-please-1234';

function build() {
  const users = new FakeUsersRepository();
  const passwords = new PasswordService(authTestConfig());
  return { users, passwords };
}

describe('seedAdmin (AC-M06.8)', () => {
  it('creates the admin once, with lowercased email and argon2id hash', async () => {
    const { users, passwords } = build();
    await expect(seedAdmin(users, passwords, EMAIL, PASSWORD)).resolves.toBe('created');
    const admin = await users.findByEmail('admin@example.com');
    expect(admin).not.toBeNull();
    expect(admin?.roles).toEqual(['admin']);
    expect(admin?.status).toBe('active');
    expect(String(admin?.passwordHash).startsWith('$argon2id$')).toBe(true);
    expect(await passwords.verify(String(admin?.passwordHash), PASSWORD)).toBe(true);
  });

  it('a second run creates nothing and never changes the password', async () => {
    const { users, passwords } = build();
    await seedAdmin(users, passwords, EMAIL, PASSWORD);
    const created = await users.findByEmail('admin@example.com');
    expect(created).not.toBeNull();
    // Tamper with the stored hash to prove the second run cannot overwrite it.
    if (created !== null) {
      users.put({ ...created, passwordHash: '$argon2id$v=19$m=64,t=1,p=1$tampered' });
    }
    await expect(seedAdmin(users, passwords, EMAIL, 'totally-different-123')).resolves.toBe(
      'exists',
    );
    const after = await users.findByEmail('admin@example.com');
    expect(after?.passwordHash).toBe('$argon2id$v=19$m=64,t=1,p=1$tampered');
    expect(users.rows.size).toBe(1);
  });

  it('treats a concurrent duplicate (ConflictError on email) as "exists"', async () => {
    const { users, passwords } = build();
    const create = vi.spyOn(users, 'create').mockRejectedValue(new ConflictError('email'));
    await expect(seedAdmin(users, passwords, EMAIL, PASSWORD)).resolves.toBe('exists');
    create.mockRestore();
  });

  it('rejects invalid emails and policy-violating passwords without writing', async () => {
    const { users, passwords } = build();
    await expect(seedAdmin(users, passwords, 'not-an-email', PASSWORD)).resolves.toBe(
      'invalid-email',
    );
    await expect(seedAdmin(users, passwords, EMAIL, 'short')).resolves.toBe('invalid-password');
    expect(users.rows.size).toBe(0);
  });

  it('propagates non-email conflicts', async () => {
    const { users, passwords } = build();
    vi.spyOn(users, 'create').mockRejectedValue(new ConflictError('username'));
    await expect(seedAdmin(users, passwords, EMAIL, PASSWORD)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});

describe('resolveCredentials', () => {
  it('reads SEED_ADMIN_EMAIL/SEED_ADMIN_PASSWORD from env', async () => {
    const prompt = vi.fn();
    await expect(
      resolveCredentials({ SEED_ADMIN_EMAIL: 'a@b.co', SEED_ADMIN_PASSWORD: 'x' }, false, prompt),
    ).resolves.toEqual({ email: 'a@b.co', password: 'x' });
    expect(prompt).not.toHaveBeenCalled();
  });

  it('prompts on a TTY when a variable is missing', async () => {
    const prompt = vi.fn().mockResolvedValue('typed-in@example.com');
    await expect(resolveCredentials({}, true, prompt)).resolves.toEqual({
      email: 'typed-in@example.com',
      password: 'typed-in@example.com',
    });
    expect(prompt).toHaveBeenCalledTimes(2);
  });

  it('fails (null) without env and without a TTY', async () => {
    const prompt = vi.fn();
    await expect(
      resolveCredentials({ SEED_ADMIN_EMAIL: 'a@b.co' }, false, prompt),
    ).resolves.toBeNull();
    await expect(
      resolveCredentials({ SEED_ADMIN_EMAIL: 'a@b.co' }, undefined, prompt),
    ).resolves.toBeNull();
  });
});

describe('runSeed (CLI orchestration with a faked application context)', () => {
  function harness(users: FakeUsersRepository, passwords: PasswordService) {
    const close = vi.fn((): Promise<void> => Promise.resolve());
    const deps: SeedDeps = {
      env: { SEED_ADMIN_EMAIL: EMAIL, SEED_ADMIN_PASSWORD: PASSWORD },
      isTty: false,
      prompt: () => Promise.resolve(''),
      createContext: () =>
        Promise.resolve({
          get: (token: unknown): unknown => (token === UsersRepository ? users : passwords),
          close,
        }),
      write: vi.fn(),
      writeError: vi.fn(),
      exit: vi.fn(),
    };
    return { deps, close, write: deps.write, writeError: deps.writeError, exit: deps.exit };
  }

  it('creates the admin, reports it and closes the context', async () => {
    const { users, passwords } = build();
    const h = harness(users, passwords);
    await runSeed(h.deps);
    expect(h.write).toHaveBeenCalledWith('seed:admin: created admin Admin@Example.COM\n');
    expect(h.exit).not.toHaveBeenCalled();
    expect(h.close).toHaveBeenCalledTimes(1);
    expect(users.rows.size).toBe(1);
  });

  it('a repeated run reports "already exists" without touching the user', async () => {
    const { users, passwords } = build();
    await seedAdmin(users, passwords, EMAIL, PASSWORD);
    const before = (await users.findByEmail('admin@example.com'))?.passwordHash;
    const h = harness(users, passwords);
    await runSeed(h.deps);
    expect(h.write).toHaveBeenCalledWith(
      expect.stringContaining('already exists; nothing changed'),
    );
    expect((await users.findByEmail('admin@example.com'))?.passwordHash).toBe(before);
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it('exits 1 with guidance when credentials are absent and stdin is not a TTY', async () => {
    const { users, passwords } = build();
    const createContext = vi.fn();
    const h = harness(users, passwords);
    await runSeed({
      ...h.deps,
      env: {},
      createContext,
    });
    expect(createContext).not.toHaveBeenCalled();
    expect(h.writeError).toHaveBeenCalledWith(expect.stringContaining('SEED_ADMIN_EMAIL'));
    expect(h.exit).toHaveBeenCalledWith(1);
  });

  it('exits 1 when the env password violates the policy', async () => {
    const { users, passwords } = build();
    const h = harness(users, passwords);
    await runSeed({
      ...h.deps,
      env: { SEED_ADMIN_EMAIL: EMAIL, SEED_ADMIN_PASSWORD: 'short' },
    });
    expect(h.writeError).toHaveBeenCalledWith(expect.stringContaining('password policy'));
    expect(h.exit).toHaveBeenCalledWith(1);
    expect(h.close).toHaveBeenCalledTimes(1);
  });

  it('prompts and seeds when stdin is a TTY', async () => {
    const { users, passwords } = build();
    const h = harness(users, passwords);
    let calls = 0;
    const prompt = vi.fn((): Promise<string> => {
      calls += 1;
      return Promise.resolve(calls === 1 ? EMAIL : PASSWORD);
    });
    await runSeed({ ...h.deps, env: {}, isTty: true, prompt });
    expect(prompt).toHaveBeenCalledTimes(2);
    expect(users.rows.size).toBe(1);
  });
});

describe('ask', () => {
  it('resolves with the line typed into the input stream', async () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const pending = ask('Admin email: ', input, output);
    input.write('admin@example.com\n');
    await expect(pending).resolves.toBe('admin@example.com');
  });
});

import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { User } from './auth.types';
import { ROLES_KEY } from './roles.decorator';
import { UsersController } from './users.controller';
import type { UsersRepository } from './users.repository';

function user(id: string, overrides: Partial<User> = {}): User {
  return {
    id,
    email: `${id}@example.com`,
    passwordHash: '$argon2id$v=19$m=19456,t=2,p=1$secret',
    roles: ['user'],
    status: 'active',
    failedLoginCount: 0,
    lockedUntil: null,
    ...overrides,
  };
}

function controllerWith(list: ReturnType<typeof vi.fn>): UsersController {
  return new UsersController({ list } as unknown as UsersRepository);
}

describe('UsersController (AC-M06.7 mapping)', () => {
  it('maps repository rows to contract items without private fields', async () => {
    const list = vi.fn().mockResolvedValue({
      items: [user('u1'), user('u2', { roles: ['admin'], status: 'disabled' })],
      page: 2,
      limit: 10,
      total: 2,
    });
    const controller = controllerWith(list);
    const result = await controller.list({
      page: 2,
      limit: 10,
      filter: [{ field: 'status', op: 'eq', value: 'disabled' }],
    });
    expect(list).toHaveBeenCalledWith({ page: 2, limit: 10, sort: undefined }, [
      { field: 'status', op: 'eq', value: 'disabled' },
    ]);
    expect(result).toEqual({
      items: [
        { id: 'u1', email: 'u1@example.com', roles: ['user'], status: 'active' },
        { id: 'u2', email: 'u2@example.com', roles: ['admin'], status: 'disabled' },
      ],
      page: 2,
      limit: 10,
      total: 2,
    });
    for (const item of result.items) {
      expect(Object.keys(item).sort()).toEqual(['email', 'id', 'roles', 'status']);
    }
  });

  it('passes sort through when present', async () => {
    const list = vi.fn().mockResolvedValue({ items: [], page: 1, limit: 20, total: 0 });
    const controller = controllerWith(list);
    await controller.list({ page: 1, limit: 20, sort: 'email:asc', filter: [] });
    expect(list).toHaveBeenCalledWith({ page: 1, limit: 20, sort: 'email:asc' }, []);
  });

  it('the whole controller requires the admin role', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UsersController)).toEqual(['admin']);
  });
});

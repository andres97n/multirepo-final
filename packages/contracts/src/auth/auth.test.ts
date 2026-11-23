import { describe, expect, it } from 'vitest';
import {
  LoginInput,
  MeResponse,
  PASSWORD_POLICY,
  Password,
  RefreshInput,
  Role,
  TokenPair,
  UserListItem,
  UsersPage,
  UsersQuery,
  UserStatus,
} from './index.js';

describe('Role', () => {
  it('accepts user and admin, rejecting anything else', () => {
    expect(Role.parse('user')).toBe('user');
    expect(Role.parse('admin')).toBe('admin');
    expect(() => Role.parse('super')).toThrow();
  });
});

describe('LoginInput', () => {
  it('normalizes email by trimming and lowercasing', () => {
    expect(LoginInput.parse({ email: '  A@B.COM ', password: 'secret' })).toEqual({
      email: 'a@b.com',
      password: 'secret',
    });
  });

  it('rejects an empty email', () => {
    expect(() => LoginInput.parse({ email: '', password: 'secret' })).toThrow();
    expect(() => LoginInput.parse({ email: '   ', password: 'secret' })).toThrow();
  });

  it('rejects an empty password', () => {
    expect(() => LoginInput.parse({ email: 'a@b.com', password: '' })).toThrow();
  });
});

describe('Password', () => {
  it('enforces the password policy min and max length', () => {
    expect(() => Password.parse('a'.repeat(PASSWORD_POLICY.minLength - 1))).toThrow();
    expect(Password.parse('a'.repeat(PASSWORD_POLICY.minLength))).toBe(
      'a'.repeat(PASSWORD_POLICY.minLength),
    );
    expect(Password.parse('a'.repeat(PASSWORD_POLICY.maxLength))).toBe(
      'a'.repeat(PASSWORD_POLICY.maxLength),
    );
    expect(() => Password.parse('a'.repeat(PASSWORD_POLICY.maxLength + 1))).toThrow();
  });
});

describe('PASSWORD_POLICY', () => {
  it('defines the min and max length', () => {
    expect(PASSWORD_POLICY).toEqual({ minLength: 12, maxLength: 128 });
  });
});

describe('MeResponse', () => {
  it('parses a user with roles', () => {
    expect(MeResponse.parse({ id: '1', email: 'a@b.com', roles: ['user'] })).toEqual({
      id: '1',
      email: 'a@b.com',
      roles: ['user'],
    });
    expect(() => MeResponse.parse({ id: '1', email: 'a@b.com', roles: ['super'] })).toThrow();
  });
});

describe('UserStatus', () => {
  it('accepts active and disabled, rejecting anything else', () => {
    expect(UserStatus.parse('active')).toBe('active');
    expect(UserStatus.parse('disabled')).toBe('disabled');
    expect(() => UserStatus.parse('banned')).toThrow();
  });
});

describe('TokenPair', () => {
  it('parses tokens with an integer seconds expiry', () => {
    expect(
      TokenPair.parse({ accessToken: 'a.b.c', refreshToken: 'r'.repeat(43), expiresIn: 900 }),
    ).toEqual({ accessToken: 'a.b.c', refreshToken: 'r'.repeat(43), expiresIn: 900 });
  });

  it('rejects a non-integer expiresIn', () => {
    expect(() =>
      TokenPair.parse({ accessToken: 'a', refreshToken: 'b', expiresIn: 1.5 }),
    ).toThrow();
  });
});

describe('RefreshInput', () => {
  it('requires a non-empty refresh token', () => {
    expect(RefreshInput.parse({ refreshToken: 'x' })).toEqual({ refreshToken: 'x' });
    expect(() => RefreshInput.parse({ refreshToken: '' })).toThrow();
  });
});

describe('UserListItem', () => {
  const item = {
    id: 'u1',
    email: 'a@b.com',
    roles: ['admin'],
    status: 'active',
    createdAt: '2026-11-22T10:00:00.000Z',
  };

  it('parses a public user row', () => {
    expect(UserListItem.parse(item)).toEqual(item);
  });

  it('rejects a bad status or role', () => {
    expect(() => UserListItem.parse({ ...item, status: 'locked' })).toThrow();
    expect(() => UserListItem.parse({ ...item, roles: ['super'] })).toThrow();
    expect(() => UserListItem.parse({ ...item, createdAt: 'yesterday' })).toThrow();
  });

  it('never exposes passwordHash or lockout fields', () => {
    const parsed = UserListItem.parse({
      ...item,
      passwordHash: '$argon2id$…',
      failedLoginCount: 4,
      lockedUntil: '2026-11-22T10:01:00.000Z',
    });
    expect(parsed).not.toHaveProperty('passwordHash');
    expect(parsed).not.toHaveProperty('failedLoginCount');
    expect(parsed).not.toHaveProperty('lockedUntil');
  });
});

describe('UsersQuery', () => {
  it('applies the PageQuery defaults and an empty filter default', () => {
    expect(UsersQuery.parse({})).toEqual({ page: 1, limit: 20, filter: [] });
  });

  it('coerces page/limit from query-string values', () => {
    const parsed = UsersQuery.parse({ page: '3', limit: '10', sort: 'email:asc' });
    expect(parsed.page).toBe(3);
    expect(parsed.limit).toBe(10);
    expect(parsed.sort).toBe('email:asc');
  });

  it('accepts whitelisted field/op combinations', () => {
    const parsed = UsersQuery.parse({
      filter: [
        { field: 'email', op: 'contains', value: 'a@' },
        { field: 'role', op: 'eq', value: 'admin' },
        { field: 'status', op: 'eq', value: 'active' },
      ],
    });
    expect(parsed.filter).toHaveLength(3);
  });

  it('rejects non-whitelisted fields, operators and out-of-range pages', () => {
    expect(() =>
      UsersQuery.parse({ filter: [{ field: 'passwordHash', op: 'eq', value: 'x' }] }),
    ).toThrow();
    expect(() =>
      UsersQuery.parse({ filter: [{ field: 'email', op: 'gt', value: 'a' }] }),
    ).toThrow();
    expect(() => UsersQuery.parse({ page: '0' })).toThrow();
  });
});

describe('UsersPage', () => {
  it('parses a paginated list of user rows', () => {
    const page = UsersPage.parse({
      items: [
        {
          id: 'u1',
          email: 'a@b.com',
          roles: ['user'],
          status: 'active',
          createdAt: '2026-11-22T10:00:00.000Z',
        },
      ],
      page: 1,
      limit: 20,
      total: 1,
    });
    expect(page.items[0]?.email).toBe('a@b.com');
    expect(page.total).toBe(1);
  });

  it('rejects items missing the required public fields', () => {
    expect(() =>
      UsersPage.parse({
        items: [{ email: 'a@b.com', roles: ['user'], status: 'active' }],
        page: 1,
        limit: 20,
        total: 1,
      }),
    ).toThrow();
    expect(() =>
      UsersPage.parse({
        items: [{ id: 'u1', roles: ['user'], status: 'active' }],
        page: 1,
        limit: 20,
        total: 1,
      }),
    ).toThrow();
  });

  it('accepts items without createdAt (neither engine entity carries it)', () => {
    expect(() =>
      UsersPage.parse({
        items: [{ id: 'u1', email: 'a@b.com', roles: ['user'], status: 'active' }],
        page: 1,
        limit: 20,
        total: 1,
      }),
    ).not.toThrow();
  });
});

import { describe, expect, it } from 'vitest';
import { LoginInput, MeResponse, PASSWORD_POLICY, Password, Role } from './index.js';

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

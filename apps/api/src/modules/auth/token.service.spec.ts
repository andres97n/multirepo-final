import { JwtService } from '@nestjs/jwt';
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AccessTokenClaims } from './token.service';
import { TokenService } from './token.service';
import { authTestConfig } from './testing/spec-config';

const SECRET = 'unit-test-jwt-secret-0123456789-abcdefghij';
const CLAIMS: AccessTokenClaims = { sub: 'user-1', roles: ['user'], sid: 'session-1' };

function service(): TokenService {
  return new TokenService(authTestConfig(), new JwtService());
}

function encodeSegment(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function hmacSign(header: unknown, payload: unknown, secret: string): string {
  const head = encodeSegment(header);
  const body = encodeSegment(payload);
  const signature = createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${signature}`;
}

/** Hand-crafted HS256 JWT: full control over header, claims and key. */
function craft(
  payloadOverrides: Record<string, unknown>,
  options: { secret?: string; alg?: string } = {},
): string {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const payload = {
    sub: CLAIMS.sub,
    roles: CLAIMS.roles,
    sid: CLAIMS.sid,
    iss: 'multirepo-api',
    aud: 'multirepo-web',
    iat: nowSeconds,
    exp: nowSeconds + 900,
    ...payloadOverrides,
  };
  return hmacSign({ alg: options.alg ?? 'HS256', typ: 'JWT' }, payload, options.secret ?? SECRET);
}

describe('TokenService (AC-M06.13)', () => {
  it('signs and verifies its own access tokens with the exact claims', () => {
    const tokens = service();
    expect(tokens.verifyAccess(tokens.signAccess(CLAIMS))).toEqual(CLAIMS);
  });

  it('rejects alg:none tokens', () => {
    const head = encodeSegment({ alg: 'none', typ: 'JWT' });
    const body = encodeSegment({ ...CLAIMS, iss: 'multirepo-api', aud: 'multirepo-web' });
    expect(service().verifyAccess(`${head}.${body}.`)).toBeNull();
  });

  it('rejects tokens signed with another secret', () => {
    expect(
      service().verifyAccess(craft({}, { secret: 'other-secret-0123456789abcdefghij-x' })),
    ).toBeNull();
  });

  it('rejects wrong issuer and wrong audience', () => {
    expect(service().verifyAccess(craft({ iss: 'evil-issuer' }))).toBeNull();
    expect(service().verifyAccess(craft({ aud: 'evil-audience' }))).toBeNull();
    // Sanity: the same base payload verifies, so the two checks caused the rejection.
    expect(service().verifyAccess(craft({}))).toEqual(CLAIMS);
  });

  it('rejects expired tokens', () => {
    const past = Math.floor(Date.now() / 1000) - 10;
    expect(service().verifyAccess(craft({ iat: past, exp: past + 1 }))).toBeNull();
  });

  it('rejects tampered payloads', () => {
    const valid = service().signAccess(CLAIMS);
    const parts = valid.split('.');
    const head = parts[0] ?? '';
    const signature = parts[2] ?? '';
    const evil = encodeSegment({ ...CLAIMS, roles: ['admin'], sub: 'user-2' });
    expect(service().verifyAccess(`${head}.${evil}.${signature}`)).toBeNull();
  });

  it('rejects structurally broken payloads', () => {
    expect(service().verifyAccess(craft({ sub: 42 }))).toBeNull();
    expect(service().verifyAccess(craft({ roles: 'admin' }))).toBeNull();
    expect(service().verifyAccess(craft({ sid: undefined }))).toBeNull();
    expect(service().verifyAccess(craft({ roles: ['root'] }))).toBeNull();
    expect(service().verifyAccess('not.a.jwt')).toBeNull();
  });

  it('falls back to a per-process secret when JWT_ACCESS_SECRET is unset', () => {
    const tokens = new TokenService(
      authTestConfig({ JWT_ACCESS_SECRET: undefined }),
      new JwtService(),
    );
    expect(tokens.verifyAccess(tokens.signAccess(CLAIMS))).toEqual(CLAIMS);
  });

  it('mints 256-bit base64url refresh tokens with sha256-hex hashes', () => {
    const tokens = service();
    const first = tokens.generateRefreshToken();
    const second = tokens.generateRefreshToken();
    expect(first.token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes base64url, unpadded
    expect(first.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(first.token).not.toBe(first.hash);
    expect(second.token).not.toBe(first.token);
    expect(tokens.hashRefreshToken(first.token)).toBe(first.hash);
  });

  it('exposes the configured access TTL', () => {
    expect(service().accessTtlSeconds).toBe(900);
  });
});

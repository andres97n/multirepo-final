import 'server-only';

import { EncryptJWT, jwtDecrypt } from 'jose';
import { cookies } from 'next/headers';
import { z } from 'zod';

import { env } from './env';

/**
 * Encrypted session cookie (jose `EncryptJWT`, `dir` + `A256GCM`, key =
 * SHA-256 of `SESSION_SECRET`). The cookie is the ONLY place tokens exist in
 * the browser: httpOnly, `SameSite=Lax`, `Path=/`, `Secure` + the `__Host-`
 * prefix in production (AC-M09.7). Decryption accepts `SESSION_SECRET_PREVIOUS`
 * so keys can be rotated without logging everyone out (AC-M09.8).
 */

/** Claims sealed inside the cookie. `accessExp` is the access JWT expiry (unix seconds). */
export const sessionPayloadSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  accessExp: z.number().int(),
});

export type SessionPayload = z.infer<typeof sessionPayloadSchema>;

const encoder = new TextEncoder();

/** `__Host-session` in production (Secure + Path=/ required by the prefix), `session` elsewhere. */
export function sessionCookieName(isProd = process.env.NODE_ENV === 'production'): string {
  return isProd ? '__Host-session' : 'session';
}

async function deriveKey(secret: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(secret)));
}

/** Encrypts `payload` with the CURRENT secret into a compact JWE. */
export async function encryptSession(payload: SessionPayload): Promise<string> {
  return new EncryptJWT({ ...payload })
    .setProtectedHeader({ alg: 'dir', enc: 'A256GCM' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + env.SESSION_MAX_AGE_SECONDS)
    .encrypt(await deriveKey(env.SESSION_SECRET));
}

/**
 * Decrypts `token` with the current secret, then with `SESSION_SECRET_PREVIOUS`.
 * Any failure (tampered, truncated, wrong key, invalid payload) is treated as
 * no session: `null`, never a thrown error (AC-M09.8).
 */
export async function decryptSession(token: string): Promise<SessionPayload | null> {
  const secrets = [env.SESSION_SECRET, env.SESSION_SECRET_PREVIOUS];
  for (const secret of secrets) {
    if (secret === undefined) {
      continue;
    }
    try {
      const { payload } = await jwtDecrypt(token, await deriveKey(secret), {
        keyManagementAlgorithms: ['dir'],
      });
      const parsed = sessionPayloadSchema.safeParse(payload);
      if (parsed.success) {
        return parsed.data;
      }
    } catch {
      // Try the next secret; anything unparseable counts as "no session".
    }
  }
  return null;
}

function serializeSessionCookie(
  name: string,
  value: string,
  maxAge: number,
  isProd: boolean,
): string {
  const parts = [`${name}=${value}`, `Max-Age=${String(maxAge)}`, 'Path=/'];
  if (isProd) {
    parts.push('Secure');
  }
  parts.push('HttpOnly', 'SameSite=Lax');
  return parts.join('; ');
}

/** `Set-Cookie` value for a fresh session. Attributes: HttpOnly, SameSite=Lax, Path=/ (+ Secure in production). */
export function buildSessionCookie(
  value: string,
  isProd = process.env.NODE_ENV === 'production',
): string {
  return serializeSessionCookie(
    sessionCookieName(isProd),
    value,
    env.SESSION_MAX_AGE_SECONDS,
    isProd,
  );
}

/**
 * `Set-Cookie` value that clears the session: empty value, `Max-Age=0` and the
 * SAME attributes as the session cookie. `cookies().delete()` is not used
 * because `__Host-` cookies are rejected by that API's attribute handling.
 */
export function buildClearSessionCookie(isProd = process.env.NODE_ENV === 'production'): string {
  return serializeSessionCookie(sessionCookieName(isProd), '', 0, isProd);
}

/** Extracts the raw session cookie value from a `Cookie` header string. */
export function sessionValueFromCookieHeader(header: string | null): string | null {
  if (header === null) {
    return null;
  }
  const prefix = `${sessionCookieName()}=`;
  for (const part of header.split(';')) {
    const entry = part.trim();
    if (entry.startsWith(prefix)) {
      const value = entry.slice(prefix.length);
      return value.length > 0 ? value : null;
    }
  }
  return null;
}

/** Returns a `Cookie` header with the session cookie replaced (or appended). */
export function setSessionCookieHeader(header: string | null, value: string): string {
  const name = sessionCookieName();
  const prefix = `${name}=`;
  const kept = (header ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((entry) => entry.length > 0 && !entry.startsWith(prefix));
  kept.push(`${name}=${value}`);
  return kept.join('; ');
}

/** Reads and decrypts the session from a request's `Cookie` header (route handlers, proxy). */
export async function readSessionFromRequest(request: Request): Promise<SessionPayload | null> {
  const value = sessionValueFromCookieHeader(request.headers.get('cookie'));
  return value === null ? null : decryptSession(value);
}

/** Reads and decrypts the session via `next/headers` (server components). */
export async function readSession(): Promise<SessionPayload | null> {
  const store = await cookies();
  const value = store.get(sessionCookieName())?.value;
  return value === undefined || value.length === 0 ? null : decryptSession(value);
}

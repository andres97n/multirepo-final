/**
 * `next` parameter sanitizer for post-login redirects. Client-safe and pure
 * (no `next/*`, no `server-only`, no env): the login page sanitises on the
 * server and the client form assigns the already-sanitised value.
 *
 * A value is only returned when it is a same-origin relative path: starts with
 * exactly one `/`, contains no backslash or control characters, and resolves
 * to the base origin. Everything else (`//evil.com`, `https://evil.com`,
 * `/\evil.com`, `javascript:alert(1)`, …) falls back to `/dashboard`
 * (AC-M09.10).
 */

/** Where a rejected (or missing) `next` value sends the user. */
export const FALLBACK_PATH = '/dashboard';

/** Base used to test that a candidate resolves to the same origin. */
const SAME_ORIGIN_BASE = 'http://next.invalid';

const UNSAFE_PATH_CHARS =
  // eslint-disable-next-line no-control-regex -- rejecting control characters is the point
  /[\\\u0000-\u001F\u007F]/;

/** Returns `next` when it is a safe same-origin relative path, else `FALLBACK_PATH`. */
export function sanitizeNextPath(next: string | null | undefined): string {
  if (typeof next !== 'string' || next.length === 0) {
    return FALLBACK_PATH;
  }
  if (UNSAFE_PATH_CHARS.test(next)) {
    return FALLBACK_PATH;
  }
  try {
    // `//evil.com` and `/\evil.com` resolve cross-origin here (the URL parser
    // treats `\` as `/` in special schemes), absolute URLs and `javascript:`
    // resolve to another (or the "null") origin.
    const resolved = new URL(next, SAME_ORIGIN_BASE);
    if (resolved.origin !== SAME_ORIGIN_BASE) {
      return FALLBACK_PATH;
    }
  } catch {
    return FALLBACK_PATH;
  }
  // Exactly one leading slash: `//<own-host>` would resolve same-origin but is
  // not a relative path.
  if (!next.startsWith('/') || next.startsWith('//')) {
    return FALLBACK_PATH;
  }
  return next;
}

/**
 * CSP and security-header builders. Pure: no `next/*`, no `server-only`, so
 * both `next.config.ts` (static routes) and `src/proxy.ts` (dynamic routes) can
 * use them and unit tests can run without a Next runtime.
 *
 * Strategy (ADR-0008):
 * - Dynamic routes get a per-request nonce (`script-src 'self' 'nonce-…'
 *   'strict-dynamic'`) generated in `src/proxy.ts`.
 * - Static routes stay static: a nonce would force dynamic rendering, so the
 *   nonce-less policy below is delivered via `next.config.ts` `headers()`.
 *   DOCUMENTED FALLBACK: Next.js emits inline `<script>` chunks (Turbopack
 *   bootstrap + RSC flight payload) even on prerendered pages. Investigated on
 *   Next 16.4.6: `experimental.sri: { algorithm: 'sha256' }` is supported and
 *   adds `integrity` to external chunks, but it does NOT externalize or hash
 *   the inline scripts (3 inline blocks in the prerendered `/about` HTML) and
 *   publishes no CSP hashes, so `script-src 'self'` alone would block them.
 *   Without a nonce (which would force dynamic rendering) the only
 *   CSP-compatible allowance is `'unsafe-inline'`, so the static policy is
 *   `script-src 'self' 'unsafe-inline'`. Trade-off: a static route's inline
 *   scripts could be injected by an HTML-level XSS; the strict nonce policy
 *   applies on every dynamic route. Recorded in the result file and ADR-0008.
 */

export interface CspOptions {
  /** Per-request nonce; when present the policy is nonce-based (dynamic routes). */
  nonce?: string;
  /** Adds `'unsafe-eval'` to `script-src` (development only, never production). */
  isDev: boolean;
  /** Enables `report-uri` / `report-to` for CSP violations. */
  reportUri?: string | undefined;
}

/** Builds the `Content-Security-Policy` header value. */
export function buildCsp(options: CspOptions): string {
  const { nonce, isDev, reportUri } = options;

  const scriptSrc = ["'self'"];
  if (nonce) {
    scriptSrc.push(`'nonce-${nonce}'`, "'strict-dynamic'");
  } else {
    // Documented fallback for static routes; see the module comment.
    scriptSrc.push("'unsafe-inline'");
  }
  if (isDev) {
    // React Refresh / dev tooling needs eval. NEVER enabled in production.
    scriptSrc.push("'unsafe-eval'");
  }

  const styleSrc = ["'self'", nonce ? `'nonce-${nonce}'` : "'unsafe-inline'"];

  const directives: string[] = [
    "default-src 'self'",
    `script-src ${scriptSrc.join(' ')}`,
    `style-src ${styleSrc.join(' ')}`,
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];

  if (!isDev) {
    directives.push('upgrade-insecure-requests');
  }
  if (reportUri) {
    directives.push(`report-uri ${reportUri}`);
  }

  return directives.join('; ');
}

export interface SecurityHeaderOptions {
  isProd: boolean;
}

/** Non-CSP security headers shared by static (next.config) and dynamic (proxy) responses. */
export function securityHeaders(options: SecurityHeaderOptions): Record<string, string> {
  const headers: Record<string, string> = {
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  };
  if (options.isProd) {
    headers['Strict-Transport-Security'] = 'max-age=63072000; includeSubDomains';
  }
  return headers;
}

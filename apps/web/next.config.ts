import type { NextConfig } from 'next';

import { buildCsp, securityHeaders } from './src/lib/csp';
import { parseEnv } from './src/lib/env.schema';

// Fail `next build` AND server boot when env is invalid, naming each invalid
// variable (AC-M08.6). The schema lives in src/lib/env.schema.ts WITHOUT
// `server-only` (next.config.ts cannot import it); src/lib/env.ts wraps it.
const webEnv = parseEnv(process.env);

const isProd = process.env.NODE_ENV === 'production';

/**
 * CSP for STATIC routes (AC-M08.8 / AC-M08.10), applied to all paths from
 * here and overridden with the per-request nonce policy by `src/proxy.ts` on
 * dynamic routes (proxy response headers win over `headers()` config).
 *
 * `unsafe-eval` only under `next dev` (never in production builds). The nonce-less
 * `script-src 'self' 'unsafe-inline'` fallback is documented in
 * `src/lib/csp.ts` and in ADR-0008 (docs/adr/0008-csp-static-vs-dynamic-routes.md).
 */
const staticCsp = buildCsp({
  isDev: process.env.NODE_ENV === 'development',
  reportUri: webEnv.CSP_REPORT_URI,
});

const nextConfig: NextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  typedRoutes: true,
  headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: staticCsp },
          ...Object.entries(securityHeaders({ isProd })).map(([key, value]) => ({ key, value })),
        ],
      },
    ];
  },
};

export default nextConfig;

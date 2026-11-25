import type { Metadata } from 'next';
import { connection } from 'next/server';
import type { ReactNode } from 'react';

import './globals.css';
import NotFound from './not-found';

export const metadata: Metadata = { title: '404 — Page not found' };

/**
 * Unmatched URLs (`experimental.globalNotFound`). Rendered per request so its
 * scripts carry the CSP nonce: a prerendered 404 has none and the nonce CSP
 * blocks it. Making `not-found.tsx` dynamic would make every page dynamic, and
 * a catch-all route would make `typedRoutes` accept any href.
 */
export default async function GlobalNotFound(): Promise<ReactNode> {
  await connection();
  return (
    <html lang="en">
      <body>
        <NotFound />
      </body>
    </html>
  );
}

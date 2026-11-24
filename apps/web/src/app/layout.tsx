import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'multirepo-final',
    template: '%s · multirepo-final',
  },
  description: 'NestJS + Next.js monorepo boilerplate.',
};

/**
 * Root layout. Theme is CSS-only (`prefers-color-scheme` + `data-theme`, see
 * `@repo/ui/tokens.css`): there is deliberately no inline theme script, so the
 * CSP never needs an extra allowance for one.
 */
export default function RootLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

// @module:auth
import Link from 'next/link';
// @end-module:auth
import type { ReactNode } from 'react';

/** Public pages (no auth). Keep this layout free of data fetching so its pages can stay static. */
export default function PublicLayout({ children }: { children: ReactNode }): ReactNode {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-8">
      {/* @module:auth */}
      <nav aria-label="Main">
        <Link href="/dashboard">Dashboard</Link>
      </nav>
      {/* @end-module:auth */}
      {children}
    </main>
  );
}

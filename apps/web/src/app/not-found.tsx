import type { ReactNode } from 'react';

/** Unknown route: rendered with a 404 status (AC-M08.3). */
export default function NotFound(): ReactNode {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-8">
      <h1 className="text-2xl font-semibold">404 — Page not found</h1>
      <p>The page you are looking for does not exist.</p>
    </div>
  );
}

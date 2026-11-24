import type { ReactNode } from 'react';

import { sanitizeNextPath } from '../../../lib/safe-redirect';
import { LoginForm } from './login-form';

/**
 * Login page (RSC). Sanitises the `next` parameter server-side
 * (`lib/safe-redirect.ts`) before the client form ever sees it (AC-M09.10).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] | undefined }>;
}): Promise<ReactNode> {
  const { next } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 p-8">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      <LoginForm next={sanitizeNextPath(typeof next === 'string' ? next : undefined)} />
    </main>
  );
}

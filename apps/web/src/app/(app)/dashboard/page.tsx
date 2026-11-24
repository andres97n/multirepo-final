import { MeResponse } from '@repo/contracts/auth';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/card';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { ApiError, apiGet } from '../../../lib/api-client.server';
import { readSession } from '../../../lib/session';
import { LogoutButton } from './logout-button';

const LOGIN_TARGET = '/login?next=%2Fdashboard';

/**
 * Dashboard (RSC). The proxy skips prefetches, so this page re-checks the
 * session itself: no session — or a 401 from `/auth/me` — redirects to login
 * (AC-M09.2). The user data comes from `GET /api/v1/auth/me` fetched
 * server-side; only `me` fields are rendered, so no token ever reaches the
 * flight payload (AC-M09.6 / AC-M09.11).
 */
export default async function DashboardPage(): Promise<ReactNode> {
  const session = await readSession();
  if (session === null) {
    redirect(LOGIN_TARGET);
  }

  let me: MeResponse;
  try {
    me = await apiGet('/api/v1/auth/me', MeResponse, {
      token: session.accessToken,
      cache: 'no-store',
    });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      redirect(LOGIN_TARGET);
    }
    throw error;
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-8">
      <Card>
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
          <CardDescription>Signed in as {me.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p>
            Roles: <strong>{me.roles.join(', ')}</strong>
          </p>
          <LogoutButton />
        </CardContent>
      </Card>
    </main>
  );
}

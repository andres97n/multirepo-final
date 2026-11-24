import { Health } from '@repo/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/card';
import type { ReactNode } from 'react';

import { apiGet, isApiUnreachable } from '../../lib/api-client.server';

/**
 * Home (RSC): shows the API health fetched SERVER-SIDE — the browser never
 * calls the API directly (`connect-src 'self'`). `cache: 'no-store'` makes this
 * route dynamic (ƒ) by design: the per-request CSP nonce from `src/proxy.ts`
 * applies here. An API error (envelope) propagates to `error.tsx`; an
 * unreachable API renders the "down" card below.
 */
export default async function HomePage(): Promise<ReactNode> {
  let health: Health;

  try {
    health = await apiGet('/api/v1/health/ready', Health, {
      cache: 'no-store',
      acceptErrorBody: true,
    });
  } catch (error) {
    if (isApiUnreachable(error)) {
      health = {
        status: 'down',
        checks: { api: { status: 'down', message: 'API unreachable' } },
      };
    } else {
      throw error;
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>API health</CardTitle>
        <CardDescription>Fetched server-side from the API readiness endpoint.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>
          Status: <strong>{health.status}</strong>
        </p>
        <ul>
          {Object.entries(health.checks).map(([name, check]) => (
            <li key={name}>
              {name}: {check.status}
              {check.message ? ` — ${check.message}` : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

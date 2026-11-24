'use client';

import { Button } from '@repo/ui/components/button';
import * as React from 'react';

const LOGIN_PATH = '/login';

/**
 * Logs the user out through the BFF (`POST /api/auth/logout`, CSRF-checked).
 * Login is loaded as a new document so the router cache cannot show the
 * dashboard again. If the BFF did not answer OK the cookie is still there, so
 * the user stays and is told.
 */
export function LogoutButton(): React.ReactElement {
  const [pending, setPending] = React.useState(false);
  const [failed, setFailed] = React.useState(false);

  async function handleClick(): Promise<void> {
    setPending(true);
    setFailed(false);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (response.ok) {
        // A full load on purpose: router.push would keep the dashboard in the router cache.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign(LOGIN_PATH);
        return;
      }
    } catch {
      // Network failure: reported below.
    }
    setFailed(true);
    setPending(false);
  }

  return (
    <>
      {failed ? (
        <p role="alert" className="text-sm font-medium text-destructive">
          Unable to log out. Please try again.
        </p>
      ) : null}
      <Button variant="secondary" onClick={() => void handleClick()} disabled={pending}>
        {pending ? 'Signing out…' : 'Log out'}
      </Button>
    </>
  );
}

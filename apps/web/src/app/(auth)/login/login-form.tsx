'use client';

// Must stay the first import: see lib/zod-jitless.ts.
import '../../../lib/zod-jitless';

import { LoginInput } from '@repo/contracts/auth';
import { Button } from '@repo/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@repo/ui/components/card';
import { FormField } from '@repo/ui/components/form-field';
import { Input } from '@repo/ui/components/input';
import * as React from 'react';

const GENERIC_ERROR = 'Unable to sign in. Please check your email and password and try again.';

const noopSubscribe = (): (() => void) => () => undefined;

export interface LoginFormProps {
  /** Already sanitised by the RSC page (`lib/safe-redirect.ts`). */
  next: string;
}

/**
 * Login form. `method="post"` keeps the password out of the URL before
 * hydration; after hydration the submit handler POSTs JSON to the BFF and
 * assigns the sanitised `next` path (AC-M09.1).
 */
export function LoginForm({ next }: LoginFormProps): React.ReactElement {
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  // False on the server and during hydration: a click before hydration would be
  // a native form POST to the JSON-only handler.
  const hydrated = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );

  async function handleSubmit(event: React.SubmitEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = LoginInput.safeParse({
      email: data.get('email'),
      password: data.get('password'),
    });
    if (!parsed.success) {
      setError(GENERIC_ERROR);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (response.ok) {
        // Stays disabled while the browser navigates: no double submit.
        window.location.assign(next);
        return;
      }
    } catch {
      // Network failure: same generic message as a rejection.
    }
    setError(GENERIC_ERROR);
    setSubmitting(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use your account email and password.</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          method="post"
          action="/api/auth/login"
          onSubmit={(event) => void handleSubmit(event)}
          className="flex flex-col gap-4"
        >
          <FormField label="Email">
            <Input type="email" name="email" autoComplete="email" required />
          </FormField>
          <FormField label="Password">
            <Input type="password" name="password" autoComplete="current-password" required />
          </FormField>
          {error === null ? null : (
            <p role="alert" className="text-sm font-medium text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" disabled={!hydrated || submitting}>
            {submitting ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

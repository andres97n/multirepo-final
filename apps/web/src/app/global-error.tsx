'use client';

import type { ReactNode } from 'react';

import { extractRequestIdFromMessage } from '../lib/request-id';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Root-level error boundary (replaces the root layout when it crashes). Owns
 * its `<html>`/`<body>`. Shows the message and request id, never the stack.
 * Reads the id from the ` [requestId:<id>]` message suffix and, when the
 * message is scrubbed in production, from the `digest` (same format).
 */
export default function GlobalError({ error, reset }: GlobalErrorProps): ReactNode {
  const requestId =
    extractRequestIdFromMessage(error.message) ?? extractRequestIdFromMessage(error.digest ?? '');
  const message = error.message.replace(/\s*\[requestId:[A-Za-z0-9._-]+\]\s*$/, '');

  return (
    <html lang="en">
      <body>
        <div role="alert" className="mx-auto flex max-w-3xl flex-col gap-4 p-8">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p>{message}</p>
          {requestId ? (
            <p>
              Request ID: <code>{requestId}</code>
            </p>
          ) : null}
          <button type="button" onClick={reset} className="w-fit rounded border px-3 py-1">
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}

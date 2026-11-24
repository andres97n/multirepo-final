'use client';

import type { ReactNode } from 'react';

import { extractRequestIdFromMessage } from '../lib/request-id';

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Route error boundary. Shows the message and the request id for support —
 * never the stack.
 *
 * The id is read from the ` [requestId:<id>]` message suffix first
 * (`extractRequestIdFromMessage`). In production React Flight replaces the
 * error message with a generic one and only transmits `digest`
 * (`react-server-dom-webpack` `emitErrorChunk`/`resolveErrorProd`), and React
 * Fizz does not run error boundaries server-side, so this component renders
 * after hydration only. `ApiError` therefore sets `digest` to the same
 * bracketed id, which the same regex extracts.
 */
export default function ErrorPage({ error, reset }: ErrorProps): ReactNode {
  const requestId =
    extractRequestIdFromMessage(error.message) ?? extractRequestIdFromMessage(error.digest ?? '');
  const message = error.message.replace(/\s*\[requestId:[A-Za-z0-9._-]+\]\s*$/, '');

  return (
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
  );
}

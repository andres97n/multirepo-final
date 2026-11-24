import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import ErrorPage from './error';

describe('error.tsx', () => {
  it('shows the message and requestId from the message suffix, never the stack', async () => {
    const error = new Error('boom [requestId:abc-123]');
    error.stack = 'STACK_MARKER_ERROR: boom\n    at secret.ts:1:1';

    const { container } = render(<ErrorPage error={error} reset={() => undefined} />);

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText(/boom/)).toBeInTheDocument();
    expect(screen.getByText('abc-123')).toBeInTheDocument();
    expect(screen.getByText(/Request ID:/)).toBeInTheDocument();
    expect(container.textContent).not.toContain('STACK_MARKER_ERROR');
    expect(container.textContent).not.toContain('secret.ts');
    expect(container.textContent).not.toContain('[requestId:');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('falls back to error.digest for the requestId (prod: message is scrubbed)', () => {
    const error = new Error(
      'An error occurred in the Server Components render. The specific message is omitted in production builds to avoid leaking sensitive details.',
    );
    Object.assign(error, { digest: '[requestId:live-check-rid-123]' });

    render(<ErrorPage error={error} reset={() => undefined} />);

    expect(screen.getByText('live-check-rid-123')).toBeInTheDocument();
    expect(screen.getByText(/Request ID:/)).toBeInTheDocument();
  });

  it('hides the request id line when there is none', () => {
    render(<ErrorPage error={new Error('plain failure')} reset={() => undefined} />);

    expect(screen.getByText('plain failure')).toBeInTheDocument();
    expect(screen.queryByText(/Request ID:/)).not.toBeInTheDocument();
  });

  it('calls reset when Try again is clicked', () => {
    const reset = vi.fn();
    render(<ErrorPage error={new Error('boom')} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

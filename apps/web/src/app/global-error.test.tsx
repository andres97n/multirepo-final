import { fireEvent, render, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import GlobalError from './global-error';

interface HtmlTreeProps {
  children: ReactElement<{ children: ReactElement }>;
}

describe('global-error.tsx', () => {
  it('renders its own html/body and shows the requestId, never the stack', async () => {
    const error = new Error('total failure [requestId:rid-77]');
    error.stack = 'STACK_MARKER_GLOBAL: total failure\n    at secret.ts:1:1';

    // jsdom cannot nest <html> in a div, so ownership is asserted structurally.
    const tree = GlobalError({ error, reset: () => undefined }) as ReactElement<HtmlTreeProps>;
    expect(tree.type).toBe('html');
    expect(tree.props.children.type).toBe('body');

    const { container } = render(tree);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('rid-77')).toBeInTheDocument();
    expect(container.textContent).not.toContain('STACK_MARKER_GLOBAL');
    expect(container.textContent).not.toContain('secret.ts');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('falls back to error.digest for the requestId', () => {
    const error = new Error('scrubbed');
    Object.assign(error, { digest: '[requestId:live-check-rid-123]' });

    render(<GlobalError error={error} reset={() => undefined} />);

    expect(screen.getByText('live-check-rid-123')).toBeInTheDocument();
  });

  it('calls reset when Try again is clicked', () => {
    const reset = vi.fn();
    render(<GlobalError error={new Error('boom')} reset={reset} />);

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

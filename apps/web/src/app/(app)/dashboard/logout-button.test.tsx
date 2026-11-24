import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { LogoutButton } from './logout-button';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  location: { assign: vi.fn() },
}));

beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.location.assign.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
  vi.stubGlobal('location', mocks.location);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LogoutButton', () => {
  it('renders an accessible button', async () => {
    const { container } = render(<LogoutButton />);

    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('POSTs to the BFF logout endpoint and loads login as a new document', async () => {
    mocks.fetch.mockResolvedValue({ ok: true });
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() => {
      expect(mocks.fetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    });
    await waitFor(() => {
      expect(mocks.location.assign).toHaveBeenCalledWith('/login');
    });
  });

  it('disables the button while the request is pending', async () => {
    let resolveFetch: (value: { ok: boolean }) => void = () => undefined;
    mocks.fetch.mockReturnValue(
      new Promise<{ ok: boolean }>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signing out/i })).toBeDisabled();
    });
    resolveFetch({ ok: true });
    await waitFor(() => {
      expect(mocks.location.assign).toHaveBeenCalledWith('/login');
    });
  });

  it.each([
    ['the request fails', () => mocks.fetch.mockRejectedValue(new Error('network down'))],
    ['the BFF rejects it', () => mocks.fetch.mockResolvedValue({ ok: false })],
  ])('stays signed in and says so when %s', async (_case, arrange) => {
    arrange();
    render(<LogoutButton />);

    fireEvent.click(screen.getByRole('button', { name: /log out/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to log out/i);
    expect(screen.getByRole('button', { name: /log out/i })).toBeEnabled();
    expect(mocks.location.assign).not.toHaveBeenCalled();
  });
});

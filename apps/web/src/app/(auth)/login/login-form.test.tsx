import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { LoginForm } from './login-form';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  location: { assign: vi.fn() },
}));

function fillAndSubmit(): void {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'secret-password' } });
  fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
}

/** Dispatches submit directly so jsdom's constraint validation never intercepts. */
function submitDirectly(): void {
  const form = document.querySelector('form');
  if (form === null) {
    throw new Error('login form not rendered');
  }
  fireEvent.submit(form);
}

function renderForm(next = '/dashboard'): ReturnType<typeof render> {
  return render(<LoginForm next={next} />);
}

beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.location.assign.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
  vi.stubGlobal('location', mocks.location);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('LoginForm', () => {
  it('renders an accessible form', async () => {
    const { container } = renderForm();

    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('shows a generic error and never calls the API for an invalid email', async () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'not-an-email' } });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret-password' },
    });
    submitDirectly();

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to sign in/i);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('shows a generic error when the API rejects the credentials', async () => {
    mocks.fetch.mockResolvedValue({ ok: false, status: 401 });
    renderForm();

    fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to sign in/i);
    expect(mocks.fetch).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ email: 'a@b.com', password: 'secret-password' }),
      }),
    );
    expect(mocks.location.assign).not.toHaveBeenCalled();
  });

  it('shows a generic error when the request fails', async () => {
    mocks.fetch.mockRejectedValue(new Error('network down'));
    renderForm();

    fillAndSubmit();

    expect(await screen.findByRole('alert')).toHaveTextContent(/unable to sign in/i);
  });

  it('disables the submit button while submitting', async () => {
    let resolveFetch: (value: { ok: boolean }) => void = () => undefined;
    mocks.fetch.mockReturnValue(
      new Promise<{ ok: boolean }>((resolve) => {
        resolveFetch = resolve;
      }),
    );
    renderForm();

    fillAndSubmit();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    });
    resolveFetch({ ok: false });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /sign in/i })).toBeEnabled();
    });
  });

  it('assigns the sanitised next path after a successful login', async () => {
    mocks.fetch.mockResolvedValue({ ok: true });
    renderForm('/after-login');

    fillAndSubmit();

    await waitFor(() => {
      expect(mocks.location.assign).toHaveBeenCalledWith('/after-login');
    });
    // Still disabled while the browser navigates: no double submit.
    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

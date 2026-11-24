import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import HomePage from './page';

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  isApiUnreachable: vi.fn(),
}));

vi.mock('../../lib/api-client.server', () => mocks);

describe('HomePage', () => {
  it('renders the api health fetched server-side (ok state)', async () => {
    mocks.apiGet.mockResolvedValue({
      status: 'ok',
      checks: { database: { status: 'ok' } },
    });
    mocks.isApiUnreachable.mockReturnValue(false);

    const { container } = render(await HomePage());

    expect(mocks.apiGet).toHaveBeenCalledWith('/api/v1/health/ready', expect.anything(), {
      cache: 'no-store',
      acceptErrorBody: true,
    });
    expect(screen.getByText('API health')).toBeInTheDocument();
    expect(screen.getByText('ok', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/database: ok/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders the down card when the api is unreachable', async () => {
    mocks.apiGet.mockRejectedValue(new Error('fetch failed'));
    mocks.isApiUnreachable.mockReturnValue(true);

    render(await HomePage());

    expect(screen.getByText('down', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText(/API unreachable/)).toBeInTheDocument();
  });

  it('propagates api errors to error.tsx', async () => {
    const apiError = new Error('boom [requestId:rid-5]');
    mocks.apiGet.mockRejectedValue(apiError);
    mocks.isApiUnreachable.mockReturnValue(false);

    await expect(HomePage()).rejects.toThrow('boom');
  });
});

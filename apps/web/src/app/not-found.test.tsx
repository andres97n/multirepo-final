import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import NotFound from './not-found';

describe('not-found.tsx', () => {
  it('renders the 404 page with zero axe violations', async () => {
    const { container } = render(<NotFound />);

    expect(screen.getByRole('heading', { name: /404/ })).toBeInTheDocument();
    expect(screen.getByText(/does not exist/)).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

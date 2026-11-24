import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { Input } from './input';

describe('Input', () => {
  it('renders in its default state with zero axe violations', async () => {
    const { container } = render(<Input aria-label="Email" />);

    expect(screen.getByRole('textbox', { name: 'Email' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards a ref to the underlying input element', () => {
    const ref = React.createRef<HTMLInputElement>();
    render(<Input ref={ref} aria-label="Email" />);

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
  });

  it('forwards native props', () => {
    render(<Input type="email" placeholder="you@example.com" disabled aria-label="Email" />);
    const input = screen.getByRole('textbox', { name: 'Email' });

    expect(input).toHaveAttribute('type', 'email');
    expect(input).toHaveAttribute('placeholder', 'you@example.com');
    expect(input).toBeDisabled();
  });

  it('includes the ring focus-visible classes', () => {
    render(<Input aria-label="Email" />);
    const input = screen.getByRole('textbox', { name: 'Email' });

    expect(input.className).toContain('focus-visible:ring-ring');
    expect(input.className).toContain('focus-visible:ring-2');
    expect(input.className).toContain('border-border');
  });

  it('merges a custom className', () => {
    render(<Input aria-label="Email" className="w-64" />);
    const input = screen.getByRole('textbox', { name: 'Email' });

    expect(input.className).toContain('w-64');
  });
});

import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { Input } from './input';
import { Label } from './label';

describe('Label', () => {
  it('renders a native label linked to its control with zero axe violations', async () => {
    const { container } = render(
      <>
        <Label htmlFor="email">Email</Label>
        <Input id="email" />
      </>,
    );

    const input = screen.getByLabelText('Email');
    expect(input).toBeInstanceOf(HTMLInputElement);
    expect(input).toHaveAttribute('id', 'email');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('forwards a ref to the underlying label element', () => {
    const ref = React.createRef<HTMLLabelElement>();
    render(
      <>
        <Label ref={ref} htmlFor="email">
          Email
        </Label>
        <Input id="email" />
      </>,
    );

    expect(ref.current).toBeInstanceOf(HTMLLabelElement);
  });

  it('forwards native props and token classes', () => {
    render(
      <>
        <Label htmlFor="email" data-testid="label" className="custom">
          Email
        </Label>
        <Input id="email" />
      </>,
    );
    const label = screen.getByTestId('label');

    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', 'email');
    expect(label.className).toContain('text-foreground');
    expect(label.className).toContain('custom');
  });
});

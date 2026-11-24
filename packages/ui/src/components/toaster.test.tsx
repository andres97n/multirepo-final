import { act, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { Toaster, toast } from './toaster';

describe('Toaster', () => {
  it('binds sonner colors to the theme tokens so data-theme applies', async () => {
    const { container } = render(<Toaster />);

    act(() => {
      toast('Themed');
    });
    await screen.findByText('Themed');

    const toaster = container.ownerDocument.querySelector<HTMLElement>('[data-sonner-toaster]');
    expect(toaster).not.toBeNull();
    expect(toaster?.style.getPropertyValue('--normal-bg')).toBe('var(--background)');
    expect(toaster?.style.getPropertyValue('--normal-text')).toBe('var(--foreground)');
    expect(toaster?.style.getPropertyValue('--normal-border')).toBe('var(--border)');
  });

  it('shows a toast and renders with zero axe violations', async () => {
    const { container } = render(<Toaster />);

    act(() => {
      toast('Saved');
    });

    expect(await screen.findByText('Saved')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});

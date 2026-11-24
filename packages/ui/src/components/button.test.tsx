import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { Button, buttonVariants } from './button';

const VARIANTS = ['default', 'secondary', 'destructive', 'ghost', 'link'] as const;
const SIZES = ['default', 'sm', 'lg', 'icon'] as const;

describe('Button', () => {
  it('renders in its default state with zero axe violations', async () => {
    const { container } = render(<Button>Send</Button>);

    expect(screen.getByRole('button', { name: 'Send' })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('produces distinct class output for every variant and size', () => {
    const variantClasses = VARIANTS.map(
      (variant) =>
        render(<Button variant={variant}>x</Button>).container.firstElementChild?.className,
    );
    const sizeClasses = SIZES.map(
      (size) => render(<Button size={size}>x</Button>).container.firstElementChild?.className,
    );

    expect(new Set(variantClasses).size).toBe(VARIANTS.length);
    expect(new Set(sizeClasses).size).toBe(SIZES.length);

    const [defaultClass, secondaryClass, destructiveClass, ghostClass, linkClass] = variantClasses;
    expect(defaultClass).toContain('bg-primary');
    expect(defaultClass).toContain('text-primary-foreground');
    expect(secondaryClass).toContain('bg-secondary');
    expect(destructiveClass).toContain('bg-destructive');
    expect(ghostClass).toContain('hover:bg-muted');
    expect(linkClass).toContain('underline-offset-4');

    const [defaultSize, smSize, lgSize, iconSize] = sizeClasses;
    expect(defaultSize).toContain('h-10');
    expect(smSize).toContain('h-9');
    expect(lgSize).toContain('h-11');
    expect(iconSize).toContain('w-10');
  });

  it('uses buttonVariants for its base classes', () => {
    expect(buttonVariants({ variant: 'default', size: 'default' })).toContain('bg-primary');
    expect(buttonVariants()).toContain('bg-primary');
  });

  it('includes the ring focus-visible classes', () => {
    render(<Button>Send</Button>);
    const button = screen.getByRole('button', { name: 'Send' });

    expect(button.className).toContain('focus-visible:ring-ring');
    expect(button.className).toContain('focus-visible:ring-2');
    expect(button.className).toContain('focus-visible:ring-offset-2');
  });

  it('forwards a ref to the underlying button element', () => {
    const ref = React.createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Send</Button>);

    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it('forwards native props and defaults type to "button"', () => {
    const submit = vi.fn<React.MouseEventHandler<HTMLButtonElement>>();
    const { rerender } = render(
      <Button type="submit" disabled onClick={submit}>
        Save
      </Button>,
    );
    const button = screen.getByRole('button', { name: 'Save' });

    expect(button).toHaveAttribute('type', 'submit');
    expect(button).toBeDisabled();

    rerender(<Button>Send</Button>);
    expect(screen.getByRole('button', { name: 'Send' })).toHaveAttribute('type', 'button');
  });

  it('does not call onClick when disabled', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn<React.MouseEventHandler<HTMLButtonElement>>();
    render(
      <Button disabled onClick={handleClick}>
        Send
      </Button>,
    );

    await user.click(screen.getByRole('button', { name: 'Send' }));
    expect(handleClick).not.toHaveBeenCalled();
  });

  it('is keyboard operable: Tab focuses, Enter and Space activate', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn<React.MouseEventHandler<HTMLButtonElement>>();
    render(<Button onClick={handleClick}>Send</Button>);
    const button = screen.getByRole('button', { name: 'Send' });

    await user.tab();
    expect(button).toHaveFocus();

    await user.keyboard('{Enter}');
    expect(handleClick).toHaveBeenCalledTimes(1);

    await user.keyboard(' ');
    expect(handleClick).toHaveBeenCalledTimes(2);
  });
});

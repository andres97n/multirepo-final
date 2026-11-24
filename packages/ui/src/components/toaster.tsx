'use client';

import * as React from 'react';
import { Toaster as Sonner, toast } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Sonner toaster styled with `@repo/ui` tokens. Sonner's own palette is overridden through its
 * `--normal-*` variables, so toasts follow both `prefers-color-scheme` and `data-theme`
 * without a `theme` prop or any JS. Pass `style` to override.
 */
const tokenStyle = {
  '--normal-bg': 'var(--background)',
  '--normal-text': 'var(--foreground)',
  '--normal-border': 'var(--border)',
} as React.CSSProperties;

function Toaster(props: ToasterProps) {
  return (
    <Sonner
      className="toaster group"
      style={tokenStyle}
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
}

export { Toaster, toast };

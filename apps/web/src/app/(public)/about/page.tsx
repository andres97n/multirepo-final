import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'About',
};

/** Tiny static page (○): no data fetching, so it stays prerendered. */
export default function AboutPage(): ReactNode {
  return (
    <section>
      <h1 className="text-2xl font-semibold">About</h1>
      <p>
        NestJS + Next.js monorepo boilerplate: modular architecture, shared contracts, strict
        quality gates and secure defaults.
      </p>
    </section>
  );
}

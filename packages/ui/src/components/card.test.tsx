import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

describe('Card', () => {
  it('renders title, description, content and footer with zero axe violations', async () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>Create project</CardTitle>
          <CardDescription>Deploy your new project in one-click.</CardDescription>
        </CardHeader>
        <CardContent>Form goes here.</CardContent>
        <CardFooter>Footer actions.</CardFooter>
      </Card>,
    );

    expect(screen.getByRole('heading', { level: 3, name: 'Create project' })).toBeInTheDocument();
    expect(screen.getByText('Deploy your new project in one-click.')).toBeInTheDocument();
    expect(screen.getByText('Form goes here.')).toBeInTheDocument();
    expect(screen.getByText('Footer actions.')).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('renders the card shell with token classes', () => {
    render(<Card data-testid="card">Plain card.</Card>);
    const card = screen.getByTestId('card');

    expect(card.tagName).toBe('DIV');
    expect(card.className).toContain('bg-card');
    expect(card.className).toContain('text-card-foreground');
    expect(card.className).toContain('border-border');
  });
});

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { FormField } from './form-field';
import { Input } from './input';

describe('FormField', () => {
  it('links its label to the control and renders with zero axe violations', async () => {
    const { container } = render(
      <FormField label="Email">
        <Input />
      </FormField>,
    );

    const control = screen.getByLabelText('Email');
    expect(control).toBeInstanceOf(HTMLInputElement);
    expect(control).toHaveAttribute('id');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('honours an explicit id', () => {
    render(
      <FormField label="Email" id="email-field">
        <Input />
      </FormField>,
    );

    const control = screen.getByLabelText('Email');
    expect(control).toHaveAttribute('id', 'email-field');
    expect(screen.getByText('Email')).toHaveAttribute('for', 'email-field');
  });

  it('keeps the child element id when no id prop is passed', () => {
    render(
      <FormField label="Email">
        <Input id="mine" />
      </FormField>,
    );

    const control = screen.getByLabelText('Email');
    expect(control).toHaveAttribute('id', 'mine');
    expect(screen.getByText('Email')).toHaveAttribute('for', 'mine');
  });

  it('sets aria-invalid and points aria-describedby at the error when there is one', async () => {
    const { container } = render(
      <FormField label="Email" error="Enter a valid email">
        <Input />
      </FormField>,
    );

    const control = screen.getByLabelText('Email');
    const error = screen.getByRole('alert');
    expect(control).toHaveAttribute('aria-invalid', 'true');
    expect(control.getAttribute('aria-describedby')).toContain(error.id);
    expect(error).toHaveTextContent('Enter a valid email');
    expect(await axe(container)).toHaveNoViolations();
  });

  it('omits aria-invalid and describes the control with the description id', () => {
    render(
      <FormField label="Email" description="We never share your email.">
        <Input />
      </FormField>,
    );

    const control = screen.getByLabelText('Email');
    const description = screen.getByText('We never share your email.');
    expect(control).not.toHaveAttribute('aria-invalid');
    expect(control.getAttribute('aria-describedby')).toContain(description.id);
  });

  it('includes both description and error ids when both are present', () => {
    render(
      <FormField label="Email" description="We never share your email." error="Required">
        <Input />
      </FormField>,
    );

    const control = screen.getByLabelText('Email');
    const description = screen.getByText('We never share your email.');
    const error = screen.getByRole('alert');
    const describedBy = control.getAttribute('aria-describedby');
    expect(describedBy).toContain(description.id);
    expect(describedBy).toContain(error.id);
  });

  it('omits aria-describedby entirely when there is no description or error', () => {
    render(
      <FormField label="Email">
        <Input />
      </FormField>,
    );

    expect(screen.getByLabelText('Email')).not.toHaveAttribute('aria-describedby');
  });

  it('preserves an existing aria-describedby on the control by appending', () => {
    render(
      <FormField label="Email" error="Required">
        <Input aria-describedby="custom-hint" />
      </FormField>,
    );

    const control = screen.getByLabelText('Email');
    const error = screen.getByRole('alert');
    const describedBy = control.getAttribute('aria-describedby');
    expect(describedBy).toContain('custom-hint');
    expect(describedBy).toContain(error.id);
    expect(describedBy?.startsWith('custom-hint')).toBe(true);
  });
});

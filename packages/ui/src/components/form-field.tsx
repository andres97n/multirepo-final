'use client';

import * as React from 'react';

import { cn } from '../lib/cn';
import { Label } from './label';

export interface FormFieldProps {
  label: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  id?: string;
  className?: string;
  children: React.ReactElement;
}

interface ControlProps {
  id?: string | undefined;
  'aria-invalid'?: boolean | 'true' | 'false' | undefined;
  'aria-describedby'?: string | undefined;
}

function FormField({ label, description, error, id, className, children }: FormFieldProps) {
  const generatedId = React.useId();
  const childProps = children.props as ControlProps;
  const controlId = id ?? childProps.id ?? generatedId;
  const descriptionId = `${controlId}-description`;
  const errorId = `${controlId}-error`;
  const hasDescription = Boolean(description);
  const hasError = Boolean(error);

  const describedBy = [
    childProps['aria-describedby'],
    hasDescription ? descriptionId : undefined,
    hasError ? errorId : undefined,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ');

  const controlProps: ControlProps = { id: controlId };
  if (hasError) {
    controlProps['aria-invalid'] = true;
  }
  if (describedBy.length > 0) {
    controlProps['aria-describedby'] = describedBy;
  }

  const control = React.cloneElement(children as React.ReactElement<ControlProps>, controlProps);

  return (
    <div className={cn('space-y-2', className)}>
      <Label htmlFor={controlId}>{label}</Label>
      {control}
      {hasDescription ? (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {hasError ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { FormField };

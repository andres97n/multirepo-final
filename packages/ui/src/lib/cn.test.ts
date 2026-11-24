import { describe, expect, it } from 'vitest';

import { cn } from './cn';

function maybeClass(condition: boolean, name: string): string | false {
  return condition ? name : false;
}

describe('cn', () => {
  it('joins conditional class names and drops falsy values', () => {
    expect(cn('a', maybeClass(false, 'b'), undefined, 'c')).toBe('a c');
    expect(cn('a', maybeClass(true, 'b'))).toBe('a b');
  });

  it('merges conflicting tailwind classes, last one winning', () => {
    expect(cn('px-4 py-2', 'px-8')).toBe('py-2 px-8');
  });

  it('merges class arrays and objects', () => {
    expect(cn(['a', { b: true, c: false }], 'd')).toBe('a b d');
  });
});

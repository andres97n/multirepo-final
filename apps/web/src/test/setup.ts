import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import * as matchers from 'vitest-axe/matchers';

expect.extend(matchers);

afterEach(cleanup);

declare module 'vitest' {
  interface Assertion<R, T> {
    /** Asserts that axe results contain no violations (vitest-axe). */
    toHaveNoViolations(this: Assertion<R, T>): R;
  }
  interface AsymmetricMatchersContaining {
    toHaveNoViolations(): void;
  }
}

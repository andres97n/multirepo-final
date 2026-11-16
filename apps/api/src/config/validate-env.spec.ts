import { describe, expect, it } from 'vitest';
import { validateEnv } from './validate-env';

describe('validateEnv', () => {
  it('returns the parsed config for a valid env', () => {
    const config = validateEnv({ NODE_ENV: 'development' });
    expect(config.NODE_ENV).toBe('development');
    expect(config.PORT).toBe(3001);
  });

  it('throws a single error listing every invalid variable by name', () => {
    let message = '';
    try {
      validateEnv({
        NODE_ENV: 'bogus',
        PORT: 'not-a-number',
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).toContain('Invalid environment variables');
    expect(message).toContain('NODE_ENV');
    expect(message).toContain('PORT');
  });
});

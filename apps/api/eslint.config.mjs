import nest from '@repo/config-eslint/nest';

const MONGO_DRIVERS = ['mongoose', 'mongoose/*', 'mongodb', 'mongodb/*'];
const POSTGRES_DRIVERS = [
  'drizzle-orm',
  'drizzle-orm/*',
  'drizzle-kit',
  'drizzle-kit/*',
  'pg',
  'pg/*',
  '@electric-sql/pglite',
  '@electric-sql/pglite/*',
];

/** Forbids the given driver packages; each adapter dir lifts only its own. */
function driverRule(group) {
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group,
            message:
              'Import database ports from src/infra/database/core instead of the driver (AC-M04.9 / AC-M05.9).',
          },
        ],
      },
    ],
  };
}

export default [
  ...nest,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      // Nest module classes are decorated containers with no body.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
  {
    // AC-M04.9 / AC-M05.9: drivers may only be imported inside their own adapter.
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: driverRule([...MONGO_DRIVERS, ...POSTGRES_DRIVERS]),
  },
  {
    files: ['src/infra/database/mongo/**/*.ts'],
    rules: driverRule(POSTGRES_DRIVERS),
  },
  {
    files: ['src/infra/database/postgres/**/*.ts'],
    rules: driverRule(MONGO_DRIVERS),
  },
  // The auth module's own adapters follow the same rule as the infra adapters:
  // each folder lifts only its engine's group (specs/testing included).
  {
    files: ['src/modules/auth/mongo/**/*.ts'],
    rules: driverRule(POSTGRES_DRIVERS),
  },
  {
    files: ['src/modules/auth/postgres/**/*.ts'],
    rules: driverRule(MONGO_DRIVERS),
  },
];

import nest from '@repo/config-eslint/nest';

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
    // AC-M04.9: drivers may only be imported inside the mongo adapter.
    files: ['src/**/*.ts', 'test/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['mongoose', 'mongoose/*', 'mongodb', 'mongodb/*'],
              message:
                'Import database ports from src/infra/database/core instead of the driver (AC-M04.9).',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/infra/database/mongo/**/*.ts'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },
];

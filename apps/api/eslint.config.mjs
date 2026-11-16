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
];

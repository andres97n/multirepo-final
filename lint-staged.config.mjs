export default {
  '*': 'prettier --write --ignore-unknown',
  '*.{ts,tsx,js,mjs,cjs}': 'eslint --fix --max-warnings 0',
};

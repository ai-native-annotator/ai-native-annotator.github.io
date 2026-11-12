import js from '@eslint/js';
import globals from 'globals';

const commonGlobals = {
  ...globals.browser,
  ...globals.es2021,
};

export default [
  {
    ignores: ['node_modules/**', 'test-results/**', 'playwright-report/**'],
  },
  {
    files: ['js/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      globals: commonGlobals,
      sourceType: 'module',
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['docs/verification/**/*.js'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...commonGlobals,
        ...globals.node,
      },
      sourceType: 'commonjs',
    },
    rules: {
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs', 'test/**/*.mjs'],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
      sourceType: 'module',
    },
  },
];

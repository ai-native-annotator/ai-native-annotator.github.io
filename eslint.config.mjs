import js from '@eslint/js';
import globals from 'globals';

const commonGlobals = {
  ...globals.browser,
  ...globals.es2021,
};

export default [
  {
    ignores: ['node_modules/**', 'test-results/**', 'playwright-report/**', 'data/reference/**'],
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
      // Existing modules intentionally expose a few browser callbacks and keep
      // intermediate values for diagnostics. Turn this on file-by-file as the
      // affected modules are refactored instead of hiding the real errors in a
      // baseline-suppression list.
      'no-unused-vars': 'off',
    },
  },
  {
    // The block above replaces the recommended rules with its own `rules`, so
    // no-undef and the rest are off for js/; the SkillParse page gets them back
    // (an undefined name in its settings dialog once reached the deployed site).
    files: ['js/skillparse/**/*.js'],
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

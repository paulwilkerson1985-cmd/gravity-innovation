import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // docs/research holds lab scripts from the graphics research (Node scripts, not game code).
  { ignores: ['dist', 'node_modules', 'test-results', 'playwright-report', 'screenshots', 'docs/research'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { window: 'readonly', document: 'readonly', console: 'readonly' } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    // The rules engine must stay pure: no DOM, no three, no ambient randomness or clocks.
    files: ['src/engine/**/*.ts', 'src/data/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['three', 'three/*', '../render/*', '../ui/*', '../game/*'] }],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded PRNG in engine/rng.ts' },
        { object: 'Date', property: 'now', message: 'Engine must not read the clock' },
        { object: 'performance', property: 'now', message: 'Engine must not read the clock' },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'indexedDB', 'navigator'],
    },
  },
);

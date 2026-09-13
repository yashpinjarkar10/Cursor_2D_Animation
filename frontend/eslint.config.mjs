import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import nextPlugin from '@next/eslint-plugin-next';

export default [
  {
    ignores: [
      '.next/**',
      '.open-next/**',
      '.wrangler/**',
      'node_modules/**',
      'out/**',
      'dist/**',
      'build/**',
      'tempnext/**',
    ],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    settings: {
      react: { version: 'detect' },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      '@next/next': nextPlugin,
    },
    rules: {
      ...(tsPlugin.configs.recommended?.rules ?? {}),
      ...(reactPlugin.configs.recommended?.rules ?? {}),
      ...(reactHooksPlugin.configs.recommended?.rules ?? {}),
      ...(nextPlugin.configs.recommended?.rules ?? {}),
      ...(nextPlugin.configs['core-web-vitals']?.rules ?? {}),

      // React 17+ JSX transform
      'react/react-in-jsx-scope': 'off',

      // These rules are useful when adopting React Compiler, but are too noisy
      // (and sometimes false-positive) for this repo's current patterns.
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
];

import js from '@eslint/js'
import globals from 'globals'
import prettier from 'eslint-config-prettier'

// Config plana de ESLint 9. `eslint-config-prettier` va al final para que ninguna regla de
// estilo pelee con Prettier — el formato lo decide Prettier, ESLint sólo mira correcciones reales.
export default [
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node }
    },
    rules: {
      'no-console': 'off',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_|next', varsIgnorePattern: '^_' }],
      'no-underscore-dangle': 'off',
      eqeqeq: ['error', 'smart'],
      'prefer-const': ['warn', { destructuring: 'all' }],
      'no-return-await': 'error'
    }
  },
  {
    files: ['test/**/*.js'],
    languageOptions: { globals: { ...globals.node } }
  },
  prettier
]

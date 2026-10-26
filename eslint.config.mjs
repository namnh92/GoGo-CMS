import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

const TEXT_SIZE_MESSAGE =
  'No arbitrary text-[Npx] size — use the named scale in src/styles/tokens.css: text-caption (11), text-label (12), text-body (13), text-title (15), text-heading (18), text-display (22), text-hero (32).'

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'public',
      'src/shared/api/schema.d.ts',
      'playwright-report',
      'test-results',
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Colour literals belong in the tokens file, nowhere else.
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/^#(?:[0-9a-fA-F]{3,8})$/]',
          message: 'No colour literals outside src/styles/tokens.css — use a semantic token.',
        },
        // GoGo-CMS#248: font sizes come from the named scale in tokens.css
        // (caption/label/body/title/heading/display/hero), not one-off pixels.
        {
          selector: 'Literal[value=/\\btext-\\[\\d+(\\.\\d+)?px\\]/]',
          message: TEXT_SIZE_MESSAGE,
        },
        {
          selector: 'TemplateElement[value.raw=/\\btext-\\[\\d+(\\.\\d+)?px\\]/]',
          message: TEXT_SIZE_MESSAGE,
        },
      ],
    },
  },
)

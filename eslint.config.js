import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';

export default [
	{
		ignores: [
			'node_modules/**',
			'dist/**',
			'coverage/**',
			'.scannerwork/**',
			'.worktrees/**',
			'*.config.js',
			'vite.config.js',
			'test-*.mjs',
			'test-*.js',
			'_*.mjs',
			'_*.js',
			'feed-seeker.js'
		]
	},
	js.configs.recommended,
	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: tsparser,
			parserOptions: {
				ecmaVersion: 'latest',
				sourceType: 'module'
			},
			globals: {
				console: 'readonly',
				process: 'readonly',
				URL: 'readonly',
				Document: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly',
				Buffer: 'readonly',
				// Web/DOM API globals
				fetch: 'readonly',
				Response: 'readonly',
				Request: 'readonly',
				RequestInit: 'readonly',
				HeadersInit: 'readonly',
				Headers: 'readonly',
				AbortController: 'readonly',
				AbortSignal: 'readonly',
				// DOM types
				HTMLElement: 'readonly',
				HTMLAnchorElement: 'readonly',
				HTMLLinkElement: 'readonly',
				NodeList: 'readonly',
				NodeListOf: 'readonly',
				Element: 'readonly'
			}
		},
		plugins: {
			'@typescript-eslint': tseslint
		},
		rules: {
			...tseslint.configs.recommended.rules,
			'no-unused-vars': 'off',
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_'
				}
			],
			'@typescript-eslint/no-explicit-any': 'warn',
			'@typescript-eslint/explicit-module-boundary-types': 'off',
			'no-console': 'off'
		}
	},
	{
		files: ['**/*.js'],
		languageOptions: {
			globals: {
				console: 'readonly',
				process: 'readonly',
				URL: 'readonly',
				setTimeout: 'readonly',
				clearTimeout: 'readonly',
				setInterval: 'readonly',
				clearInterval: 'readonly',
				Buffer: 'readonly',
				assert: 'readonly',
				describe: 'readonly',
				it: 'readonly',
				beforeEach: 'readonly',
				afterEach: 'readonly',
				expect: 'readonly'
			}
		},
		rules: {
			'no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_'
				}
			]
		}
	},
	prettier
];

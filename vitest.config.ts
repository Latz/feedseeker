import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		exclude: ['node_modules/**', '.worktrees/**'],
		coverage: {
			provider: 'v8',
			reporter: ['lcov', 'text'],
			reportsDirectory: 'coverage',
			include: ['feed-seeker.ts', 'modules/**/*.ts'],
			exclude: ['modules/banner.ts'],
		},
	},
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		// cli-build.test.ts executes dist/, which doesn't exist in Stryker's sandbox
		exclude: [
			'node_modules/**',
			'.worktrees/**',
			...(process.env.STRYKER ? ['tests/cli-build.test.ts'] : []),
			// live websites: only via `npm run test:live` (LIVE=1)
			...(process.env.LIVE ? [] : ['tests/live/**'])
		],
		coverage: {
			provider: 'v8',
			reporter: ['lcov', 'text'],
			reportsDirectory: 'coverage',
			include: ['feedseeker.ts', 'modules/**/*.ts'],
			exclude: ['modules/banner.ts']
		}
	}
});

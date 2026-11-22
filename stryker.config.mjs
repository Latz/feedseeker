/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
	testRunner: 'vitest',
	vitest: { configFile: 'vitest.config.ts' },
	mutate: ['feedseeker.ts', 'modules/**/*.ts', 'cli/**/*.ts', '!modules/banner.ts'],
	reporters: ['clear-text', 'progress', 'html'],
	incremental: true,
	coverageAnalysis: 'perTest',
	concurrency: 4,
	// code default timeout is 15s plus retry delays
	timeoutMS: 20000,
	// CI fails below 90% overall (.github/workflows/mutation.yml); local runs of single
	// files never do, since one file alone may legitimately score lower
	thresholds: { high: 80, low: 60, break: process.env.CI ? 90 : null }
};

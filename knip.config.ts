import type { KnipConfig } from 'knip';

const config: KnipConfig = {
	entry: ['feed-seeker.ts', 'cli/index.ts'],
	project: ['**/*.ts', '**/*.js'],
	ignoreExportsUsedInFile: false,
};

export default config;

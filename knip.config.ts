import type { KnipConfig } from 'knip';

const config: KnipConfig = {
	entry: ['feed-seeker.ts', 'feed-seeker-cli.ts'],
	project: ['**/*.ts', '**/*.js'],
	ignoreExportsUsedInFile: false,
};

export default config;

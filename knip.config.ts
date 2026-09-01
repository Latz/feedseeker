import type { KnipConfig } from 'knip';

const config: KnipConfig = {
	entry: ['feedseeker.ts', 'cli/index.ts'],
	project: ['**/*.ts', '**/*.js'],
	ignoreExportsUsedInFile: false,
};

export default config;

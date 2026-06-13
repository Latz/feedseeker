import { defineConfig } from 'vite';
import { resolve } from 'path';
import { readFileSync, writeFileSync, chmodSync, readdirSync, unlinkSync } from 'fs';

// Check if we're building CLI or library based on environment variable
const isCLI = process.env.BUILD_TARGET === 'cli';
const entryFile = isCLI ? 'feed-seeker-cli.ts' : 'feed-seeker.ts';
const entryName = isCLI ? 'cli' : 'index';

export default defineConfig({
	build: {
		emptyOutDir: false, // Don't clear dist folder between builds
		lib: {
			entry: resolve(__dirname, entryFile),
			name: 'FeedSeeker',
			fileName: (format) => {
				if (isCLI) {
					return `feedseeker-cli.${format === 'es' ? 'js' : 'cjs'}`;
				}
				return `feedseeker.${format === 'es' ? 'js' : 'cjs'}`;
			},
			formats: ['es', 'cjs']
		},
		rolldownOptions: {
			external: [
				'linkedom',
				'async',
				'parse5',
				'tldts',
				'truncate-url',
				'commander',
				'chalk',
				'undici',
				'node:events',
				'node:path',
				'node:fs',
				'node:process',
				'node:child_process',
				'node:util',
				'node:stream',
				'node:url',
				'fs',
				'path',
				'url'
			],
			output: {
				globals: {
					linkedom: 'linkedom',
					async: 'async',
					chalk: 'chalk',
					parse5: 'parse5',
					tldts: 'tldts',
					'truncate-url': 'truncateUrl',
					commander: 'commander'
				}
			}
		}
	},
	plugins: [
		{
			name: 'add-shebang-and-cleanup',
			closeBundle() {
				if (isCLI) {
					for (const cliFile of ['dist/feedseeker-cli.cjs', 'dist/feedseeker-cli.js']) {
						const cliPath = resolve(__dirname, cliFile);
						const content = readFileSync(cliPath, 'utf-8');
						if (!content.startsWith('#!/usr/bin/env node')) {
							writeFileSync(cliPath, '#!/usr/bin/env node\n' + content, 'utf-8');
						}
						chmodSync(cliPath, 0o755);
					}

					// Clean up package-* chunk files (only during CLI build)
					const distDir = resolve(__dirname, 'dist');
					const files = readdirSync(distDir);
					files.forEach((file) => {
						if (file.startsWith('package-') && (file.endsWith('.js') || file.endsWith('.cjs'))) {
							const filePath = resolve(distDir, file);
							console.log(`Removing unnecessary file: ${file}`);
							unlinkSync(filePath);
						}
					});
				}
			}
		}
	]
});

import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const cjsPath = resolve(__dirname, '../dist/feedseeker-cli.cjs');
const esmPath = resolve(__dirname, '../dist/feedseeker-cli.js');

describe.skipIf(!existsSync(cjsPath) || !existsSync(esmPath))(
	'built CLI entry-point guard',
	() => {
		it('runs and prints help when invoked directly as CJS', () => {
			const output = execFileSync('node', [cjsPath, '--help'], { encoding: 'utf-8' });
			expect(output).toContain('Usage: feedseeker');
		});

		it('runs and prints help when invoked directly as ESM', () => {
			const output = execFileSync('node', [esmPath, '--help'], { encoding: 'utf-8' });
			expect(output).toContain('Usage: feedseeker');
		});
	}
);

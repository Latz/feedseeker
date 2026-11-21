import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const cjsPath = resolve(__dirname, '../dist/feedseeker-cli.cjs');
const esmPath = resolve(__dirname, '../dist/feedseeker-cli.js');

describe.skipIf(!existsSync(cjsPath) || !existsSync(esmPath))('built CLI entry-point guard', () => {
	it('runs and prints help when invoked directly as CJS', () => {
		const output = execFileSync('node', [cjsPath, '--help'], { encoding: 'utf-8' });
		expect(output).toContain('Usage: feedseeker');
	});

	it('runs and prints help when invoked directly as ESM', () => {
		const output = execFileSync('node', [esmPath, '--help'], { encoding: 'utf-8' });
		expect(output).toContain('Usage: feedseeker');
	});

	// npm installs every bin (also with -g) as a symlink in node_modules/.bin,
	// so argv[1] is the symlink path, not the file's real path.
	it.each([
		['ESM', esmPath],
		['CJS', cjsPath]
	])('runs when invoked through a symlink like npm bin (%s)', (_kind, target) => {
		const link = join(mkdtempSync(join(tmpdir(), 'feedseeker-bin-')), 'feedseeker');
		symlinkSync(target, link);
		const output = execFileSync('node', [link, '--help'], { encoding: 'utf-8' });
		expect(output).toContain('Usage: feedseeker');
	});
});

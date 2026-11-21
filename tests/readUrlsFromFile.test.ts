import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readUrlsFromFile } from '../cli/readUrlsFromFile.ts';

let dir: string;
const file = async (name: string, content: string) => {
	const p = join(dir, name);
	await writeFile(p, content, 'utf-8');
	return p;
};

beforeAll(async () => {
	dir = await mkdtemp(join(tmpdir(), 'feedseeker-urls-'));
});
afterAll(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe('readUrlsFromFile', () => {
	it('returns one trimmed URL per line, skipping blank lines and comments', async () => {
		const p = await file(
			'list.txt',
			'# my sites\nexample.com\n\n   https://b.example/blog   \n\t\n  # indented comment\nc.example\n'
		);
		expect(await readUrlsFromFile(p)).toEqual([
			'example.com',
			'https://b.example/blog',
			'c.example'
		]);
	});

	it('handles Windows line endings', async () => {
		const p = await file('crlf.txt', 'a.example\r\nb.example\r\n');
		expect(await readUrlsFromFile(p)).toEqual(['a.example', 'b.example']);
	});

	it('keeps URLs that merely contain or end with #', async () => {
		const p = await file('hash.txt', 'https://a.example/#\nhttps://b.example/page#top\n');
		expect(await readUrlsFromFile(p)).toEqual([
			'https://a.example/#',
			'https://b.example/page#top'
		]);
	});

	it('reads non-ASCII (IDN) hosts as UTF-8 text', async () => {
		const p = await file('idn.txt', 'https://bücher.example\n');
		expect(await readUrlsFromFile(p)).toEqual(['https://bücher.example']);
	});

	it('returns an empty list for a file with only comments and blanks', async () => {
		const p = await file('empty.txt', '# nothing here\n\n');
		expect(await readUrlsFromFile(p)).toEqual([]);
	});

	it('rejects for a missing file', async () => {
		await expect(readUrlsFromFile(join(dir, 'missing.txt'))).rejects.toThrow(/ENOENT/);
	});
});

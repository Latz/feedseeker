import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { promisify } from 'node:util';
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

// End-to-end: the built CLI searches a real local site. The CLI runs as an async
// child process — a sync spawn would block this process's event loop, and with
// it the test server.
describe.skipIf(!existsSync(cjsPath) || !existsSync(esmPath))(
	'built CLI against a local site',
	() => {
		const run = promisify(execFile);
		let server: Server;
		let base = '';
		const feed = `<?xml version="1.0"?><rss version="2.0"><channel><title>Local Feed</title><description>d</description><item><title>i</title></item></channel></rss>`;

		beforeAll(async () => {
			server = createServer((req, res) => {
				if (req.url === '/') {
					res.writeHead(200, { 'content-type': 'text/html' });
					res.end(
						'<!DOCTYPE html><html><head><link rel="alternate" type="application/rss+xml" title="Local" href="/feed.xml"></head><body></body></html>'
					);
				} else if (req.url === '/feed.xml') {
					res.writeHead(200, { 'content-type': 'application/rss+xml' });
					res.end(feed);
				} else {
					res.writeHead(404, { 'content-type': 'text/html' });
					res.end('<html><body>not found</body></html>');
				}
			});
			await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
			base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
		});
		afterAll(async () => {
			server.closeAllConnections();
			await new Promise((resolve) => server.close(resolve));
		});

		it.each([
			['ESM', esmPath],
			['CJS', cjsPath]
		])('finds the feed and prints it as JSON (%s)', async (_kind, cli) => {
			const { stdout } = await run('node', [cli, base, '--json', '--no-tls-spoof']);
			expect(JSON.parse(stdout)).toEqual([
				{ url: `${base}/feed.xml`, title: 'Local', type: 'rss', feedTitle: 'Local Feed' }
			]);
		});

		it('prints only the feed URL with --quiet', async () => {
			const { stdout } = await run('node', [esmPath, base, '-q', '--no-tls-spoof']);
			expect(stdout).toBe(`${base}/feed.xml\n`);
		});

		it('writes OPML with --format opml', async () => {
			const { stdout } = await run('node', [esmPath, base, '--format', 'opml', '--no-tls-spoof']);
			expect(stdout).toContain(
				`<outline type="rss" text="Local Feed" title="Local Feed" xmlUrl="${base}/feed.xml"/>`
			);
		});

		it('exits with code 2 when the site has no feed', async () => {
			const empty = `${base}/nothing-here`;
			const err = await run('node', [esmPath, empty, '-q', '--metasearch', '--no-tls-spoof']).catch(
				(e) => e
			);
			expect(err.code).toBe(2);
			expect(err.stdout).toBe('');
		});
	}
);

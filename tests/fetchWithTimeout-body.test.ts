import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fetchWithTimeout, { setTlsSpoofEnabled } from '../modules/fetchWithTimeout.ts';
import checkFeed from '../modules/checkFeed/index.ts';

// Real local server: these tests are about the body stream, which mocks can't exercise.
let server: http.Server | undefined;
function serve(handler: http.RequestListener): Promise<string> {
	server = http.createServer(handler);
	return new Promise((resolve) =>
		server!.listen(0, '127.0.0.1', () =>
			resolve(`http://127.0.0.1:${(server!.address() as AddressInfo).port}`)
		)
	);
}
afterEach(() => {
	server?.closeAllConnections();
	server?.close();
});

describe('fetchWithTimeout — body reads', () => {
	it('aborts a body that keeps streaming past the timeout', async () => {
		setTlsSpoofEnabled(false);
		const base = await serve((_req, res) => {
			res.writeHead(200, { 'content-type': 'audio/mpeg' });
			const t = setInterval(() => res.write(Buffer.alloc(16 * 1024)), 50);
			res.on('close', () => clearInterval(t));
		});
		const start = Date.now();
		const response = await fetchWithTimeout(`${base}/endless.mp3`, { timeout: 500 });
		await expect(response.text()).rejects.toThrow();
		expect(Date.now() - start).toBeLessThan(3000);
	});

	it('still returns a fully read body normally', async () => {
		const base = await serve((_req, res) => res.end('hello'));
		const response = await fetchWithTimeout(base, { timeout: 500 });
		expect(await response.text()).toBe('hello');
	});

	it('checkFeed rejects an oversized response from content-length without reading it', async () => {
		let bytesSent = 0;
		const base = await serve((_req, res) => {
			res.writeHead(200, {
				'content-type': 'application/rss+xml',
				'content-length': String(50 * 1024 * 1024)
			});
			const t = setInterval(() => {
				res.write(Buffer.alloc(64 * 1024));
				bytesSent += 64 * 1024;
			}, 10);
			res.on('close', () => clearInterval(t));
		});
		await expect(
			checkFeed(`${base}/huge.xml`, '', { options: { timeout: 10 } } as never)
		).rejects.toThrow(/too large/i);
		expect(bytesSent).toBeLessThan(10 * 1024 * 1024);
	});
});

describe('checkFeed — early HTML rejection', () => {
	it('rejects an HTML page from its first bytes without downloading the rest', async () => {
		let bytesSent = 0;
		const base = await serve((_req, res) => {
			res.writeHead(200, { 'content-type': 'text/html' });
			res.write('<!DOCTYPE html><html><head><title>Home</title></head><body>');
			const t = setInterval(() => {
				res.write('<p>' + 'x'.repeat(64 * 1024) + '</p>');
				bytesSent += 64 * 1024;
			}, 20);
			res.on('close', () => clearInterval(t));
		});
		const reasons: string[] = [];
		const result = await checkFeed(
			`${base}/soft-404`,
			'',
			{ options: { timeout: 10 } } as never,
			(r) => reasons.push(r)
		);
		expect(result).toBeNull();
		expect(reasons[0]).toMatch(/HTML/);
		expect(bytesSent).toBeLessThan(4 * 1024 * 1024); // drained up to the 1MB cap, then cancelled
	});

	it('still accepts a real feed served over the wire', async () => {
		const rss =
			'\uFEFF<?xml version="1.0"?>\n<rss version="2.0"><channel><title>T</title><description>D</description>' +
			'<item><title>I</title></item></channel></rss>';
		const base = await serve((_req, res) => {
			res.writeHead(200, { 'content-type': 'application/rss+xml' });
			res.end(rss);
		});
		const result = await checkFeed(`${base}/feed`, '', { options: { timeout: 10 } } as never);
		expect(result?.type).toBe('rss');
		expect(result?.title).toBe('T');
	});
});

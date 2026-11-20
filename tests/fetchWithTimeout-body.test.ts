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
			res.writeHead(200, { 'content-type': 'application/rss+xml', 'content-length': String(50 * 1024 * 1024) });
			const t = setInterval(() => {
				res.write(Buffer.alloc(64 * 1024));
				bytesSent += 64 * 1024;
			}, 10);
			res.on('close', () => clearInterval(t));
		});
		await expect(checkFeed(`${base}/huge.xml`, '', { options: { timeout: 10 } } as never)).rejects.toThrow(
			/too large/i
		);
		expect(bytesSent).toBeLessThan(10 * 1024 * 1024);
	});
});

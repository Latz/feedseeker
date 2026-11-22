/**
 * Integration tests against a real local HTTP server: no mocks on the network
 * path, so undici, redirects, compression, keep-alive and timeouts are real.
 *
 * Every test talks to its own loopback address (127.0.0.N, all served by the
 * same server), because hostRateLimiter keeps per-hostname state such as 429
 * cooldowns and rate-limit waits that must not leak between tests.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'node:http';
import { gzipSync } from 'node:zlib';
import fetchWithTimeout, { setTlsSpoofEnabled } from '../modules/fetchWithTimeout.ts';
import checkFeed, { ChallengeResponseError } from '../modules/checkFeed/index.ts';
import FeedSeeker from '../feedseeker.ts';

type Handler = (req: IncomingMessage, res: ServerResponse) => void;

let server: Server;
let port: number;
let routes: Record<string, Handler> = {};
let connections = 0;
let hostIndex = 1;
/** Base URL on a loopback address no other test has used. */
let base = '';

const rss = (title: string) =>
	`<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title><description>d</description><item><title>i</title></item></channel></rss>`;
const send =
	(body: string, type = 'text/html', status = 200, headers: Record<string, string> = {}): Handler =>
	(_req, res) => {
		res.writeHead(status, { 'content-type': type, ...headers });
		res.end(body);
	};
const redirect =
	(to: string, status = 301): Handler =>
	(_req, res) => {
		res.writeHead(status, { location: to });
		res.end();
	};

beforeAll(async () => {
	setTlsSpoofEnabled(false); // the spoofing client would hit this server as a second client
	server = createServer((req, res) => {
		const handler = routes[new URL(req.url ?? '/', 'http://x').pathname];
		if (handler) handler(req, res);
		else {
			res.writeHead(404, { 'content-type': 'text/html' });
			res.end('<html><body>not found</body></html>');
		}
	});
	server.on('connection', () => connections++);
	await new Promise<void>((resolve) => server.listen(0, resolve));
	port = (server.address() as { port: number }).port;
});

afterAll(async () => {
	setTlsSpoofEnabled(true);
	server.closeAllConnections();
	await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
	routes = {};
	base = `http://127.0.0.${++hostIndex}:${port}`;
});

describe('fetchWithTimeout over real HTTP', () => {
	it('follows redirects and reports the final URL', async () => {
		routes['/old'] = redirect('/new');
		routes['/new'] = send('arrived');
		const res = await fetchWithTimeout(`${base}/old`, { timeout: 2000 });
		expect(res.url).toBe(`${base}/new`);
		expect(await res.text()).toBe('arrived');
	});

	it('decodes a gzip-compressed body', async () => {
		routes['/gz'] = (_req, res) => {
			res.writeHead(200, { 'content-type': 'text/xml', 'content-encoding': 'gzip' });
			res.end(gzipSync(rss('Zipped')));
		};
		const res = await fetchWithTimeout(`${base}/gz`, { timeout: 2000 });
		expect(await res.text()).toBe(rss('Zipped'));
	});

	it('times out a server that never answers', async () => {
		routes['/hang'] = () => {}; // never responds
		await expect(fetchWithTimeout(`${base}/hang`, { timeout: 200 })).rejects.toThrow(
			`Request to ${base}/hang timed out after 200ms`
		);
	});

	it('also times out a body that stalls after the headers', async () => {
		routes['/stall'] = (_req, res) => {
			res.writeHead(200, { 'content-type': 'text/html' });
			res.write('<html>partial'); // ...and never ends
		};
		const res = await fetchWithTimeout(`${base}/stall`, { timeout: 300 });
		await expect(res.text()).rejects.toThrow();
	});

	it('retries a 429 and returns the later success', async () => {
		let hits = 0;
		routes['/busy'] = (_req, res) => {
			hits++;
			res.writeHead(hits === 1 ? 429 : 200);
			res.end(hits === 1 ? 'slow down' : 'ok');
		};
		const res = await fetchWithTimeout(`${base}/busy`, { timeout: 2000 });
		expect(res.status).toBe(200);
		expect(hits).toBe(2);
	});

	it('waits out an exhausted rate limit before the next request to the host', async () => {
		routes['/limited'] = send('ok', 'text/plain', 200, {
			'x-ratelimit-remaining': '0',
			'x-ratelimit-reset': '1'
		});
		await (await fetchWithTimeout(`${base}/limited`, { timeout: 2000 })).text();
		const started = Date.now();
		await (await fetchWithTimeout(`${base}/limited`, { timeout: 2000 })).text();
		expect(Date.now() - started).toBeGreaterThanOrEqual(900);
	});
});

describe('checkFeed over real HTTP', () => {
	const instance = { options: { timeout: 2 } };

	it('recognizes a served feed and reports where a redirect landed', async () => {
		routes['/rss'] = redirect('/rss/');
		routes['/rss/'] = send(rss('Redirected'), 'application/rss+xml');
		expect(await checkFeed(`${base}/rss`, '', instance)).toEqual({
			type: 'rss',
			title: 'Redirected',
			resolvedUrl: `${base}/rss/`
		});
	});

	it('rejects a large HTML page but keeps the connection reusable', async () => {
		routes['/page'] = send(`<!DOCTYPE html><html><body>${'x'.repeat(200_000)}</body></html>`);
		routes['/feed'] = send(rss('After'), 'application/rss+xml');
		const before = connections;
		expect(await checkFeed(`${base}/page`, '', instance)).toBeNull();
		// undici hands the socket back to its pool asynchronously, even for plain fetch()
		await new Promise((resolve) => setTimeout(resolve, 20));
		expect(await checkFeed(`${base}/feed`, '', instance)).toMatchObject({ title: 'After' });
		expect(connections - before).toBe(1);
	});

	it('refuses an announced oversized body without downloading it', async () => {
		routes['/huge'] = (_req, res) => {
			res.writeHead(200, { 'content-length': String(11 * 1024 * 1024) });
			res.write('x'); // the rest never comes
		};
		await expect(checkFeed(`${base}/huge`, '', instance)).rejects.toThrow('Content too large');
	});

	it('raises ChallengeResponseError for a Cloudflare challenge', async () => {
		routes['/cf'] = send('<html>Just a moment...</html>', 'text/html', 403, {
			'cf-mitigated': 'challenge'
		});
		await expect(checkFeed(`${base}/cf`, '', instance)).rejects.toBeInstanceOf(
			ChallengeResponseError
		);
	});
});

describe('FeedSeeker end to end over real HTTP', () => {
	const page = (head: string, body = '') =>
		`<!DOCTYPE html><html><head>${head}</head><body>${body}</body></html>`;

	it('finds a feed announced in the page head', async () => {
		routes['/'] = send(
			page('<link rel="alternate" type="application/rss+xml" title="Blog" href="/feed.xml">')
		);
		routes['/feed.xml'] = send(rss('My Blog'), 'application/rss+xml');
		expect(await new FeedSeeker(base, { timeout: 2 }).startSearch()).toEqual([
			{ url: `${base}/feed.xml`, title: 'Blog', type: 'rss', feedTitle: 'My Blog' }
		]);
	});

	it('resolves relative feed links against the page a redirect landed on', async () => {
		routes['/'] = redirect('/blog/', 302);
		routes['/blog/'] = send(
			page('<link rel="alternate" type="application/rss+xml" href="feed.xml">')
		);
		routes['/blog/feed.xml'] = send(rss('Moved Blog'), 'application/rss+xml');
		const feeds = await new FeedSeeker(base, { timeout: 2 }).startSearch();
		expect(feeds.map((f) => f.url)).toEqual([`${base}/blog/feed.xml`]);
	});

	it('returns the site itself when it is a feed', async () => {
		routes['/'] = send(rss('Self'), 'application/rss+xml');
		expect(await new FeedSeeker(base, { timeout: 2 }).startSearch()).toEqual([
			{ url: base, title: null, type: 'rss', feedTitle: 'Self' }
		]);
	});

	it('finds an unlinked feed by blind search', async () => {
		routes['/'] = send(page('<title>No links here</title>'));
		routes['/feed'] = send(rss('Hidden'), 'application/rss+xml');
		const feeds = await new FeedSeeker(base, { timeout: 2, searchMode: 'fast' }).startSearch();
		expect(feeds.map((f) => [f.url, f.feedTitle])).toEqual([[`${base}/feed`, 'Hidden']]);
	});

	it('finds a feed only reachable through robots.txt and the sitemap', async () => {
		routes['/'] = send(page('<title>Home</title>'));
		routes['/robots.txt'] = send(`User-agent: *\nSitemap: ${base}/map.xml`, 'text/plain');
		routes['/map.xml'] = send(`<urlset><url><loc>${base}/podcast</loc></url></urlset>`, 'text/xml');
		routes['/podcast'] = send(rss('Podcast'), 'application/rss+xml');
		const feeds = await new FeedSeeker(base, {
			timeout: 2,
			deepsearchOnly: true,
			depth: 1
		}).startSearch();
		expect(feeds.map((f) => [f.url, f.feedTitle])).toEqual([[`${base}/podcast`, 'Podcast']]);
	});
});

describe('misbehaving servers', () => {
	const instance = { options: { timeout: 2 } };
	const page = (head: string) => `<!DOCTYPE html><html><head>${head}</head><body></body></html>`;
	const links = (...hrefs: string[]) =>
		page(
			hrefs.map((h) => `<link rel="alternate" type="application/rss+xml" href="${h}">`).join('')
		);
	const cutOff: Handler = (_req, res) => {
		res.writeHead(200, { 'content-type': 'application/rss+xml' });
		res.write(rss('Cut').slice(0, 60));
		setTimeout(() => res.destroy(), 20);
	};
	const badGzip: Handler = (_req, res) => {
		res.writeHead(200, { 'content-type': 'application/rss+xml', 'content-encoding': 'gzip' });
		res.end(rss('Not zipped'));
	};

	it.each([
		['a connection that drops mid-body', cutOff],
		['an invalid gzip body', badGzip]
	])('fails the check for %s, and discovery skips that feed', async (_name, handler) => {
		routes['/broken'] = handler;
		await expect(checkFeed(`${base}/broken`, '', instance)).rejects.toThrow('terminated');
		routes['/'] = send(links('/broken', '/ok'));
		routes['/ok'] = send(rss('Fine'), 'application/rss+xml');
		const feeds = await new FeedSeeker(base, { timeout: 2 }).startSearch();
		expect(feeds.map((f) => f.url)).toEqual([`${base}/ok`]);
	});

	it('gives up on a redirect loop quickly', async () => {
		routes['/a'] = redirect('/b');
		routes['/b'] = redirect('/a');
		const started = Date.now();
		await expect(checkFeed(`${base}/a`, '', instance)).rejects.toThrow('fetch failed');
		expect(Date.now() - started).toBeLessThan(1000);
	});

	it('times out a body shorter than its Content-Length', async () => {
		routes['/short'] = (_req, res) => {
			res.writeHead(200, { 'content-type': 'application/rss+xml', 'content-length': '5000' });
			res.end(rss('Short'));
		};
		await expect(checkFeed(`${base}/short`, '', { options: { timeout: 0.5 } })).rejects.toThrow();
	});

	it('reads only the announced bytes of a longer body, and the next request still works', async () => {
		routes['/long'] = (_req, res) => {
			res.writeHead(200, { 'content-type': 'application/rss+xml', 'content-length': '10' });
			res.end(rss('Long'));
		};
		routes['/next'] = send(rss('Next'), 'application/rss+xml');
		expect(await checkFeed(`${base}/long`, '', instance)).toBeNull();
		expect(await checkFeed(`${base}/next`, '', instance)).toMatchObject({ title: 'Next' });
	});

	it('rejects the search when the site itself breaks off', async () => {
		routes['/'] = cutOff;
		await expect(new FeedSeeker(base, { timeout: 2 }).startSearch()).rejects.toThrow(
			`Failed to fetch ${base}: terminated`
		);
	});
});

describe('character sets', () => {
	const instance = { options: { timeout: 2 } };
	const latin1 = (s: string) => Buffer.from(s, 'latin1');
	const declared = (encoding: string) =>
		rss('Café Müller').replace(
			'<?xml version="1.0"?>',
			`<?xml version="1.0" encoding="${encoding}"?>`
		);
	const serve =
		(body: Buffer, type: string): Handler =>
		(_req, res) => {
			res.writeHead(200, { 'content-type': type });
			res.end(body);
		};

	it.each([
		[
			'ISO-8859-1 named in the Content-Type',
			latin1(rss('Café Müller')),
			'text/xml; charset=iso-8859-1'
		],
		['ISO-8859-1 named in the XML declaration', latin1(declared('ISO-8859-1')), 'text/xml'],
		[
			'an unknown header charset, then the declaration',
			latin1(declared('ISO-8859-1')),
			'text/xml; charset=foo'
		],
		[
			'the header over the declaration',
			Buffer.from(declared('ISO-8859-1')),
			'text/xml; charset=utf-8'
		],
		['UTF-8 without any declaration', Buffer.from(rss('Café Müller')), 'text/xml'],
		['a UTF-8 byte order mark', Buffer.from('﻿' + rss('Café Müller')), 'text/xml'],
		[
			'UTF-16 with a byte order mark',
			Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(rss('Café Müller'), 'utf16le')]),
			'text/xml; charset=utf-16'
		]
	])('decodes a feed in %s', async (_name, body, type) => {
		routes['/feed'] = serve(body, type);
		expect(await checkFeed(`${base}/feed`, '', instance)).toMatchObject({ title: 'Café Müller' });
	});

	it('decodes an HTML page by its <meta charset>', async () => {
		routes['/'] = serve(
			latin1(
				'<!DOCTYPE html><html><head><meta charset="iso-8859-1">' +
					'<link rel="alternate" type="application/rss+xml" title="Grüße" href="/feed"></head></html>'
			),
			'text/html'
		);
		routes['/feed'] = serve(latin1(declared('ISO-8859-1')), 'text/xml');
		expect(await new FeedSeeker(base, { timeout: 2 }).startSearch()).toEqual([
			{ url: `${base}/feed`, title: 'Grüße', type: 'rss', feedTitle: 'Café Müller' }
		]);
	});
});

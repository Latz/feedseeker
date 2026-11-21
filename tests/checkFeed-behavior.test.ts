/* global ResponseInit, TextEncoder, ReadableStream */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('../modules/fetchWithTimeout.ts', () => ({ default: vi.fn() }));

import fetchWithTimeout from '../modules/fetchWithTimeout.ts';
import checkFeed, { ChallengeResponseError, takeCachedFeedContent } from '../modules/checkFeed/index.ts';
import { VALIDATION_LIMITS } from '../modules/checkFeed/validation.ts';

const mockFetch = fetchWithTimeout as unknown as Mock;
const instance = { options: { timeout: 5 } } as any;
const URL_ = 'https://a.example/feed';
const MB = 1024 * 1024;

const rss = (title = 'T', pad = '') =>
	`<?xml version="1.0"?><rss version="2.0"><channel><title>${title}</title><description>d</description><item></item></channel>${pad}</rss>`;
const html = (size: number) => {
	const head = '<!doctype html><html><head><title>x</title></head><body>';
	return head + 'x'.repeat(Math.max(0, size - head.length));
};

/**
 * Response whose body is delivered chunk by chunk, only when read
 * (highWaterMark 0), recording how many chunks were pulled and whether
 * the reader cancelled the stream.
 */
function streamed(chunks: Array<string | Uint8Array>, init: ResponseInit = {}) {
	const enc = new TextEncoder();
	const stats = { pulled: 0, cancelled: false };
	let i = 0;
	const body = new ReadableStream<Uint8Array>(
		{
			pull(controller) {
				if (i < chunks.length) {
					const c = chunks[i++];
					stats.pulled++;
					controller.enqueue(typeof c === 'string' ? enc.encode(c) : c);
				} else {
					controller.close();
				}
			},
			cancel() {
				stats.cancelled = true;
			}
		},
		{ highWaterMark: 0 }
	);
	return { res: new Response(body, { status: 200, ...init }), stats };
}

beforeEach(() => mockFetch.mockReset());

describe('checkFeed — oEmbed URLs', () => {
	it('rejects oEmbed endpoints without fetching', async () => {
		const onReject = vi.fn();
		expect(await checkFeed('https://a.example/wp-json/oembed/1.0/embed', '', instance, onReject)).toBeNull();
		expect(mockFetch).not.toHaveBeenCalled();
		expect(onReject).toHaveBeenCalledWith('URL matches a WordPress oEmbed endpoint pattern, not a feed');
	});
});

describe('checkFeed — HTTP errors', () => {
	it('throws ChallengeResponseError for a bot-mitigation challenge', async () => {
		mockFetch.mockResolvedValue(new Response('', { status: 403, headers: { 'cf-mitigated': 'challenge' } }));
		const err = await checkFeed(URL_, '', instance).catch((e: Error) => e);
		expect(err).toBeInstanceOf(ChallengeResponseError);
		expect((err as Error).name).toBe('ChallengeResponseError');
		expect((err as Error).message).toBe(`Fetch of ${URL_} was blocked by a bot-mitigation challenge`);
	});

	it('throws a plain error for other failures', async () => {
		mockFetch.mockResolvedValue(new Response('', { status: 404, statusText: 'Not Found' }));
		const err = await checkFeed(URL_, '', instance).catch((e: Error) => e);
		expect(err).not.toBeInstanceOf(ChallengeResponseError);
		expect((err as Error).message).toBe(`Failed to fetch ${URL_}: 404 Not Found`);
	});
});

describe('checkFeed — announced content length', () => {
	it('rejects an oversized Content-Length without reading the body', async () => {
		const { res, stats } = streamed([rss()], { headers: { 'content-length': String(VALIDATION_LIMITS.MAX_CONTENT_SIZE + 1) } });
		mockFetch.mockResolvedValue(res);
		await expect(checkFeed(URL_, '', instance)).rejects.toThrow(
			`Content too large: ${VALIDATION_LIMITS.MAX_CONTENT_SIZE + 1} bytes.`
		);
		expect(stats.pulled).toBe(0);
		expect(stats.cancelled).toBe(true);
	});

	it('accepts a Content-Length of exactly the limit', async () => {
		const { res } = streamed([rss()], { headers: { 'content-length': String(VALIDATION_LIMITS.MAX_CONTENT_SIZE) } });
		mockFetch.mockResolvedValue(res);
		expect(await checkFeed(URL_, '', instance)).toEqual({ type: 'rss', title: 'T' });
	});

	it('handles an oversized Content-Length on a response without a body', async () => {
		mockFetch.mockResolvedValue(
			new Response(null, { status: 200, headers: { 'content-length': String(VALIDATION_LIMITS.MAX_CONTENT_SIZE + 1) } })
		);
		await expect(checkFeed(URL_, '', instance)).rejects.toThrow('Content too large');
	});
});

describe('checkFeed — streamed body', () => {
	it('stops reading an unannounced oversized body just past the limit', async () => {
		const chunk = new Uint8Array(MB).fill(32);
		const { res, stats } = streamed(Array.from({ length: 15 }, () => chunk));
		mockFetch.mockResolvedValue(res);
		await expect(checkFeed(URL_, '', instance)).rejects.toThrow('Content too large');
		expect(stats.pulled).toBe(VALIDATION_LIMITS.MAX_CONTENT_SIZE / MB + 1);
	});

	it('assembles a feed from several chunks', async () => {
		const feed = rss('Split Title');
		const { res } = streamed([feed.slice(0, 40), feed.slice(40, 80), feed.slice(80)]);
		mockFetch.mockResolvedValue(res);
		expect(await checkFeed(URL_, '', instance)).toEqual({ type: 'rss', title: 'Split Title' });
	});

	it('decodes a multi-byte character split across chunks', async () => {
		const bytes = new TextEncoder().encode(rss('Café'));
		const split = bytes.indexOf(0xc3) + 1; // between the two bytes of "é"
		const { res } = streamed([bytes.slice(0, split), bytes.slice(split)]);
		mockFetch.mockResolvedValue(res);
		expect((await checkFeed(URL_, '', instance))?.title).toBe('Café');
	});

	it('accepts a feed larger than the sniff window', async () => {
		const feed = rss('Big', ' '.repeat(5000));
		const { res } = streamed([feed.slice(0, 3000), feed.slice(3000)]);
		mockFetch.mockResolvedValue(res);
		expect(await checkFeed(URL_, '', instance)).toEqual({ type: 'rss', title: 'Big' });
	});
});

describe('checkFeed — early HTML rejection', () => {
	it('rejects a small HTML page with the HTML reason', async () => {
		const onReject = vi.fn();
		mockFetch.mockResolvedValue(streamed([html(500)]).res);
		expect(await checkFeed(URL_, '', instance, onReject)).toBeNull();
		expect(onReject).toHaveBeenCalledWith('content is an HTML page, not a feed');
	});

	it('recognizes HTML even when it arrives in tiny chunks', async () => {
		const onReject = vi.fn();
		const page = html(3000);
		const chunks = page.match(/[\s\S]{1,10}/g)!;
		mockFetch.mockResolvedValue(streamed(chunks).res);
		expect(await checkFeed(URL_, '', instance, onReject)).toBeNull();
		expect(onReject).toHaveBeenCalledWith('content is an HTML page, not a feed');
	});

	it('drains the rest of a normal-sized HTML page to keep the connection reusable', async () => {
		const { res, stats } = streamed([html(3000), 'x'.repeat(1000), 'x'.repeat(1000), 'x'.repeat(1000)]);
		mockFetch.mockResolvedValue(res);
		expect(await checkFeed(URL_, '', instance)).toBeNull();
		expect(stats.pulled).toBe(4);
		expect(stats.cancelled).toBe(false);
	});

	it('cancels an HTML page once more than 1 MB has been read', async () => {
		// total reaches exactly 1 MB after chunk 2 (still drained), exceeds it with chunk 3
		const first = html(2048);
		const { res, stats } = streamed([first, 'x'.repeat(MB - first.length), 'x'.repeat(10), 'x'.repeat(10)]);
		mockFetch.mockResolvedValue(res);
		expect(await checkFeed(URL_, '', instance)).toBeNull();
		expect(stats.pulled).toBe(3);
		expect(stats.cancelled).toBe(true);
	});

	it.each([
		['leading blank lines', '\n\n  <!DOCTYPE html>\n<html><body>x</body></html>'],
		['bare <html> tag', '<html lang="de"><body>x</body></html>'],
		['XHTML with XML declaration', '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n<html><body>x</body></html>'],
		['declaration followed by blank lines', '<?xml version="1.0"?>\n\n<html><body>x</body></html>'],
		['declaration directly followed by the doctype', '<?xml version="1.0"?><!DOCTYPE html><html></html>'],
		['several comments before the doctype', '<!-- generated by X -->\n<!-- cache: hit -->\n<!DOCTYPE html><html></html>'],
		['blank lines after a comment and a spaced doctype', '<!-- x -->\n\n<!DOCTYPE  html>\n<html></html>']
	])('recognizes an HTML page starting with %s', async (_name, page) => {
		const onReject = vi.fn();
		mockFetch.mockResolvedValue(streamed([page]).res);
		expect(await checkFeed(URL_, '', instance, onReject)).toBeNull();
		expect(onReject).toHaveBeenCalledWith('content is an HTML page, not a feed');
	});

	it('does not mistake a feed with embedded HTML for an HTML page', async () => {
		const feed = rss('Embedded').replace(
			'<item></item>',
			'<item><description><![CDATA[\n<html><body>post</body></html>]]></description></item>'
		);
		mockFetch.mockResolvedValue(streamed([feed]).res);
		expect(await checkFeed(URL_, '', instance)).toEqual({ type: 'rss', title: 'Embedded' });
	});

	it('works without onReject', async () => {
		mockFetch.mockResolvedValue(streamed([html(500)]).res);
		await expect(checkFeed(URL_, '', instance)).resolves.toBeNull();
	});
});

describe('checkFeed — result details', () => {
	it('reports where a redirected request landed', async () => {
		const res = new Response(rss(), { status: 200 });
		Object.defineProperty(res, 'url', { value: 'https://a.example/feed/' });
		mockFetch.mockResolvedValue(res);
		expect(await checkFeed(URL_, '', instance)).toEqual({ type: 'rss', title: 'T', resolvedUrl: 'https://a.example/feed/' });
	});

	it('omits resolvedUrl when the response has no URL', async () => {
		mockFetch.mockResolvedValue(new Response(rss(), { status: 200 }));
		expect(await checkFeed(URL_, '', instance)).toEqual({ type: 'rss', title: 'T' });
	});

	it('uses a generic reason for unrecognized content', async () => {
		const onReject = vi.fn();
		expect(await checkFeed(URL_, 'just text', undefined, onReject)).toBeNull();
		expect(onReject).toHaveBeenCalledWith('content is not a recognized RSS, Atom, or JSON feed format');
	});
});

describe('checkFeed — feed content cache', () => {
	const u = (i: number) => `https://cache.example/${i}`;

	it('hands out a recognized feed once', async () => {
		await checkFeed(u(0), rss('Cached'));
		expect(takeCachedFeedContent(u(0))).toBe(rss('Cached'));
		expect(takeCachedFeedContent(u(0))).toBeUndefined();
	});

	it('does not cache non-feeds', async () => {
		await checkFeed(u(1), 'not a feed');
		expect(takeCachedFeedContent(u(1))).toBeUndefined();
	});

	it('caches feeds up to exactly 2 MB, not larger', async () => {
		const base = rss();
		const exact = rss('T', ' '.repeat(2 * MB - base.length));
		const over = rss('T', ' '.repeat(2 * MB - base.length + 1));
		await checkFeed(u(2), exact);
		await checkFeed(u(3), over);
		expect(takeCachedFeedContent(u(2))?.length).toBe(2 * MB);
		expect(takeCachedFeedContent(u(3))).toBeUndefined();
	});

	it('keeps the 20 most recently recognized feeds', async () => {
		for (let i = 100; i < 120; i++) await checkFeed(u(i), rss(String(i)));
		await checkFeed(u(100), rss('100')); // refresh: now the newest
		await checkFeed(u(120), rss('120')); // 21st entry evicts the oldest, 101
		expect(takeCachedFeedContent(u(101))).toBeUndefined();
		expect(takeCachedFeedContent(u(100))).toBe(rss('100'));
		expect(takeCachedFeedContent(u(102))).toBe(rss('102'));
		expect(takeCachedFeedContent(u(120))).toBe(rss('120'));
	});
});

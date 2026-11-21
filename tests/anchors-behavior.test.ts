import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { parseHTML } from 'linkedom';

vi.mock('../modules/checkFeed/index.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/fetchWithTimeout.ts', () => ({ default: vi.fn() }));

import checkFeed from '../modules/checkFeed/index.ts';
import fetchWithTimeout from '../modules/fetchWithTimeout.ts';
import checkAllAnchors from '../modules/anchors/index.ts';
import { isAllowedDomain } from '../modules/anchors/domainFilter.ts';
import { parseUrlSafely, isValidHttpUrl, isRelativePath } from '../modules/anchors/urlUtils.ts';

const mockCheckFeed = checkFeed as unknown as Mock;
const mockFetch = fetchWithTimeout as unknown as Mock;
const SITE = 'https://example.com';

type Event = { event: string; data: any };
function makeInstance(body: string, options: Record<string, unknown> = {}, head = '') {
	const events: Event[] = [];
	const { document } = parseHTML(`<html><head>${head}</head><body>${body}</body></html>`);
	const instance = {
		site: SITE,
		document,
		options,
		emit: (event: string, data: unknown) => events.push({ event, data })
	};
	return { instance: instance as any, events };
}
const checked = () => mockCheckFeed.mock.calls.map((c) => c[0] as string);
const feedAt = (...urls: string[]) =>
	mockCheckFeed.mockImplementation(async (url: string) =>
		urls.includes(url) ? { type: 'rss', title: 'T' } : null
	);

beforeEach(() => {
	mockCheckFeed.mockReset();
	mockCheckFeed.mockResolvedValue(null);
	mockFetch.mockReset();
});

describe('urlUtils', () => {
	it('parseUrlSafely parses absolute URLs, resolves against a base, and returns null otherwise', () => {
		expect(parseUrlSafely('https://a.example/x')?.href).toBe('https://a.example/x');
		expect(parseUrlSafely('/feed', SITE)?.href).toBe(`${SITE}/feed`);
		expect(parseUrlSafely('/feed')).toBeNull();
	});

	it.each([
		['http://a.example', true],
		['https://a.example', true],
		['ftp://a.example', false],
		['mailto:me@a.example', false],
		['/relative', false]
	])('isValidHttpUrl(%s) = %s', (url, expected) => {
		expect(isValidHttpUrl(url)).toBe(expected);
	});

	it.each([
		['/feed', true],
		['feed.xml', true],
		['../rss', true],
		['https://a.example', false],
		['mailto:me@a.example', false],
		['broken://', false]
	])('isRelativePath(%s) = %s', (url, expected) => {
		expect(isRelativePath(url)).toBe(expected);
	});
});

describe('isAllowedDomain', () => {
	const base = new URL(SITE);
	it.each([
		[`${SITE}/feed`, true],
		['/relative', true],
		['https://feeds.feedburner.com/x', true],
		['https://deep.sub.feedburner.com/x', true],
		['https://feedproxy.google.com/x', true],
		['https://other.example/feed', false],
		['https://notfeedburner.com/x', false],
		['https://feedburner.com.evil.example/x', false],
		['https://sub.example.com/feed', false]
	])('%s → %s', (url, expected) => {
		expect(isAllowedDomain(url, base)).toBe(expected);
	});
});

describe('checkAllAnchors — which links are checked', () => {
	it('checks same-site absolute and relative links, skipping foreign, non-HTTP and binary links', async () => {
		const { instance } = makeInstance(
			'<a href="https://example.com/a">a</a><a href="/b">b</a><a href="c.xml">c</a>' +
				'<a href="https://other.example/x">x</a><a href="mailto:me@example.com">m</a>' +
				'<a href="javascript:void(0)">j</a><a href="/img.png">i</a><a name="anchor-only">n</a><a href="">e</a>'
		);
		await checkAllAnchors(instance);
		expect(checked()).toEqual([`${SITE}/a`, `${SITE}/b`, `${SITE}/c.xml`]);
		expect(mockCheckFeed.mock.calls[0].slice(1)).toEqual(['', instance]);
	});

	it('reports a relative link that cannot be resolved', async () => {
		const { instance, events } = makeInstance('<a href="//[bad">x</a>');
		await checkAllAnchors(instance);
		const errors = events.filter((e) => e.event === 'error').map((e) => e.data);
		expect(errors).toHaveLength(1);
		expect(errors[0].module).toBe('anchors');
		// linkedom percent-encodes the href; it still cannot be resolved
		expect(errors[0].error).toBe('Invalid relative URL: //%5Bbad');
		expect(errors[0].explanation).toContain('could not be resolved');
		expect(errors[0].suggestion).toContain('relative path format');
		expect(checked()).toEqual([]);
	});

	it('uses the trimmed link text as title, or null when empty', async () => {
		feedAt(`${SITE}/a`, `${SITE}/b`);
		const { instance } = makeInstance('<a href="/a">  My Feed \n</a><a href="/b">  </a>');
		const feeds = await checkAllAnchors(instance);
		expect(feeds).toEqual([
			{ url: `${SITE}/a`, title: 'My Feed', type: 'rss', feedTitle: 'T' },
			{ url: `${SITE}/b`, title: null, type: 'rss', feedTitle: 'T' }
		]);
	});
});

describe('checkAllAnchors — URLs in page text', () => {
	it('finds http and https URLs and strips trailing punctuation', async () => {
		const { instance } = makeInstance(
			'<p>Feed: https://example.com/feed.xml. Old: http://example.com/rss!? Also https://example.com/atom,;</p>'
		);
		await checkAllAnchors(instance);
		expect(checked()).toEqual([`${SITE}/feed.xml`, 'http://example.com/rss', `${SITE}/atom`]);
	});

	it('skips text URLs already checked as anchors or differing only by #fragment', async () => {
		const { instance } = makeInstance(
			'<a href="/feed">f</a><p>https://example.com/feed https://example.com/x#a https://example.com/x#b</p>'
		);
		await checkAllAnchors(instance);
		expect(checked()).toEqual([`${SITE}/feed`, `${SITE}/x#a`]);
	});

	it('records text feeds with a null title', async () => {
		feedAt(`${SITE}/feed`);
		const { instance } = makeInstance('<p>https://example.com/feed</p>');
		expect(await checkAllAnchors(instance)).toEqual([
			{ url: `${SITE}/feed`, title: null, type: 'rss', feedTitle: 'T' }
		]);
		expect(mockCheckFeed.mock.calls[0].slice(1)).toEqual(['', instance]);
	});

	it('does not start the text phase once maxFeeds is reached by anchors', async () => {
		feedAt(`${SITE}/a`);
		const { instance, events } = makeInstance('<a href="/a">a</a><p>https://example.com/t</p>', {
			maxFeeds: 1
		});
		await checkAllAnchors(instance);
		expect(checked()).toEqual([`${SITE}/a`]);
		expect(events.some((e) => e.data?.message?.includes('maximum feeds limit'))).toBe(false);
	});

	it('continues into the text phase while below maxFeeds', async () => {
		feedAt(`${SITE}/a`);
		const { instance } = makeInstance('<a href="/a">a</a><p>https://example.com/t</p>', {
			maxFeeds: 2
		});
		await checkAllAnchors(instance);
		expect(checked()).toEqual([`${SITE}/a`, `${SITE}/t`]);
	});
});

describe('checkAllAnchors — events', () => {
	it('emits start, numbered progress across both phases, and end', async () => {
		const { instance, events } = makeInstance(
			'<a href="/a">a</a><a href="/b">b</a><p>https://example.com/t1 https://example.com/t2</p>',
			{ concurrency: 1 }
		);
		const feeds = await checkAllAnchors(instance);
		expect(events[0]).toEqual({
			event: 'start',
			data: { module: 'anchors', niceName: 'Check All Anchors' }
		});
		expect(events.filter((e) => e.event === 'log').map((e) => e.data)).toEqual([
			{ module: 'anchors', totalCount: 1, totalEndpoints: 2 },
			{ module: 'anchors', totalCount: 2, totalEndpoints: 2 },
			{ module: 'anchors', totalCount: 3, totalEndpoints: 4 },
			{ module: 'anchors', totalCount: 4, totalEndpoints: 4 }
		]);
		expect(events.at(-1)).toEqual({ event: 'end', data: { module: 'anchors', feeds } });
	});

	it('logs the feed limit with the module name', async () => {
		feedAt(`${SITE}/a`);
		const { instance, events } = makeInstance('<a href="/a">a</a><a href="/b">b</a>', {
			maxFeeds: 1,
			concurrency: 1
		});
		await checkAllAnchors(instance);
		expect(events.filter((e) => e.data?.message).map((e) => e.data)).toEqual([
			{
				module: 'anchors',
				message: 'Stopped due to reaching maximum feeds limit: 1 feeds found (max 1 allowed).'
			}
		]);
	});
});

describe('checkAllAnchors — no feeds', () => {
	it('reports no errors when links simply are not feeds', async () => {
		const { instance, events } = makeInstance('<a href="/a">a</a><p>https://example.com/t</p>', {
			showErrors: true
		});
		expect(await checkAllAnchors(instance)).toEqual([]);
		expect(events.some((e) => e.event === 'error')).toBe(false);
	});
});

describe('checkAllAnchors — check errors', () => {
	beforeEach(() => {
		mockCheckFeed.mockRejectedValue(new Error('boom'));
	});

	it('reports anchor and text check errors with showErrors', async () => {
		const { instance, events } = makeInstance('<a href="/a">a</a><p>https://example.com/t</p>', {
			showErrors: true
		});
		await checkAllAnchors(instance);
		const errors = events.filter((e) => e.event === 'error').map((e) => e.data);
		expect(errors.map((e) => e.error)).toEqual([
			`Error checking feed at ${SITE}/a: boom`,
			`Error checking feed at ${SITE}/t: boom`
		]);
		expect(errors.every((e) => e.module === 'anchors')).toBe(true);
		expect(errors[0].explanation).toContain('anchor tag');
		expect(errors[1].explanation).toContain('page text');
		expect(errors[0].suggestion).toContain('Check if the URL is accessible');
		expect(errors[1].suggestion).toContain('Check if the URL is accessible');
	});

	it('stays silent without showErrors and keeps going', async () => {
		const { instance, events } = makeInstance('<a href="/a">a</a><p>https://example.com/t</p>');
		expect(await checkAllAnchors(instance)).toEqual([]);
		expect(events.some((e) => e.event === 'error')).toBe(false);
		expect(checked()).toEqual([`${SITE}/a`, `${SITE}/t`]);
	});
});

describe('checkAllAnchors — meta refresh', () => {
	const target = (html: string, ok = true) =>
		mockFetch.mockResolvedValue({ ok, text: async () => html });

	it('follows the refresh target and searches its anchors instead', async () => {
		target('<html><body><a href="/new-feed">n</a></body></html>');
		const { instance, events } = makeInstance(
			'<a href="/old">o</a>',
			{ followMetaRefresh: true, timeout: 7, insecure: true },
			'<meta http-equiv="refresh" content="0; url=/moved/">'
		);
		await checkAllAnchors(instance);
		expect(mockFetch).toHaveBeenCalledWith(`${SITE}/moved/`, { timeout: 7, insecure: true });
		expect(checked()).toEqual([`${SITE}/new-feed`]);
		expect(events).toContainEqual({
			event: 'log',
			data: { module: 'anchors', message: `Following meta refresh redirect to ${SITE}/moved/` }
		});
	});

	it.each([
		['single quotes', `<meta http-equiv="refresh" content="0; URL='/moved/'">`],
		['double quotes', `<meta http-equiv="refresh" content='0;url="/moved/"'>`],
		['spaces around =', `<meta http-equiv="refresh" content="0; url = /moved/">`]
	])('handles a target URL in %s', async (_name, meta) => {
		target('<html><body></body></html>');
		const { instance } = makeInstance('', { followMetaRefresh: true }, meta);
		await checkAllAnchors(instance);
		expect(mockFetch.mock.calls[0][0]).toBe(`${SITE}/moved/`);
	});

	it('returns nothing when the refresh target fails to load', async () => {
		target('', false);
		const { instance } = makeInstance(
			'<a href="/old">o</a>',
			{ followMetaRefresh: true },
			'<meta http-equiv="refresh" content="0; url=/moved/">'
		);
		expect(await checkAllAnchors(instance)).toEqual([]);
		expect(checked()).toEqual([]);
	});

	it('ignores the refresh tag unless followMetaRefresh is set', async () => {
		const { instance } = makeInstance(
			'<a href="/old">o</a>',
			{},
			'<meta http-equiv="refresh" content="0; url=/moved/">'
		);
		await checkAllAnchors(instance);
		expect(mockFetch).not.toHaveBeenCalled();
		expect(checked()).toEqual([`${SITE}/old`]);
	});

	it('searches the page itself when the refresh tag has no URL', async () => {
		const { instance } = makeInstance(
			'<a href="/old">o</a>',
			{ followMetaRefresh: true },
			'<meta http-equiv="refresh" content="30">'
		);
		await checkAllAnchors(instance);
		expect(mockFetch).not.toHaveBeenCalled();
		expect(checked()).toEqual([`${SITE}/old`]);
	});

	it('searches the page itself when there is no refresh tag', async () => {
		const { instance } = makeInstance('<a href="/old">o</a>', { followMetaRefresh: true });
		await checkAllAnchors(instance);
		expect(mockFetch).not.toHaveBeenCalled();
		expect(checked()).toEqual([`${SITE}/old`]);
	});
});

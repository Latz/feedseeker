import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('../modules/fetchWithTimeout.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/metaLinks.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/anchors/index.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/blindsearch/index.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/deepSearch.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/applePodcasts.ts', () => ({ default: vi.fn() }));

import FeedSeeker from '../feedseeker.ts';
import { type Feed } from '../modules/metaLinks.ts';
import fetchWithTimeout from '../modules/fetchWithTimeout.ts';
import metaLinksMod from '../modules/metaLinks.ts';
import anchorsMod from '../modules/anchors/index.ts';
import blindSearchMod from '../modules/blindsearch/index.ts';
import deepSearchMod from '../modules/deepSearch.ts';
import lookupApplePodcastFeed from '../modules/applePodcasts.ts';

const mockFetch = fetchWithTimeout as unknown as Mock;
const meta = metaLinksMod as Mock;
const anchors = anchorsMod as Mock;
const blind = blindSearchMod as Mock;
const deep = deepSearchMod as Mock;
const apple = lookupApplePodcastFeed as unknown as Mock;

const SITE = 'https://example.com';
const RSS =
	'<?xml version="1.0"?><rss version="2.0"><channel><title>Self</title><description>d</description><item></item></channel></rss>';
const feed = (path: string, title: string | null = null): Feed => ({
	url: `${SITE}${path}`,
	type: 'rss',
	title,
	feedTitle: null
});

/** fetch mock: URL → body (200), number (status) or Error (thrown); fresh Response per call. */
function web(pages: Record<string, string | number | Error>, headers: Record<string, string> = {}) {
	mockFetch.mockImplementation(async (url: string) => {
		const page = pages[url] ?? 404;
		if (page instanceof Error) throw page;
		if (typeof page === 'number') return new Response('', { status: page, headers });
		return new Response(page, { status: 200 });
	});
}

function seeker(site = SITE, options = {}) {
	const s = new FeedSeeker(site, options);
	const errors: any[] = [];
	let initialized = 0;
	s.on('error', (e: unknown) => errors.push(e));
	s.on('initialized', () => initialized++);
	return { s, errors, initialized: () => initialized };
}

beforeEach(() => {
	vi.clearAllMocks();
	web({ [SITE]: '<html><body></body></html>' });
	for (const m of [meta, anchors, blind, deep]) m.mockResolvedValue([]);
	apple.mockResolvedValue(null);
});

describe('FeedSeeker — initialization errors', () => {
	it('rejects an empty site with a clear message', async () => {
		const { s, errors } = seeker('');
		await s.initialize();
		expect(errors.map((e) => e.error)).toEqual(['Site parameter must be a non-empty string']);
		expect(s.getInitStatus()).toBe('error');
	});

	it('reports an unparsable URL', async () => {
		const { s, errors } = seeker('http://[bad');
		await s.initialize();
		expect(errors.map((e) => e.error)).toEqual(['Invalid URL: http://[bad']);
		expect(mockFetch).not.toHaveBeenCalled();
	});

	it('leaves a usable empty document and content after an error', async () => {
		const { s, initialized } = seeker('');
		await s.initialize();
		expect(s.content).toBe('');
		expect(s.document.querySelector('a')).toBeNull();
		expect(s.document.body).toBeTruthy();
		expect(initialized()).toBe(1);
	});

	it('includes the error code of the cause in the message and event', async () => {
		const cause = Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' });
		web({ [SITE]: Object.assign(new Error('fetch failed'), { cause }) });
		const { s, errors } = seeker();
		await s.initialize();
		expect(errors).toEqual([
			{
				module: 'FeedSeeker',
				error: `Failed to fetch ${SITE}: fetch failed (cause: ECONNREFUSED)`,
				cause
			}
		]);
	});

	it('omits the cause when there is none', async () => {
		web({ [SITE]: new Error('fetch failed') });
		const { s, errors } = seeker();
		await s.initialize();
		// strict: a `cause: undefined` key must not be present at all
		expect(errors).toStrictEqual([
			{ module: 'FeedSeeker', error: `Failed to fetch ${SITE}: fetch failed` }
		]);
	});

	it('reports timeouts as such', async () => {
		web({ [SITE]: Object.assign(new Error('aborted'), { name: 'AbortError' }) });
		const { s, errors } = seeker();
		await s.initialize();
		expect(errors[0].error).toBe(`Failed to fetch ${SITE}: Request timed out`);
	});
});

describe('FeedSeeker — initial fetch', () => {
	it('fetches with the timeout in milliseconds and the insecure flag', async () => {
		const { s } = seeker(SITE, { timeout: 7, insecure: true });
		await s.initialize();
		expect(mockFetch).toHaveBeenCalledWith(SITE, { timeout: 7000, insecure: true });
	});

	it('defaults to a 15 s timeout even when timeout is passed as undefined', async () => {
		const { s } = seeker(SITE, { timeout: undefined });
		await s.initialize();
		expect(mockFetch.mock.calls[0][1].timeout).toBe(15000);
	});

	it('continues with empty content on a non-OK page and emits initialized once', async () => {
		web({ [SITE]: 404 });
		const { s, errors, initialized } = seeker();
		await s.initialize();
		expect(s.isInitialized()).toBe(true);
		expect(s.content).toBe('');
		expect(s.challengeDetected).toBe(false);
		expect(errors).toEqual([]);
		expect(initialized()).toBe(1);
	});

	it('flags a bot-challenge page', async () => {
		web({ [SITE]: 403 }, { 'cf-mitigated': 'challenge' });
		const { s } = seeker();
		await s.initialize();
		expect(s.challengeDetected).toBe(true);
	});
});

describe('FeedSeeker — the site itself is a feed', () => {
	it('returns the site as the only feed without running any strategy', async () => {
		web({ [SITE]: RSS });
		const s = new FeedSeeker(SITE);
		const ends: unknown[] = [];
		s.on('end', (d: unknown) => ends.push(d));
		const feeds = await s.startSearch();
		expect(feeds).toEqual([{ url: SITE, title: null, type: 'rss', feedTitle: 'Self' }]);
		expect(ends).toEqual([{ module: 'all', feeds }]);
		for (const m of [meta, anchors, blind, deep]) expect(m).not.toHaveBeenCalled();
	});

	it('resolves an Apple Podcasts page to its feed', async () => {
		const podcast = 'https://podcasts.apple.com/de/podcast/x/id1';
		const feedUrl = 'https://feeds.example/podcast.xml';
		web({ [podcast]: '<html></html>', [feedUrl]: RSS });
		apple.mockResolvedValue(feedUrl);
		const feeds = await new FeedSeeker(podcast).startSearch();
		expect(feeds).toEqual([{ url: feedUrl, title: null, type: 'rss', feedTitle: 'Self' }]);
		expect(apple).toHaveBeenCalledWith(podcast, { timeout: 15000, insecure: undefined });
	});

	it('ignores an Apple Podcasts feed URL that is not actually a feed', async () => {
		const podcast = 'https://podcasts.apple.com/de/podcast/x/id1';
		const feedUrl = 'https://feeds.example/broken.xml';
		web({ [podcast]: '<html></html>', [feedUrl]: '<html>not a feed</html>' });
		apple.mockResolvedValue(feedUrl);
		await new FeedSeeker(podcast).startSearch();
		expect(meta).toHaveBeenCalled();
	});
});

describe('FeedSeeker — combining strategies', () => {
	/** Promise each strategy returns, resolved manually, to observe run order. */
	function deferredStrategies() {
		const started: string[] = [];
		const resolvers: Record<string, (f: Feed[]) => void> = {};
		for (const [name, m] of Object.entries({ meta, anchors, blind })) {
			m.mockImplementation(
				() =>
					new Promise<Feed[]>((resolve) => {
						started.push(name);
						resolvers[name] = resolve;
					})
			);
		}
		return { started, resolvers };
	}

	it.each([
		['no maxFeeds', {}],
		['maxFeeds 0', { maxFeeds: 0 }],
		['all:true with maxFeeds', { all: true, maxFeeds: 1 }]
	])('runs all strategies in parallel with %s', async (_n, options) => {
		const { started, resolvers } = deferredStrategies();
		const search = new FeedSeeker(SITE, options).startSearch();
		await vi.waitFor(() => expect(started).toEqual(['meta', 'anchors', 'blind']));
		for (const r of Object.values(resolvers)) r([]);
		await search;
	});

	it('runs strategies one after another with maxFeeds', async () => {
		const { started, resolvers } = deferredStrategies();
		const search = new FeedSeeker(SITE, { maxFeeds: 3 }).startSearch();
		await vi.waitFor(() => expect(started).toEqual(['meta']));
		resolvers.meta([]);
		await vi.waitFor(() => expect(started).toEqual(['meta', 'anchors']));
		resolvers.anchors([]);
		await vi.waitFor(() => expect(started).toEqual(['meta', 'anchors', 'blind']));
		resolvers.blind([]);
		await search;
	});

	it('stops once maxFeeds is reached, but not before', async () => {
		meta.mockResolvedValue([feed('/a')]);
		await new FeedSeeker(SITE, { maxFeeds: 1 }).startSearch();
		expect(anchors).not.toHaveBeenCalled();
		vi.clearAllMocks();
		meta.mockResolvedValue([feed('/a')]);
		await new FeedSeeker(SITE, { maxFeeds: 2 }).startSearch();
		expect(anchors).toHaveBeenCalled();
	});

	it('maxFeeds 0 means unlimited, including deep search results', async () => {
		meta.mockResolvedValue([feed('/a'), feed('/b')]);
		deep.mockResolvedValue([feed('/c'), feed('/d')]);
		const feeds = await new FeedSeeker(SITE, { maxFeeds: 0, deepsearch: true }).startSearch();
		expect(feeds).toHaveLength(4);
	});

	it('keeps the first strategy’s version of a feed found twice', async () => {
		meta.mockResolvedValue([feed('/a', 'from meta')]);
		anchors.mockResolvedValue([feed('/a', 'from anchors'), feed('/b')]);
		deep.mockResolvedValue([feed('/a', 'from deep'), feed('/c')]);
		const feeds = await new FeedSeeker(SITE, { deepsearch: true }).startSearch();
		expect(feeds.map((f) => [f.url, f.title])).toEqual([
			[`${SITE}/a`, 'from meta'],
			[`${SITE}/b`, null],
			[`${SITE}/c`, null]
		]);
	});

	it.each([
		['without maxFeeds', {}],
		['with maxFeeds', { maxFeeds: 5 }]
	])('a failing strategy does not lose the others’ results %s', async (_n, options) => {
		meta.mockResolvedValue([feed('/a')]);
		anchors.mockRejectedValue(new Error('anchors broke'));
		blind.mockResolvedValue([feed('/b')]);
		const feeds = await new FeedSeeker(SITE, options).startSearch();
		expect(feeds.map((f) => f.url)).toEqual([`${SITE}/a`, `${SITE}/b`]);
	});
});

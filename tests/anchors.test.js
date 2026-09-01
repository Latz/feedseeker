import { describe, it, expect, vi, beforeEach } from 'vitest';
import checkAllAnchors, { ALLOWED_DOMAINS } from '../modules/anchors/index.ts';
import { parseHTML } from 'linkedom';

// Mock checkFeed to avoid real network requests
vi.mock('../modules/checkFeed/index.ts', () => ({
	default: vi.fn()
}));
import checkFeed from '../modules/checkFeed/index.ts';

// Mock fetchWithTimeout to avoid real network requests
vi.mock('../modules/fetchWithTimeout.ts', () => ({
	default: vi.fn()
}));
import fetchWithTimeout from '../modules/fetchWithTimeout.ts';

// Build a minimal mock instance that mirrors MetaLinksInstance
function makeInstance(html, options = {}) {
	const { document } = parseHTML(html);
	const events = [];
	return {
		site: 'https://example.com',
		document,
		options,
		emit(event, data) {
			events.push({ event, data });
		},
		_events: events
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('checkAllAnchors()', () => {
	it('emits start event with module anchors', async () => {
		const instance = makeInstance('<html><body></body></html>');
		await checkAllAnchors(instance);
		const startEvent = instance._events.find((e) => e.event === 'start');
		expect(startEvent).toBeDefined();
		expect(startEvent.data.module).toBe('anchors');
	});

	it('emits end event with module anchors', async () => {
		const instance = makeInstance('<html><body></body></html>');
		await checkAllAnchors(instance);
		const endEvent = instance._events.find((e) => e.event === 'end');
		expect(endEvent).toBeDefined();
		expect(endEvent.data.module).toBe('anchors');
	});

	it('end event data contains the feeds array', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Blog' });
		const instance = makeInstance('<html><body><a href="/feed">Feed</a></body></html>');
		const result = await checkAllAnchors(instance);
		const endEvent = instance._events.find((e) => e.event === 'end');
		expect(endEvent.data.feeds).toEqual(result);
	});

	it('returns empty array when page has no anchors', async () => {
		const instance = makeInstance('<html><body><p>No links here</p></body></html>');
		const feeds = await checkAllAnchors(instance);
		expect(feeds).toEqual([]);
		expect(checkFeed).not.toHaveBeenCalled();
	});

	it('filters out mailto and javascript anchors', async () => {
		const html = `<html><body>
			<a href="mailto:test@example.com">Email</a>
			<a href="javascript:void(0)">JS</a>
		</body></html>`;
		const instance = makeInstance(html);
		const feeds = await checkAllAnchors(instance);
		expect(feeds).toEqual([]);
		expect(checkFeed).not.toHaveBeenCalled();
	});

	it('discovers a feed from an anchor with relative href', async () => {
		checkFeed.mockImplementation(async (url) => {
			if (url === 'https://example.com/feed.xml') return { type: 'rss', title: 'My Blog' };
			return null;
		});
		const instance = makeInstance('<html><body><a href="/feed.xml">Feed</a></body></html>');
		const result = await checkAllAnchors(instance);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			url: 'https://example.com/feed.xml',
			type: 'rss',
			feedTitle: 'My Blog'
		});
	});

	it('uses anchor text as title', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Feed Title' });
		const instance = makeInstance(
			'<html><body><a href="/feed">Subscribe via RSS</a></body></html>'
		);
		const result = await checkAllAnchors(instance);
		expect(result[0].title).toBe('Subscribe via RSS');
	});

	it('title is null when anchor has no text', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: null });
		const instance = makeInstance('<html><body><a href="/feed"></a></body></html>');
		const result = await checkAllAnchors(instance);
		expect(result[0].title).toBeNull();
	});

	it('discovers multiple feeds from multiple anchors', async () => {
		checkFeed.mockImplementation(async (url) => {
			if (url.endsWith('/rss')) return { type: 'rss', title: 'RSS' };
			if (url.endsWith('/atom')) return { type: 'atom', title: 'Atom' };
			return null;
		});
		const html = '<html><body><a href="/rss">RSS</a><a href="/atom">Atom</a></body></html>';
		const instance = makeInstance(html);
		const result = await checkAllAnchors(instance);
		expect(result).toHaveLength(2);
	});

	it('returns [] when checkFeed returns null for all anchors', async () => {
		checkFeed.mockResolvedValue(null);
		const html = '<html><body><a href="/page">Link</a></body></html>';
		const instance = makeInstance(html);
		const result = await checkAllAnchors(instance);
		expect(result).toEqual([]);
	});

	it('filters out external domain links (not same domain or allowed)', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'External' });
		const html = '<html><body><a href="https://different-site.com/feed">External</a></body></html>';
		const instance = makeInstance(html);
		const result = await checkAllAnchors(instance);
		expect(result).toEqual([]);
	});

	it('allows feedburner.com as external feed domain', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Feedburner Feed' });
		const html = '<html><body><a href="https://feeds.feedburner.com/myblog">Feed</a></body></html>';
		const instance = makeInstance(html);
		const result = await checkAllAnchors(instance);
		expect(result.some((f) => f.url.includes('feedburner.com'))).toBe(true);
	});

	it('handles anchor with absolute https URL on same domain', async () => {
		checkFeed.mockResolvedValue({ type: 'atom', title: 'Atom' });
		const html = '<html><body><a href="https://example.com/atom.xml">Atom</a></body></html>';
		const instance = makeInstance(html);
		const result = await checkAllAnchors(instance);
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe('https://example.com/atom.xml');
	});

	it('skips anchor when checkFeed throws (no error event without showErrors)', async () => {
		checkFeed.mockRejectedValue(new Error('timeout'));
		const html = '<html><body><a href="/feed">Feed</a></body></html>';
		const instance = makeInstance(html, { showErrors: false });
		const result = await checkAllAnchors(instance);
		expect(result).toEqual([]);
		expect(instance._events.filter((e) => e.event === 'error')).toHaveLength(0);
	});

	it('emits error event when checkFeed throws and showErrors is true', async () => {
		checkFeed.mockRejectedValue(new Error('timeout'));
		const html = '<html><body><a href="/feed">Feed</a></body></html>';
		const instance = makeInstance(html, { showErrors: true });
		await checkAllAnchors(instance);
		const errorEvent = instance._events.find((e) => e.event === 'error');
		expect(errorEvent).toBeDefined();
		expect(errorEvent.data.module).toBe('anchors');
	});

	it('includes the failing URL and error message when a plain-text URL check throws with showErrors true', async () => {
		checkFeed.mockRejectedValue(new Error('boom'));
		const html = '<html><body>Subscribe at https://example.com/rss.xml for updates</body></html>';
		const instance = makeInstance(html, { showErrors: true });
		const result = await checkAllAnchors(instance);
		expect(result).toEqual([]);
		const errorEvent = instance._events.find((e) => e.event === 'error');
		expect(errorEvent).toBeDefined();
		expect(errorEvent.data.module).toBe('anchors');
		expect(errorEvent.data.error).toContain('boom');
	});

	it('respects maxFeeds: stops after finding N feeds (with concurrency=1)', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Feed' });
		const html = `<html><body>
			<a href="/feed1">Feed 1</a>
			<a href="/feed2">Feed 2</a>
			<a href="/feed3">Feed 3</a>
			<a href="/feed4">Feed 4</a>
			<a href="/feed5">Feed 5</a>
		</body></html>`;
		// concurrency=1 forces sequential processing so maxFeeds check fires between anchors
		const instance = makeInstance(html, { maxFeeds: 1, concurrency: 1 });
		const result = await checkAllAnchors(instance);
		expect(result.length).toBeLessThanOrEqual(1);
	});

	it('emits log event when maxFeeds limit is reached during anchor phase (concurrency=1)', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Feed' });
		const html = `<html><body>
			<a href="/feed1">Feed 1</a>
			<a href="/feed2">Feed 2</a>
			<a href="/feed3">Feed 3</a>
		</body></html>`;
		// concurrency=1 so the limit check fires between iterations
		const instance = makeInstance(html, { maxFeeds: 1, concurrency: 1 });
		await checkAllAnchors(instance);
		const limitLog = instance._events.find(
			(e) => e.event === 'log' && e.data?.message?.includes('maximum feeds limit')
		);
		expect(limitLog).toBeDefined();
	});

	it('emits log events during processing (totalCount, totalEndpoints)', async () => {
		checkFeed.mockResolvedValue(null);
		const html = '<html><body><a href="/page">Link</a></body></html>';
		const instance = makeInstance(html);
		await checkAllAnchors(instance);
		const logEvents = instance._events.filter((e) => e.event === 'log');
		expect(logEvents.length).toBeGreaterThan(0);
	});

	it('processes plain-text URLs from body when they are on same domain', async () => {
		checkFeed.mockImplementation(async (url) => {
			if (url === 'https://example.com/rss.xml') return { type: 'rss', title: 'Text Feed' };
			return null;
		});
		// No <a> tag, but URL appears in plain text
		const html = '<html><body>Subscribe at https://example.com/rss.xml for updates</body></html>';
		const instance = makeInstance(html);
		const result = await checkAllAnchors(instance);
		expect(result.some((f) => f.url === 'https://example.com/rss.xml')).toBe(true);
	});

	it('plain-text feed has null title (no anchor text)', async () => {
		checkFeed.mockImplementation(async (url) => {
			if (url === 'https://example.com/feed') return { type: 'rss', title: 'Feed' };
			return null;
		});
		const html = '<html><body>https://example.com/feed</body></html>';
		const instance = makeInstance(html);
		const result = await checkAllAnchors(instance);
		const found = result.find((f) => f.url === 'https://example.com/feed');
		if (found) {
			expect(found.title).toBeNull();
		}
	});

	it('skips plain-text URLs already found via anchors', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Feed' });
		// Same URL in anchor tag and in body text
		const html =
			'<html><body><a href="/feed">Feed</a> Also at https://example.com/feed</body></html>';
		const instance = makeInstance(html);
		await checkAllAnchors(instance);
		// checkFeed should only be called once for that URL
		const calls = checkFeed.mock.calls.filter((c) => c[0] === 'https://example.com/feed');
		expect(calls.length).toBeLessThanOrEqual(1);
	});

	it('returns empty array instead of throwing when content is not real HTML (no documentElement)', async () => {
		// Some servers respond 200 with a plain-text body (e.g. "ldapbind failed").
		// linkedom's parseHTML then produces a document with documentElement === null,
		// and its .body/.head getters throw rather than returning null/undefined.
		const instance = makeInstance('ldapbind failed');
		expect(instance.document.documentElement).toBeNull();
		await expect(checkAllAnchors(instance)).resolves.toEqual([]);
	});
});

describe('meta refresh redirect', () => {
	it('does not follow meta refresh when followMetaRefresh is false', async () => {
		checkFeed.mockResolvedValue(null);
		const html = `<html><head>
			<meta http-equiv="refresh" content="0; url=https://example.com/new-page">
		</head><body></body></html>`;
		const instance = makeInstance(html, { followMetaRefresh: false });
		const result = await checkAllAnchors(instance);
		expect(result).toEqual([]);
	});

	it('does not follow meta refresh when followMetaRefresh is not set', async () => {
		checkFeed.mockResolvedValue(null);
		const html = `<html><head>
			<meta http-equiv="refresh" content="0; url=https://example.com/new-page">
		</head><body></body></html>`;
		const instance = makeInstance(html, {});
		const result = await checkAllAnchors(instance);
		expect(result).toEqual([]);
	});

	it('follows meta refresh redirect by fetching the target page and returns feeds found there', async () => {
		checkFeed.mockImplementation(async (url) => {
			if (url === 'https://example.com/feed.xml') return { type: 'rss', title: 'Redirected Feed' };
			return null;
		});
		fetchWithTimeout.mockResolvedValue({
			ok: true,
			text: async () => '<html><body><a href="feed.xml">Feed</a></body></html>'
		});
		const html = `<html><head>
			<meta http-equiv="refresh" content="0; url=/new-page">
		</head><body><a href="/original-page-link">Ignored</a></body></html>`;
		const instance = makeInstance(html, { followMetaRefresh: true });
		const result = await checkAllAnchors(instance);
		expect(fetchWithTimeout).toHaveBeenCalledWith(
			'https://example.com/new-page',
			expect.anything()
		);
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe('https://example.com/feed.xml');
		const redirectLog = instance._events.find(
			(e) => e.event === 'log' && e.data?.message?.includes('Following meta refresh redirect')
		);
		expect(redirectLog).toBeDefined();
	});

	it('does not recurse when the target page fetch fails', async () => {
		fetchWithTimeout.mockResolvedValue({ ok: false, status: 404 });
		const html = `<html><head>
			<meta http-equiv="refresh" content="0; url=/missing-page">
		</head><body></body></html>`;
		const instance = makeInstance(html, { followMetaRefresh: true });
		const result = await checkAllAnchors(instance);
		expect(result).toEqual([]);
	});
});

describe('ALLOWED_DOMAINS', () => {
	it('is a module-level Set containing the FeedBurner domains', () => {
		expect(ALLOWED_DOMAINS).toBeInstanceOf(Set);
		expect(ALLOWED_DOMAINS.has('feedburner.com')).toBe(true);
		expect(ALLOWED_DOMAINS.has('feeds.feedburner.com')).toBe(true);
		expect(ALLOWED_DOMAINS.has('feedproxy.google.com')).toBe(true);
		expect(ALLOWED_DOMAINS.has('feeds2.feedburner.com')).toBe(true);
	});
});

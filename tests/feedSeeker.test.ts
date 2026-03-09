import { describe, it, beforeEach, afterEach, expect, vi, type Mock } from 'vitest';
import FeedSeeker, { type FeedSeekerOptions } from '../feed-seeker.ts';
import { type Feed } from '../modules/metaLinks.ts';

// Mock fetchWithTimeout so initialize() never makes real network requests
vi.mock('../modules/fetchWithTimeout.ts', () => ({
	default: vi.fn()
}));
import fetchWithTimeout from '../modules/fetchWithTimeout.ts';

// Mock the four search modules so search methods don't make network calls
vi.mock('../modules/metaLinks.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/anchors.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/blindsearch.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/deepSearch.ts', () => ({ default: vi.fn() }));

import metaLinksMod from '../modules/metaLinks.ts';
import anchorsMod from '../modules/anchors.ts';
import blindSearchMod from '../modules/blindsearch.ts';
import deepSearchMod from '../modules/deepSearch.ts';

function mockOkResponse(html = '<html><head></head><body></body></html>') {
	return {
		ok: true,
		status: 200,
		statusText: 'OK',
		text: async (): Promise<string> => html
	};
}

beforeEach(() => {
	vi.clearAllMocks();
	// Default: successful fetch returning empty HTML
	(fetchWithTimeout as Mock).mockResolvedValue(mockOkResponse());
	// Default: search modules return empty arrays
	(metaLinksMod as Mock).mockResolvedValue([]);
	(anchorsMod as Mock).mockResolvedValue([]);
	(blindSearchMod as Mock).mockResolvedValue([]);
	(deepSearchMod as Mock).mockResolvedValue([]);
});

afterEach(() => {
	vi.restoreAllMocks();
});

// ─── Constructor ──────────────────────────────────────────────────────────────

describe('FeedSeeker constructor', () => {
	it('adds https:// when no protocol given', () => {
		expect(new FeedSeeker('example.com').site).toBe('https://example.com');
	});

	it('keeps existing https:// protocol', () => {
		expect(new FeedSeeker('https://example.com').site).toBe('https://example.com');
	});

	it('keeps existing http:// protocol', () => {
		expect(new FeedSeeker('http://example.com').site).toBe('http://example.com');
	});

	it('strips trailing slash from root URL', () => {
		expect(new FeedSeeker('https://example.com/').site).toBe('https://example.com');
	});

	it('preserves path when URL has a non-root path', () => {
		expect(new FeedSeeker('https://example.com/blog').site).toBe('https://example.com/blog');
	});

	it('stores provided options', () => {
		const opts: FeedSeekerOptions = { timeout: 10, maxFeeds: 5 };
		expect(new FeedSeeker('https://example.com', opts).options).toMatchObject(opts);
	});

	it('defaults timeout to 5 when not provided', () => {
		expect(new FeedSeeker('https://example.com').options.timeout).toBe(5);
	});

	it('initPromise is null before initialize() is called', () => {
		expect(new FeedSeeker('https://example.com').initPromise).toBeNull();
	});

	it('stores an invalid URL without throwing in constructor', () => {
		// Errors are deferred to initialize()
		expect(() => new FeedSeeker('totally-invalid')).not.toThrow();
	});
});

// ─── getInitStatus / isInitialized ───────────────────────────────────────────

describe('getInitStatus() / isInitialized()', () => {
	it('status is "pending" before initialize()', () => {
		const fs = new FeedSeeker('https://example.com');
		expect(fs.getInitStatus()).toBe('pending');
		expect(fs.isInitialized()).toBe(false);
	});

	it('status is "success" after successful initialize()', async () => {
		const fs = new FeedSeeker('https://example.com');
		await fs.initialize();
		expect(fs.getInitStatus()).toBe('success');
		expect(fs.isInitialized()).toBe(true);
	});

	it('status is "error" when fetch fails', async () => {
		(fetchWithTimeout as Mock).mockRejectedValue(new Error('ECONNREFUSED'));
		const fs = new FeedSeeker('https://example.com');
		fs.on('error', () => {}); // prevent unhandled error event throw
		await fs.initialize();
		expect(fs.getInitStatus()).toBe('error');
		expect(fs.isInitialized()).toBe(false);
	});
});

// ─── initialize() ────────────────────────────────────────────────────────────

describe('initialize()', () => {
	it('emits "initialized" on success', async () => {
		const fs = new FeedSeeker('https://example.com');
		let fired = false;
		fs.on('initialized', () => {
			fired = true;
		});
		await fs.initialize();
		expect(fired).toBe(true);
	});

	it('populates document on successful fetch', async () => {
		(fetchWithTimeout as Mock).mockResolvedValue(
			mockOkResponse('<html><head><title>Hi</title></head><body></body></html>')
		);
		const fs = new FeedSeeker('https://example.com');
		await fs.initialize();
		expect(fs.document).toBeDefined();
		expect(fs.content).toContain('<title>Hi</title>');
	});

	it('caches the init promise — second call does not re-fetch', async () => {
		const fs = new FeedSeeker('https://example.com');
		await fs.initialize();
		await fs.initialize();
		expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
	});

	it('emits "error" and "initialized" when fetch throws', async () => {
		(fetchWithTimeout as Mock).mockRejectedValue(new Error('network down'));
		const fs = new FeedSeeker('https://example.com');
		const events: { type: string; d?: any }[] = [];
		fs.on('error', (d) => events.push({ type: 'error', d }));
		fs.on('initialized', () => events.push({ type: 'initialized' }));
		await fs.initialize();
		expect(events.map((e) => e.type)).toEqual(['error', 'initialized']);
	});

	it('emits error with module "FeedSeeker" on fetch failure', async () => {
		(fetchWithTimeout as Mock).mockRejectedValue(new Error('timeout'));
		const fs = new FeedSeeker('https://example.com');
		let errData: any;
		fs.on('error', (d) => {
			errData = d;
		});
		await fs.initialize();
		expect(errData.module).toBe('FeedSeeker');
	});

	it('sets document to empty document on fetch failure', async () => {
		(fetchWithTimeout as Mock).mockRejectedValue(new Error('fail'));
		const fs = new FeedSeeker('https://example.com');
		fs.on('error', () => {}); // prevent unhandled error event throw
		await fs.initialize();
		expect(fs.document).toBeDefined();
		expect(typeof fs.document.querySelectorAll).toBe('function');
	});

	it('handles non-ok response (403) by setting empty content and succeeding', async () => {
		(fetchWithTimeout as Mock).mockResolvedValue({
			ok: false,
			status: 403,
			statusText: 'Forbidden',
			text: async () => ''
		});
		const fs = new FeedSeeker('https://example.com');
		await fs.initialize();
		expect(fs.getInitStatus()).toBe('success');
		expect(fs.content).toBe('');
	});

	it('emits error for invalid URL during initialize', async () => {
		// URL that fails URL() constructor — constructor stores it, initialize validates it
		const fs = new FeedSeeker('not a url at all :::');
		const errors: any[] = [];
		fs.on('error', (d) => errors.push(d));
		await fs.initialize();
		expect(errors.length).toBeGreaterThan(0);
		expect(fs.getInitStatus()).toBe('error');
	});

	it('includes timeout info in error message for AbortError', async () => {
		const abortErr = new Error('aborted');
		abortErr.name = 'AbortError';
		(fetchWithTimeout as Mock).mockRejectedValue(abortErr);
		const fs = new FeedSeeker('https://example.com');
		let errData: any;
		fs.on('error', (d) => {
			errData = d;
		});
		await fs.initialize();
		expect(errData.error).toContain('timed out');
	});
});

// ─── search methods delegate to modules ──────────────────────────────────────

describe('metaLinks()', () => {
	it('calls the metaLinks module and returns its result', async () => {
		const feed: Feed = { url: 'https://example.com/rss', type: 'rss' };
		(metaLinksMod as Mock).mockResolvedValue([feed]);
		const fs = new FeedSeeker('https://example.com');
		const result = await fs.metaLinks();
		expect(metaLinksMod).toHaveBeenCalledWith(fs);
		expect(result).toEqual([feed]);
	});
});

describe('checkAllAnchors()', () => {
	it('calls the anchors module and returns its result', async () => {
		const feed: Feed = { url: 'https://example.com/feed', type: 'atom' };
		(anchorsMod as Mock).mockResolvedValue([feed]);
		const fs = new FeedSeeker('https://example.com');
		const result = await fs.checkAllAnchors();
		expect(anchorsMod).toHaveBeenCalledWith(fs);
		expect(result).toEqual([feed]);
	});
});

describe('blindSearch()', () => {
	it('calls the blindSearch module and returns its result', async () => {
		const feed: Feed = { url: 'https://example.com/feed.json', type: 'json' };
		(blindSearchMod as Mock).mockResolvedValue([feed]);
		const fs = new FeedSeeker('https://example.com');
		const result = await fs.blindSearch();
		expect(blindSearchMod).toHaveBeenCalledWith(fs);
		expect(result).toEqual([feed]);
	});
});

describe('deepSearch()', () => {
	it('calls the deepSearch module with site, options and instance', async () => {
		const feed: Feed = { url: 'https://example.com/feed', type: 'rss' };
		(deepSearchMod as Mock).mockResolvedValue([feed]);
		const fs = new FeedSeeker('https://example.com');
		const result = await fs.deepSearch();
		expect(deepSearchMod).toHaveBeenCalledWith('https://example.com', fs.options, fs);
		expect(result).toEqual([feed]);
	});
});

// ─── startSearch() — strategy orchestration ──────────────────────────────────

describe('startSearch()', () => {
	it('runs all three default strategies and returns combined feeds', async () => {
		(metaLinksMod as Mock).mockResolvedValue([{ url: 'https://example.com/rss', type: 'rss' }]);
		(anchorsMod as Mock).mockResolvedValue([{ url: 'https://example.com/atom', type: 'atom' }]);
		(blindSearchMod as Mock).mockResolvedValue([{ url: 'https://example.com/json', type: 'json' }]);
		const fs = new FeedSeeker('https://example.com');
		const result = await fs.startSearch();
		expect(result).toHaveLength(3);
		expect(metaLinksMod).toHaveBeenCalled();
		expect(anchorsMod).toHaveBeenCalled();
		expect(blindSearchMod).toHaveBeenCalled();
	});

	it('deduplicates feeds with the same URL across strategies', async () => {
		const dup: Feed = { url: 'https://example.com/rss', type: 'rss' };
		(metaLinksMod as Mock).mockResolvedValue([dup]);
		(anchorsMod as Mock).mockResolvedValue([dup]);
		(blindSearchMod as Mock).mockResolvedValue([]);
		const fs = new FeedSeeker('https://example.com');
		const result = await fs.startSearch();
		expect(result).toHaveLength(1);
	});

	it('respects maxFeeds and stops collecting after limit', async () => {
		(metaLinksMod as Mock).mockResolvedValue([
			{ url: 'https://example.com/rss1', type: 'rss' },
			{ url: 'https://example.com/rss2', type: 'rss' }
		]);
		const fs = new FeedSeeker('https://example.com', { maxFeeds: 1 });
		const result = await fs.startSearch();
		expect(result).toHaveLength(1);
	});

	it('with all:true runs all strategies even when maxFeeds is set', async () => {
		// all:true prevents early exit between strategies, so all three run
		(metaLinksMod as Mock).mockResolvedValue([{ url: 'https://example.com/rss1', type: 'rss' }]);
		(anchorsMod as Mock).mockResolvedValue([{ url: 'https://example.com/atom', type: 'atom' }]);
		(blindSearchMod as Mock).mockResolvedValue([]);
		const fs = new FeedSeeker('https://example.com', { maxFeeds: 1, all: true });
		await fs.startSearch();
		// all three strategies should have been called (no early exit)
		expect(metaLinksMod).toHaveBeenCalled();
		expect(anchorsMod).toHaveBeenCalled();
		expect(blindSearchMod).toHaveBeenCalled();
	});

	it('with deepsearchOnly:true only runs deepSearch', async () => {
		(deepSearchMod as Mock).mockResolvedValue([{ url: 'https://example.com/rss', type: 'rss' }]);
		const fs = new FeedSeeker('https://example.com', { deepsearchOnly: true });
		const result = await fs.startSearch();
		expect(deepSearchMod).toHaveBeenCalled();
		expect(metaLinksMod).not.toHaveBeenCalled();
		expect(result).toHaveLength(1);
	});

	it('with metasearch:true only runs metaLinks', async () => {
		(metaLinksMod as Mock).mockResolvedValue([{ url: 'https://example.com/rss', type: 'rss' }]);
		const fs = new FeedSeeker('https://example.com', { metasearch: true });
		const result = await fs.startSearch();
		expect(metaLinksMod).toHaveBeenCalled();
		expect(anchorsMod).not.toHaveBeenCalled();
		expect(blindSearchMod).not.toHaveBeenCalled();
		expect(result).toHaveLength(1);
	});

	it('with blindsearch:true only runs blindSearch', async () => {
		(blindSearchMod as Mock).mockResolvedValue([{ url: 'https://example.com/json', type: 'json' }]);
		const fs = new FeedSeeker('https://example.com', { blindsearch: true });
		const result = await fs.startSearch();
		expect(blindSearchMod).toHaveBeenCalled();
		expect(metaLinksMod).not.toHaveBeenCalled();
		expect(result).toHaveLength(1);
	});

	it('with anchorsonly:true only runs checkAllAnchors', async () => {
		(anchorsMod as Mock).mockResolvedValue([{ url: 'https://example.com/atom', type: 'atom' }]);
		const fs = new FeedSeeker('https://example.com', { anchorsonly: true });
		const result = await fs.startSearch();
		expect(anchorsMod).toHaveBeenCalled();
		expect(metaLinksMod).not.toHaveBeenCalled();
		expect(result).toHaveLength(1);
	});

	it('with deepsearch:true also runs deepSearch after other strategies', async () => {
		(metaLinksMod as Mock).mockResolvedValue([]);
		(anchorsMod as Mock).mockResolvedValue([]);
		(blindSearchMod as Mock).mockResolvedValue([]);
		(deepSearchMod as Mock).mockResolvedValue([{ url: 'https://example.com/deep', type: 'rss' }]);
		const fs = new FeedSeeker('https://example.com', { deepsearch: true });
		const result = await fs.startSearch();
		expect(deepSearchMod).toHaveBeenCalled();
		expect(result).toHaveLength(1);
	});

	it('with deepsearch:true skips deepSearch when maxFeeds already reached', async () => {
		(metaLinksMod as Mock).mockResolvedValue([{ url: 'https://example.com/rss', type: 'rss' }]);
		(anchorsMod as Mock).mockResolvedValue([]);
		(blindSearchMod as Mock).mockResolvedValue([]);
		const fs = new FeedSeeker('https://example.com', { deepsearch: true, maxFeeds: 1 });
		await fs.startSearch();
		expect(deepSearchMod).not.toHaveBeenCalled();
	});

	it('emits "end" event with found feeds', async () => {
		const feed: Feed = { url: 'https://example.com/rss', type: 'rss' };
		(metaLinksMod as Mock).mockResolvedValue([feed]);
		const fs = new FeedSeeker('https://example.com');
		let endData: any;
		fs.on('end', (d) => {
			endData = d;
		});
		const result = await fs.startSearch();
		expect(endData).toBeDefined();
		expect(endData.feeds).toEqual(result);
	});

	it('returns [] when no feeds found', async () => {
		const fs = new FeedSeeker('https://example.com');
		const result = await fs.startSearch();
		expect(result).toEqual([]);
	});
});

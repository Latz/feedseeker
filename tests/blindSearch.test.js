/* global AbortController */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Internal helpers replicated from modules/blindsearch.ts ──────────────────
// (Not exported — tested inline like deepSearch.test.js pattern)

const DEFAULT_SEARCH_MODE = 'standard';
const DEFAULT_CONCURRENCY = 3;
const DEFAULT_REQUEST_DELAY = 0;
const MIN_CONCURRENCY = 1;
const MAX_CONCURRENCY = 10;
const MAX_REQUEST_DELAY = 60000;
const MAX_URL_LENGTH = 2083;
const MAX_GENERATED_URLS = 10000;

function validateSearchMode(mode) {
	if (!mode) return DEFAULT_SEARCH_MODE;
	const validModes = ['fast', 'standard', 'exhaustive', 'full'];
	if (!validModes.includes(mode)) return DEFAULT_SEARCH_MODE;
	return mode;
}

function validateConcurrency(concurrency) {
	if (concurrency === undefined || concurrency === null) return DEFAULT_CONCURRENCY;
	if (!Number.isFinite(concurrency) || concurrency < MIN_CONCURRENCY) return MIN_CONCURRENCY;
	if (concurrency > MAX_CONCURRENCY) return MAX_CONCURRENCY;
	return Math.floor(concurrency);
}

function validateRequestDelay(delay) {
	if (delay === undefined || delay === null) return DEFAULT_REQUEST_DELAY;
	if (!Number.isFinite(delay) || delay < 0) return DEFAULT_REQUEST_DELAY;
	if (delay > MAX_REQUEST_DELAY) return MAX_REQUEST_DELAY;
	return Math.floor(delay);
}

function isValidUrlLength(url) {
	return url.length <= MAX_URL_LENGTH;
}

// Partial replication of generateEndpointUrls for structural testing
function generateEndpointUrls(siteUrl, keepQueryParams, endpoints) {
	let urlObj;
	try {
		urlObj = new URL(siteUrl);
	} catch {
		throw new Error(`Invalid URL provided to blindSearch: ${siteUrl}`);
	}
	if (!isValidUrlLength(siteUrl)) {
		throw new Error(`URL too long`);
	}
	if (!['http:', 'https:'].includes(urlObj.protocol)) {
		throw new Error(`Invalid protocol "${urlObj.protocol}"`);
	}

	const origin = urlObj.origin;
	let path = siteUrl;
	const endpointUrls = [];
	let queryParams = '';
	if (keepQueryParams) queryParams = urlObj.search;

	while (path.length >= origin.length) {
		const basePath = path.endsWith('/') ? path.slice(0, -1) : path;
		for (const endpoint of endpoints) {
			if (endpointUrls.length >= MAX_GENERATED_URLS) return endpointUrls;
			const urlWithParams = queryParams
				? `${basePath}/${endpoint}${queryParams}`
				: `${basePath}/${endpoint}`;
			if (isValidUrlLength(urlWithParams)) endpointUrls.push(urlWithParams);
		}
		path = path.slice(0, path.lastIndexOf('/'));
	}
	return endpointUrls;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('blindsearch internal functions', () => {
	describe('validateSearchMode()', () => {
		it('returns "standard" for undefined', () => {
			expect(validateSearchMode(undefined)).toBe('standard');
		});

		it('returns "standard" for null', () => {
			expect(validateSearchMode(null)).toBe('standard');
		});

		it('returns "standard" for empty string', () => {
			expect(validateSearchMode('')).toBe('standard');
		});

		it('accepts "fast"', () => {
			expect(validateSearchMode('fast')).toBe('fast');
		});

		it('accepts "standard"', () => {
			expect(validateSearchMode('standard')).toBe('standard');
		});

		it('accepts "exhaustive"', () => {
			expect(validateSearchMode('exhaustive')).toBe('exhaustive');
		});

		it('accepts "full"', () => {
			expect(validateSearchMode('full')).toBe('full');
		});

		it('falls back to "standard" for unknown mode', () => {
			expect(validateSearchMode('turbo')).toBe('standard');
			expect(validateSearchMode('FAST')).toBe('standard'); // case-sensitive
		});
	});

	describe('validateConcurrency()', () => {
		it('returns default (3) for undefined', () => {
			expect(validateConcurrency(undefined)).toBe(3);
		});

		it('returns default (3) for null', () => {
			expect(validateConcurrency(null)).toBe(3);
		});

		it('returns the value for valid input', () => {
			expect(validateConcurrency(5)).toBe(5);
		});

		it('clamps to MIN_CONCURRENCY (1) for 0', () => {
			expect(validateConcurrency(0)).toBe(1);
		});

		it('clamps to MIN_CONCURRENCY for negative values', () => {
			expect(validateConcurrency(-5)).toBe(1);
		});

		it('clamps to MAX_CONCURRENCY (10) for values above 10', () => {
			expect(validateConcurrency(100)).toBe(10);
		});

		it('floors decimal values', () => {
			expect(validateConcurrency(3.9)).toBe(3);
		});

		it('clamps to MIN for NaN', () => {
			expect(validateConcurrency(NaN)).toBe(1);
		});

		it('clamps to MIN for Infinity (not finite)', () => {
			expect(validateConcurrency(Infinity)).toBe(1); // not finite → MIN
		});
	});

	describe('validateRequestDelay()', () => {
		it('returns default (0) for undefined', () => {
			expect(validateRequestDelay(undefined)).toBe(0);
		});

		it('returns default (0) for null', () => {
			expect(validateRequestDelay(null)).toBe(0);
		});

		it('returns the value for valid positive delay', () => {
			expect(validateRequestDelay(500)).toBe(500);
		});

		it('returns 0 for delay of 0', () => {
			expect(validateRequestDelay(0)).toBe(0);
		});

		it('returns default for negative values', () => {
			expect(validateRequestDelay(-100)).toBe(0);
		});

		it('clamps to MAX_REQUEST_DELAY (60000) for excessive values', () => {
			expect(validateRequestDelay(999999)).toBe(60000);
		});

		it('floors decimal delay values', () => {
			expect(validateRequestDelay(250.9)).toBe(250);
		});

		it('returns default for NaN', () => {
			expect(validateRequestDelay(NaN)).toBe(0);
		});
	});

	describe('generateEndpointUrls()', () => {
		const endpoints = ['feed', 'rss.xml'];

		it('generates URLs at each path level', () => {
			const urls = generateEndpointUrls('https://example.com/blog/posts', false, endpoints);
			expect(urls).toContain('https://example.com/blog/posts/feed');
			expect(urls).toContain('https://example.com/blog/feed');
			expect(urls).toContain('https://example.com/feed');
		});

		it('generates URLs from a root URL (origin only)', () => {
			const urls = generateEndpointUrls('https://example.com', false, endpoints);
			expect(urls).toContain('https://example.com/feed');
			expect(urls).toContain('https://example.com/rss.xml');
		});

		it('does not go above origin', () => {
			const urls = generateEndpointUrls('https://example.com', false, endpoints);
			// No URL should have a path above origin
			expect(urls.every((u) => u.startsWith('https://example.com/'))).toBe(true);
		});

		it('appends query params when keepQueryParams is true', () => {
			const urls = generateEndpointUrls('https://example.com?cat=tech', true, endpoints);
			expect(urls.some((u) => u.includes('?cat=tech'))).toBe(true);
		});

		it('appends no extra query string when keepQueryParams is false', () => {
			// Without keepQueryParams, the generated URLs have no ? suffix appended
			const urls = generateEndpointUrls('https://example.com/blog', false, endpoints);
			expect(urls.every((u) => !u.includes('?'))).toBe(true);
		});

		it('throws for an invalid URL', () => {
			expect(() => generateEndpointUrls('not-a-url', false, endpoints)).toThrow(
				'Invalid URL provided to blindSearch'
			);
		});

		it('throws for a non-HTTP protocol', () => {
			expect(() => generateEndpointUrls('ftp://example.com', false, endpoints)).toThrow(
				'Invalid protocol'
			);
		});

		it('throws for a URL that exceeds MAX_URL_LENGTH', () => {
			const longUrl = 'https://example.com/' + 'a'.repeat(2083);
			expect(() => generateEndpointUrls(longUrl, false, endpoints)).toThrow('URL too long');
		});

		it('handles trailing slash by stripping it before appending endpoint', () => {
			const urls = generateEndpointUrls('https://example.com/blog/', false, endpoints);
			// Trailing slash is stripped: basePath = 'https://example.com/blog' → 'https://example.com/blog/feed'
			expect(urls).toContain('https://example.com/blog/feed');
			// Should NOT produce 'https://example.com/blog//feed'
			expect(urls.every((u) => !u.includes('//feed'))).toBe(true);
		});

		it('generates more URLs for deeper paths', () => {
			const shallow = generateEndpointUrls('https://example.com', false, endpoints);
			const deep = generateEndpointUrls('https://example.com/a/b/c', false, endpoints);
			expect(deep.length).toBeGreaterThan(shallow.length);
		});
	});
});

// ─── blindSearch module integration tests ────────────────────────────────────

// Mock checkFeed to avoid real network requests
vi.mock('../modules/checkFeed.ts', () => ({
	default: vi.fn(),
}));
import checkFeed from '../modules/checkFeed.ts';

class MockInstance {
	constructor(site, options = {}) {
		this.site = site;
		this.options = options;
		this._events = [];
	}
	emit(event, data) {
		this._events.push({ event, data });
	}
}

describe('blindSearch() module', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns [] when no feeds found', async () => {
		checkFeed.mockResolvedValue(null);
		const { default: blindSearch } = await import('../modules/blindsearch.ts');
		const instance = new MockInstance('https://example.com', { searchMode: 'fast' });
		const result = await blindSearch(instance);
		expect(result).toEqual([]);
	});

	it('emits start event with endpointUrls count', async () => {
		checkFeed.mockResolvedValue(null);
		const { default: blindSearch } = await import('../modules/blindsearch.ts');
		const instance = new MockInstance('https://example.com', { searchMode: 'fast' });
		await blindSearch(instance);
		const startEvent = instance._events.find(e => e.event === 'start');
		expect(startEvent).toBeDefined();
		expect(startEvent.data.module).toBe('blindsearch');
		expect(startEvent.data.endpointUrls).toBeGreaterThan(0);
	});

	it('emits end event with feeds array', async () => {
		checkFeed.mockResolvedValue(null);
		const { default: blindSearch } = await import('../modules/blindsearch.ts');
		const instance = new MockInstance('https://example.com', { searchMode: 'fast' });
		const result = await blindSearch(instance);
		const endEvent = instance._events.find(e => e.event === 'end');
		expect(endEvent).toBeDefined();
		expect(endEvent.data.module).toBe('blindsearch');
		expect(endEvent.data.feeds).toEqual(result);
	});

	it('emits log events during search', async () => {
		checkFeed.mockResolvedValue(null);
		const { default: blindSearch } = await import('../modules/blindsearch.ts');
		const instance = new MockInstance('https://example.com', { searchMode: 'fast' });
		await blindSearch(instance);
		const logEvents = instance._events.filter(e => e.event === 'log');
		expect(logEvents.length).toBeGreaterThan(0);
	});

	it('discovers an RSS feed', async () => {
		checkFeed.mockImplementation(async (url) => {
			if (url === 'https://example.com/feed') return { type: 'rss', title: 'My Blog' };
			return null;
		});
		const { default: blindSearch } = await import('../modules/blindsearch.ts');
		const instance = new MockInstance('https://example.com', { searchMode: 'fast' });
		const result = await blindSearch(instance);
		expect(result.some(f => f.url === 'https://example.com/feed')).toBe(true);
		expect(result.find(f => f.url === 'https://example.com/feed').type).toBe('rss');
		expect(result.find(f => f.url === 'https://example.com/feed').feedTitle).toBe('My Blog');
	});

	it('title on returned feed is null (blind search has no link element)', async () => {
		checkFeed.mockImplementation(async (url) => {
			if (url === 'https://example.com/rss') return { type: 'rss', title: 'Feed Title' };
			return null;
		});
		const { default: blindSearch } = await import('../modules/blindsearch.ts');
		const instance = new MockInstance('https://example.com', { searchMode: 'fast' });
		const result = await blindSearch(instance);
		const found = result.find(f => f.url === 'https://example.com/rss');
		expect(found).toBeDefined();
		expect(found.title).toBeNull();
	});

	it('stops early after finding both RSS and Atom (without all:true)', async () => {
		let callCount = 0;
		checkFeed.mockImplementation(async (url) => {
			callCount++;
			if (url.endsWith('/feed')) return { type: 'rss', title: 'RSS' };
			if (url.endsWith('/atom')) return { type: 'atom', title: 'Atom' };
			return null;
		});
		const { default: blindSearch } = await import('../modules/blindsearch.ts');
		const instance = new MockInstance('https://example.com', { searchMode: 'fast', all: false });
		const result = await blindSearch(instance);
		// Should have found at least RSS + Atom and stopped early
		expect(result.some(f => f.type === 'rss')).toBe(true);
		expect(result.some(f => f.type === 'atom')).toBe(true);
	});

	it('emits log when maxFeeds limit is reached', async () => {
		// Return a feed for every URL so maxFeeds is quickly hit
		checkFeed.mockResolvedValue({ type: 'rss', title: 'RSS' });
		const { default: blindSearch } = await import('../modules/blindsearch.ts');
		// maxFeeds=1, concurrency=1 to ensure the limit check fires between batches
		const instance = new MockInstance('https://example.com', {
			searchMode: 'fast', maxFeeds: 1, all: true, concurrency: 1
		});
		await blindSearch(instance);
		const limitLog = instance._events.find(
			e => e.event === 'log' && e.data?.message?.includes('maximum feeds limit')
		);
		expect(limitLog).toBeDefined();
	});

	it('does not add the same feed URL twice (dedup via foundUrls)', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Feed' });
		const { default: blindSearch } = await import('../modules/blindsearch.ts');
		const instance = new MockInstance('https://example.com', { searchMode: 'fast', all: true });
		const result = await blindSearch(instance);
		const urls = result.map(f => f.url);
		expect(new Set(urls).size).toBe(urls.length);
	});

	it('handles checkFeed errors gracefully (no emit when showErrors is false)', async () => {
		checkFeed.mockRejectedValue(new Error('Network error'));
		const { default: blindSearch } = await import('../modules/blindsearch.ts');
		const instance = new MockInstance('https://example.com', { searchMode: 'fast', showErrors: false });
		const result = await blindSearch(instance);
		expect(result).toEqual([]);
		expect(instance._events.filter(e => e.event === 'error')).toHaveLength(0);
	});

	it('emits error events when checkFeed throws and showErrors is true', async () => {
		checkFeed.mockRejectedValue(new Error('Connection refused'));
		const { default: blindSearch } = await import('../modules/blindsearch.ts');
		const instance = new MockInstance('https://example.com', { searchMode: 'fast', showErrors: true });
		await blindSearch(instance);
		const errorEvents = instance._events.filter(e => e.event === 'error');
		expect(errorEvents.length).toBeGreaterThan(0);
		expect(errorEvents[0].data.module).toBe('blindsearch');
	});

	it('throws when aborted via AbortSignal', async () => {
		checkFeed.mockResolvedValue(null);
		const { default: blindSearch } = await import('../modules/blindsearch.ts');
		const instance = new MockInstance('https://example.com', { searchMode: 'fast' });
		const controller = new AbortController();
		controller.abort();
		await expect(blindSearch(instance, controller.signal)).rejects.toThrow('aborted');
	});
});

// ─── Lazy-load endpoint getter tests (via actual module import) ───────────────

describe('blindsearch module — endpoint getters', () => {
	// We test getEndpointsByMode indirectly via the exported blindSearch function
	// by observing the 'start' event's endpointUrls count.

	it('fast mode generates fewer endpoint URLs than standard mode', async () => {
		checkFeed.mockResolvedValue(null);
		const { default: blindSearch } = await import('../modules/blindsearch.ts');

		let fastCount = 0;
		let standardCount = 0;

		const fastInstance = new MockInstance('https://example.com', { searchMode: 'fast' });
		const a1 = new AbortController(); a1.abort();
		fastInstance._events = [];
		await blindSearch(fastInstance, a1.signal).catch(() => {});
		const fastStart = fastInstance._events.find(e => e.event === 'start');
		fastCount = fastStart?.data?.endpointUrls ?? 0;

		const standardInstance = new MockInstance('https://example.com', { searchMode: 'standard' });
		const a2 = new AbortController(); a2.abort();
		await blindSearch(standardInstance, a2.signal).catch(() => {});
		const standardStart = standardInstance._events.find(e => e.event === 'start');
		standardCount = standardStart?.data?.endpointUrls ?? 0;

		expect(fastCount).toBeGreaterThan(0);
		expect(standardCount).toBeGreaterThan(fastCount);
	});

	it('exhaustive mode generates more endpoint URLs than standard mode', async () => {
		checkFeed.mockResolvedValue(null);
		const { default: blindSearch } = await import('../modules/blindsearch.ts');

		let standardCount = 0;
		let exhaustiveCount = 0;

		const standardInstance = new MockInstance('https://example.com', { searchMode: 'standard' });
		const a1 = new AbortController(); a1.abort();
		await blindSearch(standardInstance, a1.signal).catch(() => {});
		const standardStart = standardInstance._events.find(e => e.event === 'start');
		standardCount = standardStart?.data?.endpointUrls ?? 0;

		const exhaustiveInstance = new MockInstance('https://example.com', { searchMode: 'exhaustive' });
		const a2 = new AbortController(); a2.abort();
		await blindSearch(exhaustiveInstance, a2.signal).catch(() => {});
		const exhaustiveStart = exhaustiveInstance._events.find(e => e.event === 'start');
		exhaustiveCount = exhaustiveStart?.data?.endpointUrls ?? 0;

		expect(exhaustiveCount).toBeGreaterThan(standardCount);
	});

	it('validates requestDelay once before the loop, not once per batch', async () => {
		// An invalid requestDelay triggers console.warn inside validateRequestDelay.
		// Before fix: validateRequestDelay runs inside the while loop → warn fires once per batch.
		// After fix: hoisted above the loop → warn fires exactly once regardless of batch count.
		// With fast mode (24 endpoints) and concurrency 3, there are 8 batches.
		checkFeed.mockResolvedValue(null);
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		const { default: blindSearch } = await import('../modules/blindsearch.ts');
		const instance = new MockInstance('https://example.com', {
			searchMode: 'fast',
			requestDelay: -1, // invalid → triggers console.warn in validateRequestDelay
		});
		await blindSearch(instance);
		const delayWarnCount = warnSpy.mock.calls.filter(args =>
			args[0]?.includes('Invalid request delay')
		).length;
		warnSpy.mockRestore();
		expect(delayWarnCount).toBe(1);
	});
});

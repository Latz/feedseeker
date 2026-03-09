import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import FeedSeeker from '../feed-seeker.ts';
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

/**
 * Integration Tests for FeedSeeker
 *
 * These tests verify end-to-end functionality and integration between modules.
 * Note: These tests avoid making real network calls to ensure reliability.
 */

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

describe('FeedSeeker Integration Tests', () => {
	describe('URL Normalization and Initialization', () => {
		it('should correctly normalize URLs in the constructor', () => {
			const testCases = [
				{ input: 'example.com', expected: 'https://example.com' },
				{ input: 'http://example.com', expected: 'http://example.com' },
				{ input: 'https://example.com/', expected: 'https://example.com' }, // Strips trailing slash from root
				{ input: 'https://example.com/blog', expected: 'https://example.com/blog' }
			];

			testCases.forEach(({ input, expected }) => {
				const seeker = new FeedSeeker(input);
				expect(seeker.site).toBe(expected);
			});
		});

		it('should emit an error and fail to initialize for an invalid URL', async () => {
			const seeker = new FeedSeeker('not a valid url');
			const errorSpy = vi.fn();
			seeker.on('error', errorSpy);

			await seeker.initialize();

			expect(seeker.getInitStatus()).toBe('error');
			expect(errorSpy).toHaveBeenCalled();
			expect(errorSpy.mock.calls[0][0].module).toBe('FeedSeeker');
		});
	});

	describe('Event System Integration', () => {
		it('should emit log and end events during a search', async () => {
			(metaLinksMod as Mock).mockImplementation(async (instance: FeedSeeker) => {
				instance.emit('log', { module: 'metalinks', message: 'checking' });
				return [{ url: 'https://example.com/meta.xml', type: 'rss' }];
			});

			const seeker = new FeedSeeker('example.com');
			const logEvents: any[] = [];
			const endEvents: any[] = [];

			seeker.on('log', (data) => logEvents.push(data));
			seeker.on('end', (data) => endEvents.push(data));

			await seeker.startSearch();

			expect(logEvents).toHaveLength(1);
			expect(logEvents[0].module).toBe('metalinks');

			expect(endEvents).toHaveLength(1);
			expect(endEvents[0].module).toBe('all');
		});
	});

	describe('Search Strategy Orchestration', () => {
		it('should aggregate and deduplicate results from multiple strategies', async () => {
			const feed1: Feed = { url: 'https://example.com/rss.xml', type: 'rss' };
			const feed2: Feed = { url: 'https://example.com/atom.xml', type: 'atom' };

			(metaLinksMod as Mock).mockResolvedValue([feed1]);
			(anchorsMod as Mock).mockResolvedValue([feed1, feed2]); // feed1 is a duplicate
			(blindSearchMod as Mock).mockResolvedValue([]);

			const seeker = new FeedSeeker('example.com');
			const feeds = await seeker.startSearch();

			expect(feeds).toHaveLength(2);
			expect(feeds).toEqual(expect.arrayContaining([feed1, feed2]));
			expect(metaLinksMod).toHaveBeenCalled();
			expect(anchorsMod).toHaveBeenCalled();
			expect(blindSearchMod).toHaveBeenCalled();
		});

		it('should stop searching when maxFeeds is reached', async () => {
			(metaLinksMod as Mock).mockResolvedValue([{ url: 'a' }, { url: 'b' }] as Feed[]);
			(anchorsMod as Mock).mockResolvedValue([{ url: 'c' }] as Feed[]);

			const seeker = new FeedSeeker('example.com', { maxFeeds: 1 });
			const feeds = await seeker.startSearch();

			expect(feeds).toHaveLength(1);
			expect(metaLinksMod).toHaveBeenCalled();
			// The next strategy should not have been called
			expect(anchorsMod).not.toHaveBeenCalled();
		});
	});

	describe('Options Handling', () => {
		it('should merge default and user-provided options correctly', () => {
			const userOptions = {
				timeout: 15,
				maxFeeds: 5
			};

			const seeker = new FeedSeeker('example.com', userOptions);
			const mergedOptions = seeker.options;

			expect(mergedOptions.timeout).toBe(15);
			expect(mergedOptions.maxFeeds).toBe(5);
			// Check a default option is still present
			expect(mergedOptions.keepQueryParams).toBeFalsy();
		});
	});
});

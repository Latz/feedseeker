import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { checkFeedFreshness } from '../modules/checkFreshness.ts';
import type { Feed } from '../modules/metaLinks.ts';
import type { FeedSeekerInstance } from '../modules/checkFeed.ts';

vi.mock('../modules/fetchWithTimeout.ts', () => ({ default: vi.fn() }));
import fetchWithTimeout from '../modules/fetchWithTimeout.ts';

const instance: FeedSeekerInstance = { options: { timeout: 15 } };

const rssFeed: Feed = { url: 'https://example.com/feed.xml', type: 'rss', title: null, feedTitle: null };
const atomFeed: Feed = { url: 'https://example.com/atom.xml', type: 'atom', title: null, feedTitle: null };
const jsonFeed: Feed = { url: 'https://example.com/feed.json', type: 'json', title: null, feedTitle: null };

function daysAgo(n: number): Date {
	return new Date(Date.now() - n * 86_400_000);
}

function rssContent(date: Date | string): string {
	const d = typeof date === 'string' ? date : date.toUTCString();
	return `<rss version="2.0"><channel><item><pubDate>${d}</pubDate></item></channel></rss>`;
}

function atomContent(updated: Date | string | null, published: Date | string | null = null): string {
	const u = updated ? `<updated>${typeof updated === 'string' ? updated : updated.toISOString()}</updated>` : '';
	const p = published ? `<published>${typeof published === 'string' ? published : published.toISOString()}</published>` : '';
	return `<feed xmlns="http://www.w3.org/2005/Atom"><entry>${u}${p}</entry></feed>`;
}

function jsonContent(datePub: Date | null, dateMod: Date | null = null): string {
	const item: Record<string, string> = {};
	if (datePub) item.date_published = datePub.toISOString();
	if (dateMod) item.date_modified = dateMod.toISOString();
	return JSON.stringify({ items: [item] });
}

function mockFetch(content: string): void {
	(fetchWithTimeout as Mock).mockResolvedValue({ ok: true, text: async () => content });
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe('checkFeedFreshness', () => {
	describe('RSS feeds', () => {
		it('returns true for recent pubDate', async () => {
			mockFetch(rssContent(daysAgo(5)));
			expect(await checkFeedFreshness(rssFeed, 30, instance)).toBe(true);
		});

		it('returns false for old pubDate', async () => {
			mockFetch(rssContent(daysAgo(60)));
			expect(await checkFeedFreshness(rssFeed, 30, instance)).toBe(false);
		});

		it('returns true for feed published just within the threshold', async () => {
			mockFetch(rssContent(daysAgo(29)));
			expect(await checkFeedFreshness(rssFeed, 30, instance)).toBe(true);
		});

		it('returns true when no <item> in feed', async () => {
			mockFetch('<rss version="2.0"><channel></channel></rss>');
			expect(await checkFeedFreshness(rssFeed, 30, instance)).toBe(true);
		});

		it('returns true when <item> has no <pubDate>', async () => {
			mockFetch('<rss version="2.0"><channel><item><title>No date</title></item></channel></rss>');
			expect(await checkFeedFreshness(rssFeed, 30, instance)).toBe(true);
		});

		it('returns true for invalid date string', async () => {
			mockFetch(rssContent('not a date'));
			expect(await checkFeedFreshness(rssFeed, 30, instance)).toBe(true);
		});
	});

	describe('Atom feeds', () => {
		it('returns true for recent <updated>', async () => {
			mockFetch(atomContent(daysAgo(3)));
			expect(await checkFeedFreshness(atomFeed, 30, instance)).toBe(true);
		});

		it('returns false for old <updated>', async () => {
			mockFetch(atomContent(daysAgo(90)));
			expect(await checkFeedFreshness(atomFeed, 30, instance)).toBe(false);
		});

		it('falls back to <published> when no <updated>', async () => {
			mockFetch(atomContent(null, daysAgo(5)));
			expect(await checkFeedFreshness(atomFeed, 30, instance)).toBe(true);
		});

		it('returns false for old <published> fallback', async () => {
			mockFetch(atomContent(null, daysAgo(90)));
			expect(await checkFeedFreshness(atomFeed, 30, instance)).toBe(false);
		});

		it('returns true when no <entry>', async () => {
			mockFetch('<feed xmlns="http://www.w3.org/2005/Atom"><title>Test</title></feed>');
			expect(await checkFeedFreshness(atomFeed, 30, instance)).toBe(true);
		});
	});

	describe('JSON feeds', () => {
		it('returns true for recent date_published', async () => {
			mockFetch(jsonContent(daysAgo(7)));
			expect(await checkFeedFreshness(jsonFeed, 30, instance)).toBe(true);
		});

		it('returns false for old date_published', async () => {
			mockFetch(jsonContent(daysAgo(60)));
			expect(await checkFeedFreshness(jsonFeed, 30, instance)).toBe(false);
		});

		it('falls back to date_modified when no date_published', async () => {
			mockFetch(jsonContent(null, daysAgo(5)));
			expect(await checkFeedFreshness(jsonFeed, 30, instance)).toBe(true);
		});

		it('returns false for old date_modified fallback', async () => {
			mockFetch(jsonContent(null, daysAgo(60)));
			expect(await checkFeedFreshness(jsonFeed, 30, instance)).toBe(false);
		});

		it('returns true when items array is empty', async () => {
			mockFetch(JSON.stringify({ items: [] }));
			expect(await checkFeedFreshness(jsonFeed, 30, instance)).toBe(true);
		});

		it('returns true when item has no date fields', async () => {
			mockFetch(JSON.stringify({ items: [{ title: 'No date' }] }));
			expect(await checkFeedFreshness(jsonFeed, 30, instance)).toBe(true);
		});

		it('returns true for invalid JSON', async () => {
			mockFetch('not json at all');
			expect(await checkFeedFreshness(jsonFeed, 30, instance)).toBe(true);
		});
	});

	describe('fetch failures', () => {
		it('returns true when fetch throws', async () => {
			(fetchWithTimeout as Mock).mockRejectedValue(new Error('Network error'));
			expect(await checkFeedFreshness(rssFeed, 30, instance)).toBe(true);
		});

		it('returns true when response is not ok', async () => {
			(fetchWithTimeout as Mock).mockResolvedValue({ ok: false });
			expect(await checkFeedFreshness(rssFeed, 30, instance)).toBe(true);
		});
	});

	describe('days threshold', () => {
		it('respects custom days value (7 days)', async () => {
			mockFetch(rssContent(daysAgo(10)));
			expect(await checkFeedFreshness(rssFeed, 7, instance)).toBe(false);
		});

		it('respects custom days value (60 days)', async () => {
			mockFetch(rssContent(daysAgo(45)));
			expect(await checkFeedFreshness(rssFeed, 60, instance)).toBe(true);
		});
	});

	describe('instance options', () => {
		it('passes timeout and insecure from instance to fetchWithTimeout', async () => {
			mockFetch(rssContent(daysAgo(1)));
			const inst: FeedSeekerInstance = { options: { timeout: 5, insecure: true } };
			await checkFeedFreshness(rssFeed, 30, inst);
			expect(fetchWithTimeout).toHaveBeenCalledWith(
				rssFeed.url,
				expect.objectContaining({ timeout: 5000, insecure: true })
			);
		});
	});
});

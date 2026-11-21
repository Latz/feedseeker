import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { readFileSync } from 'node:fs';

vi.mock('../modules/fetchWithTimeout.ts', () => ({ default: vi.fn() }));

import fetchWithTimeout from '../modules/fetchWithTimeout.ts';
import { checkFeedFreshness } from '../modules/checkFreshness.ts';
import type { Feed } from '../modules/metaLinks.ts';

const mockFetch = fetchWithTimeout as unknown as Mock;
const instance = { options: { timeout: 15 } };
const NOW = new Date('2026-06-15T12:00:00Z');
const DAY = 86_400_000;
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY);

let n = 0;
/** Feed at a unique URL so the discovery content cache never interferes. */
const feedOf = (type: Feed['type']): Feed => ({
	url: `https://fresh${++n}.example/feed`,
	type,
	title: null,
	feedTitle: null
});
const serve = (body: string, status = 200) =>
	mockFetch.mockResolvedValue(new Response(body, { status }));

beforeEach(() => {
	vi.useFakeTimers({ toFake: ['Date'] });
	vi.setSystemTime(NOW);
	mockFetch.mockReset();
});
afterEach(() => vi.useRealTimers());

describe('checkFeedFreshness — boundary', () => {
	const rss = (date: Date) =>
		`<rss version="2.0"><channel><item><pubDate>${date.toUTCString()}</pubDate></item></channel></rss>`;

	it('counts an item from exactly N days ago as fresh', async () => {
		serve(rss(daysAgo(30)));
		expect(await checkFeedFreshness(feedOf('rss'), 30, instance)).toBe(true);
	});

	it('counts an item one second older than N days as stale', async () => {
		serve(rss(new Date(daysAgo(30).getTime() - 1000)));
		expect(await checkFeedFreshness(feedOf('rss'), 30, instance)).toBe(false);
	});
});

describe('checkFeedFreshness — realistic feed markup', () => {
	const old = daysAgo(400);

	it('reads RSS 1.0 items that carry an rdf:about attribute', async () => {
		serve(
			`<rdf:RDF><channel rdf:about="x"><title>T</title></channel>\n<item rdf:about="https://a.example/1">\n  <title>t</title>\n  <pubDate>${old.toUTCString()}</pubDate>\n</item></rdf:RDF>`
		);
		expect(await checkFeedFreshness(feedOf('rss'), 30, instance)).toBe(false);
	});

	it('reads multi-line Atom entries with attributes and padded dates', async () => {
		serve(
			`<feed xmlns="http://www.w3.org/2005/Atom">\n<entry xml:lang="en">\n  <title>t</title>\n  <updated>\n    ${old.toISOString()}\n  </updated>\n</entry></feed>`
		);
		expect(await checkFeedFreshness(feedOf('atom'), 30, instance)).toBe(false);
	});

	it('falls back to a padded <published> when an Atom entry has no <updated>', async () => {
		serve(
			`<feed>\n<entry>\n  <published>\n    ${old.toISOString()}\n  </published>\n</entry></feed>`
		);
		expect(await checkFeedFreshness(feedOf('atom'), 30, instance)).toBe(false);
	});
});

describe('checkFeedFreshness — unreachable feeds are kept', () => {
	it('does not judge a feed by the body of an error page', async () => {
		// even if the error body happens to contain an old item
		serve(
			`<rss><channel><item><pubDate>${daysAgo(400).toUTCString()}</pubDate></item></channel></rss>`,
			404
		);
		expect(await checkFeedFreshness(feedOf('rss'), 30, instance)).toBe(true);
	});
});

describe('checkFeedFreshness — RSS 1.0 (dc:date)', () => {
	// Real feed: dates are <dc:date>, there is no <pubDate>; first item is from 2026-08-30
	const mainichi = readFileSync(new URL('./fixtures/rdf-mainichi.xml', import.meta.url), 'utf-8');

	it('judges an RSS 1.0 feed by the dc:date of its first item', async () => {
		vi.setSystemTime(new Date('2026-11-22T00:00:00Z'));
		serve(mainichi);
		expect(await checkFeedFreshness(feedOf('rss'), 30, instance)).toBe(false);
		serve(mainichi);
		expect(await checkFeedFreshness(feedOf('rss'), 120, instance)).toBe(true);
	});

	it('prefers pubDate over dc:date when an item has both', async () => {
		serve(
			`<rss version="2.0"><channel><item><dc:date>${daysAgo(400).toISOString()}</dc:date><pubDate>${daysAgo(1).toUTCString()}</pubDate></item></channel></rss>`
		);
		expect(await checkFeedFreshness(feedOf('rss'), 30, instance)).toBe(true);
	});

	it('does not mistake an <items> table of contents for an item', async () => {
		// dates outside any real <item> must be ignored: no item date -> kept
		serve(
			`<rdf:RDF><channel><items><rdf:Seq><rdf:li/></rdf:Seq></items><dc:date>${daysAgo(400).toISOString()}</dc:date></channel><item rdf:about="x"><title>t</title></item></rdf:RDF>`
		);
		expect(await checkFeedFreshness(feedOf('rss'), 30, instance)).toBe(true);
	});
});

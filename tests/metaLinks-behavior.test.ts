import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { parseHTML } from 'linkedom';

vi.mock('../modules/checkFeed/index.ts', () => ({ default: vi.fn() }));

import checkFeed from '../modules/checkFeed/index.ts';
import metaLinks from '../modules/metaLinks.ts';

const mockCheckFeed = checkFeed as unknown as Mock;
const SITE = 'https://example.com';

type Event = { event: string; data: any };
function makeInstance(head: string, options: Record<string, unknown> = {}) {
	const events: Event[] = [];
	const { document } = parseHTML(`<html><head>${head}</head><body></body></html>`);
	const instance = {
		site: SITE,
		document,
		options,
		emit: (event: string, data: unknown) => events.push({ event, data })
	};
	return { instance: instance as any, events };
}
const checked = () => mockCheckFeed.mock.calls.map((c) => c[0] as string);
const feedsAt = (...urls: string[]) =>
	mockCheckFeed.mockImplementation(async (url: string) =>
		urls.includes(url) ? { type: 'rss', title: 'FT' } : null
	);

// One link per discovery phase: explicit feed type, rel=alternate + feed-ish type, rel=alternate + feed-ish href
const PHASE1 = '<link type="application/rss+xml" href="/p1" title="One">';
const PHASE2 = '<link rel="alternate" type="text/xml+rss" href="/p2">';
const PHASE3 = '<link rel="alternate" href="/p3.atom">';

beforeEach(() => {
	mockCheckFeed.mockReset();
	mockCheckFeed.mockResolvedValue(null);
});

describe('metaLinks — discovery phases', () => {
	it('checks the three kinds of link in order, each URL once', async () => {
		const { instance } = makeInstance(
			PHASE3 + PHASE2 + PHASE1 + '<link rel="alternate" type="application/rss+xml" href="/p1">'
		);
		await metaLinks(instance);
		expect(checked()).toEqual([`${SITE}/p1`, `${SITE}/p2`, `${SITE}/p3.atom`]);
	});

	it('ignores rel=alternate links that do not look like feeds and links without href', async () => {
		const { instance } = makeInstance(
			'<link rel="alternate" hreflang="de" href="/de/"><link type="application/rss+xml">'
		);
		await metaLinks(instance);
		expect(checked()).toEqual([]);
	});

	it('records feeds with the cleaned link title and the feed title', async () => {
		feedsAt(`${SITE}/p1`, `${SITE}/p2`);
		const { instance } = makeInstance(PHASE1 + PHASE2);
		expect(await metaLinks(instance)).toEqual([
			{ url: `${SITE}/p1`, title: 'One', type: 'rss', feedTitle: 'FT' },
			{ url: `${SITE}/p2`, title: null, type: 'rss', feedTitle: 'FT' }
		]);
	});
});

describe('metaLinks — maxFeeds', () => {
	it('skips later phases once the limit is reached', async () => {
		feedsAt(`${SITE}/p1`);
		const { instance, events } = makeInstance(PHASE1 + PHASE2 + PHASE3, { maxFeeds: 1 });
		expect(await metaLinks(instance)).toHaveLength(1);
		expect(checked()).toEqual([`${SITE}/p1`]);
		expect(events.filter((e) => e.data?.message?.includes('maximum')).map((e) => e.data)).toEqual([
			{
				module: 'metalinks',
				message: 'Stopped due to reaching maximum feeds limit: 1 feeds found (max 1 allowed).'
			}
		]);
	});

	it('skips later batches of the same phase once the limit is reached', async () => {
		const links = Array.from(
			{ length: 7 },
			(_, i) => `<link type="application/rss+xml" href="/f${i}">`
		).join('');
		feedsAt(`${SITE}/f0`);
		const { instance } = makeInstance(links, { maxFeeds: 1 });
		await metaLinks(instance);
		// first batch of 5 runs in parallel, the second batch is never started
		expect(checked()).toEqual([0, 1, 2, 3, 4].map((i) => `${SITE}/f${i}`));
	});

	it('keeps going below the limit, and without one', async () => {
		feedsAt(`${SITE}/p1`, `${SITE}/p2`, `${SITE}/p3.atom`);
		const limited = makeInstance(PHASE1 + PHASE2 + PHASE3, { maxFeeds: 2 });
		expect(await metaLinks(limited.instance)).toHaveLength(2);
		expect(limited.events.some((e) => e.data?.message?.includes('maximum'))).toBe(true);
		const unlimited = makeInstance(PHASE1 + PHASE2 + PHASE3);
		expect(await metaLinks(unlimited.instance)).toHaveLength(3);
		expect(unlimited.events.some((e) => e.data?.message?.includes('maximum'))).toBe(false);
	});
});

describe('metaLinks — events', () => {
	it('emits start, one "Checking feed" log per URL, and end', async () => {
		const { instance, events } = makeInstance(PHASE1);
		const feeds = await metaLinks(instance);
		expect(events).toEqual([
			{ event: 'start', data: { module: 'metalinks', niceName: 'Meta Links' } },
			{ event: 'log', data: { module: 'metalinks', message: `Checking feed: ${SITE}/p1` } },
			{ event: 'end', data: { module: 'metalinks', feeds } }
		]);
	});

	it('passes a rejection logger to checkFeed only with --verbose', async () => {
		const { instance, events } = makeInstance(PHASE1, { verbose: true });
		mockCheckFeed.mockImplementation(
			async (_u: string, _c: string, _i: unknown, onReject?: (r: string) => void) => {
				onReject?.('not a feed');
				return null;
			}
		);
		await metaLinks(instance);
		expect(events).toContainEqual({
			event: 'log',
			data: { module: 'metalinks', url: `${SITE}/p1`, reason: 'not a feed' }
		});
		mockCheckFeed.mockClear();
		await metaLinks(makeInstance(PHASE1).instance);
		expect(mockCheckFeed.mock.calls[0][3]).toBeUndefined();
	});
});

describe('metaLinks — errors', () => {
	it('reports an unresolvable href with showErrors', async () => {
		const { instance, events } = makeInstance('<link type="application/rss+xml" href="//[bad">', {
			showErrors: true
		});
		await metaLinks(instance);
		const errors = events.filter((e) => e.event === 'error').map((e) => e.data);
		expect(errors).toHaveLength(1);
		expect(errors[0].module).toBe('metalinks');
		expect(errors[0].explanation).toMatch(
			/^Invalid URL found in meta link: .+\. Unable to construct a valid URL\.$/
		);
		expect(errors[0].suggestion).toBe('Check the meta link href attribute for malformed URLs.');
		expect(checked()).toEqual([]);
	});

	it('reports a failing feed check with showErrors and keeps going', async () => {
		mockCheckFeed.mockImplementation(async (url: string) => {
			if (url.endsWith('/p1')) throw new Error('boom');
			return { type: 'rss', title: null };
		});
		const { instance, events } = makeInstance(PHASE1 + PHASE2, { showErrors: true });
		expect((await metaLinks(instance)).map((f) => f.url)).toEqual([`${SITE}/p2`]);
		const errors = events.filter((e) => e.event === 'error').map((e) => e.data);
		expect(errors).toHaveLength(1);
		expect(errors[0]).toMatchObject({ module: 'metalinks', error: 'boom' });
		expect(errors[0].explanation).toContain('meta link tag');
		expect(errors[0].suggestion).toContain('Check if the meta link URL is accessible');
	});

	it('reports nothing for links that simply are not feeds', async () => {
		const { instance, events } = makeInstance(PHASE1, { showErrors: true });
		await metaLinks(instance);
		expect(events.some((e) => e.event === 'error')).toBe(false);
	});

	it('stays silent about errors without showErrors', async () => {
		mockCheckFeed.mockRejectedValue(new Error('boom'));
		const { instance, events } = makeInstance(
			PHASE1 + '<link type="application/rss+xml" href="//[bad">'
		);
		await metaLinks(instance);
		expect(events.some((e) => e.event === 'error')).toBe(false);
	});
});

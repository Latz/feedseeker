import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { parseHTML } from 'linkedom';

vi.mock('../modules/checkFeed/index.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/fetchWithTimeout.ts', () => ({ default: vi.fn() }));

import checkFeed from '../modules/checkFeed/index.ts';
import metaLinks from '../modules/metaLinks.ts';
import checkAllAnchors from '../modules/anchors/index.ts';

const mockCheckFeed = checkFeed as unknown as Mock;
const SITE = 'https://a.com';

type Event = { event: string; data: any };
function makeInstance(html: string, options: Record<string, unknown>) {
	const events: Event[] = [];
	const { document } = parseHTML(html);
	const instance = {
		site: SITE,
		document,
		options,
		emit: (event: string, data: unknown) => events.push({ event, data })
	};
	return { instance: instance as any, events };
}
const limitLogs = (events: Event[]) =>
	events.filter((e) => e.event === 'log' && e.data.message?.includes('maximum feeds limit'));

beforeEach(() => {
	mockCheckFeed.mockReset();
	// every candidate is a feed, so all parallel checks succeed at once
	mockCheckFeed.mockResolvedValue({ type: 'rss', title: 'T' });
});

describe('maxFeeds with parallel checks', () => {
	it('metaLinks never returns more than maxFeeds and logs the limit once', async () => {
		const head = Array.from(
			{ length: 5 },
			(_, i) => `<link rel="alternate" type="application/rss+xml" href="/f${i}">`
		).join('');
		const { instance, events } = makeInstance(`<html><head>${head}</head><body></body></html>`, {
			maxFeeds: 2
		});
		const feeds = await metaLinks(instance);
		expect(feeds).toHaveLength(2);
		expect(limitLogs(events)).toHaveLength(1);
	});

	it('anchors never returns more than maxFeeds (anchor phase)', async () => {
		const body = Array.from({ length: 6 }, (_, i) => `<a href="/f${i}">f</a>`).join('');
		const { instance, events } = makeInstance(`<html><body>${body}</body></html>`, {
			maxFeeds: 1,
			concurrency: 3
		});
		const feeds = await checkAllAnchors(instance);
		expect(feeds).toHaveLength(1);
		expect(limitLogs(events).length).toBeLessThanOrEqual(1);
	});

	it('anchors never returns more than maxFeeds (plain-text phase)', async () => {
		const text = Array.from({ length: 6 }, (_, i) => `https://a.com/t${i}`).join(' ');
		const { instance } = makeInstance(`<html><body><p>${text}</p></body></html>`, {
			maxFeeds: 1,
			concurrency: 3
		});
		expect(await checkAllAnchors(instance)).toHaveLength(1);
	});
});

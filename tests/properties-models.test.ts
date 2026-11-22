/**
 * Property-based tests that need a mocked checkFeed or compare against a
 * simple model: random inputs, invariants that must always hold.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import * as fc from 'fast-check';
import { parseHTML } from 'linkedom';

vi.mock('../modules/checkFeed/index.ts', () => ({
	default: vi.fn(),
	ChallengeResponseError: class extends Error {}
}));

import checkFeed from '../modules/checkFeed/index.ts';
import blindSearch from '../modules/blindsearch/index.ts';
import checkAllAnchors from '../modules/anchors/index.ts';
import metaLinks from '../modules/metaLinks.ts';
import { generateEndpointUrls } from '../modules/blindsearch/urlGeneration.ts';
import { getEndpointsByMode } from '../modules/blindsearch/validation.ts';
import { acquireHostSlot } from '../modules/hostRateLimiter.ts';
import EventEmitter from '../modules/eventEmitter.ts';

const mockCheckFeed = checkFeed as unknown as Mock;
const SITE = 'https://example.com';

beforeEach(() => {
	mockCheckFeed.mockReset();
});

/** checkFeed answers "feed" for the given URLs, after a random small delay so
 * parallel checks finish in varying order. */
function feedsAt(feedUrls: Set<string>, delays: number[]) {
	let call = 0;
	mockCheckFeed.mockImplementation(async (url: string) => {
		const delay = delays[call++ % delays.length];
		if (delay) await new Promise((r) => setTimeout(r, delay));
		return feedUrls.has(url) ? { type: 'rss', title: null } : null;
	});
}

function expectValidResult(feeds: { url: string }[], feedUrls: Set<string>, maxFeeds: number) {
	if (maxFeeds > 0) expect(feeds.length).toBeLessThanOrEqual(maxFeeds);
	expect(new Set(feeds.map((f) => f.url)).size).toBe(feeds.length);
	for (const f of feeds) expect(feedUrls.has(f.url)).toBe(true);
}

const searchSettings = fc.record({
	maxFeeds: fc.integer({ min: 0, max: 4 }),
	concurrency: fc.integer({ min: 1, max: 6 }),
	delays: fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 1, maxLength: 6 })
});

describe('maxFeeds holds under any parallel timing', () => {
	const candidates = generateEndpointUrls(SITE, false, getEndpointsByMode('fast'));

	it('blindSearch', async () => {
		await fc.assert(
			fc.asyncProperty(
				fc.subarray(candidates),
				searchSettings,
				fc.boolean(),
				async (feeds, { maxFeeds, concurrency, delays }, all) => {
					const feedUrls = new Set(feeds);
					feedsAt(feedUrls, delays);
					const instance = {
						site: SITE,
						options: { searchMode: 'fast', maxFeeds, concurrency, all },
						emit: () => {}
					} as any;
					expectValidResult(await blindSearch(instance), feedUrls, maxFeeds);
				}
			),
			{ numRuns: 60 }
		);
	});

	const paths = fc.uniqueArray(fc.stringMatching(/^[a-z]{1,6}$/), { minLength: 1, maxLength: 12 });

	it('anchors', async () => {
		await fc.assert(
			fc.asyncProperty(
				paths,
				fc.infiniteStream(fc.boolean()),
				searchSettings,
				async (names, isFeed, { maxFeeds, concurrency, delays }) => {
					const urls = names.map((n) => `${SITE}/${n}`);
					const feedUrls = new Set(urls.filter(() => isFeed.next().value));
					feedsAt(feedUrls, delays);
					const { document } = parseHTML(
						`<html><body>${names.map((n) => `<a href="/${n}">${n}</a>`).join('')}</body></html>`
					);
					const instance = {
						site: SITE,
						document,
						options: { maxFeeds, concurrency },
						emit: () => {}
					} as any;
					expectValidResult(await checkAllAnchors(instance), feedUrls, maxFeeds);
				}
			),
			{ numRuns: 60 }
		);
	});

	it('metaLinks', async () => {
		await fc.assert(
			fc.asyncProperty(
				paths,
				fc.infiniteStream(fc.boolean()),
				searchSettings,
				async (names, isFeed, { maxFeeds, delays }) => {
					const urls = names.map((n) => `${SITE}/${n}`);
					const feedUrls = new Set(urls.filter(() => isFeed.next().value));
					feedsAt(feedUrls, delays);
					const head = names
						.map((n) => `<link rel="alternate" type="application/rss+xml" href="/${n}">`)
						.join('');
					const { document } = parseHTML(`<html><head>${head}</head><body></body></html>`);
					const instance = { site: SITE, document, options: { maxFeeds }, emit: () => {} } as any;
					expectValidResult(await metaLinks(instance), feedUrls, maxFeeds);
				}
			),
			{ numRuns: 60 }
		);
	});
});

describe('hostRateLimiter model', () => {
	// Operations on one host: request a slot, or release the oldest held slot with a status
	const op = fc.oneof(
		fc.constant({ kind: 'acquire' as const }),
		fc.record({
			kind: fc.constant('release' as const),
			status: fc.constantFrom(200, 404, 429, 403)
		})
	);

	it('never runs more than 2 requests at once (1 after a 429) and serves waiters in order', async () => {
		let n = 0;
		await fc.assert(
			fc.asyncProperty(fc.array(op, { maxLength: 25 }), async (ops) => {
				const host = `model${++n}.limiter.test`;
				let requested = 0;
				const granted: number[] = []; // request numbers, in grant order
				const held: Array<(r: Response | null) => void> = [];
				let throttled = false;
				for (const o of ops) {
					const grantsBefore = granted.length;
					if (o.kind === 'acquire') {
						const id = ++requested;
						void acquireHostSlot(host).then((release) => {
							granted.push(id);
							held.push(release);
						});
					} else if (held.length > 0) {
						const before = granted.length;
						held.shift()!(new Response('', { status: o.status }));
						if (o.status === 429) throttled = true;
						await new Promise((r) => setTimeout(r, 0));
						const newlyGranted = granted.length - before;
						expect(newlyGranted).toBeLessThanOrEqual(1);
					}
					await new Promise((r) => setTimeout(r, 0));
					expect(held.length).toBeLessThanOrEqual(2);
					// during the 429 cooldown a new slot is only handed out when it is the only one
					if (throttled && granted.length > grantsBefore)
						expect(held.length).toBeLessThanOrEqual(1);
					// FIFO: grants happen in request order
					expect(granted).toEqual([...granted].sort((a, b) => a - b));
				}
				// release everything so no waiter is left behind
				while (held.length > 0) {
					held.shift()!(null);
					await new Promise((r) => setTimeout(r, 0));
				}
				expect(granted.length).toBe(requested);
			}),
			{ numRuns: 100 }
		);
	});
});

describe('EventEmitter model', () => {
	const event = fc.constantFrom('a', 'b');
	const listenerId = fc.integer({ min: 0, max: 3 });
	const op = fc.oneof(
		fc.record({ kind: fc.constant('on' as const), event, id: listenerId }),
		fc.record({ kind: fc.constant('once' as const), event, id: listenerId }),
		fc.record({ kind: fc.constant('off' as const), event, id: listenerId }),
		fc.record({ kind: fc.constant('emit' as const), event })
	);

	it('calls listeners exactly as a simple model predicts', () => {
		fc.assert(
			fc.property(fc.array(op, { maxLength: 30 }), (ops) => {
				const emitter = new EventEmitter({ maxListeners: 0 });
				const calls: string[] = [];
				const listeners = [0, 1, 2, 3].map((id) => () => {
					calls.push(String(id));
				});
				// model: per event, ordered list of [id, once] — a function can be registered once per event
				const model = new Map<string, Array<{ id: number; once: boolean }>>();
				const expected: string[] = [];
				for (const o of ops) {
					const list = model.get(o.event) ?? [];
					model.set(o.event, list);
					if (o.kind === 'on' || o.kind === 'once') {
						(o.kind === 'on' ? emitter.on : emitter.once).call(emitter, o.event, listeners[o.id]);
						// on() with an already registered function is a no-op (Set); once() always adds a wrapper
						if (o.kind === 'once' || !list.some((l) => l.id === o.id && !l.once)) {
							list.push({ id: o.id, once: o.kind === 'once' });
						}
					} else if (o.kind === 'off') {
						emitter.off(o.event, listeners[o.id]);
						model.set(
							o.event,
							list.filter((l) => l.id !== o.id)
						);
					} else {
						const had = list.length > 0;
						expect(emitter.emit(o.event)).toBe(had);
						expected.push(...list.map((l) => String(l.id)));
						model.set(
							o.event,
							list.filter((l) => !l.once)
						);
					}
					expect(emitter.listenerCount(o.event)).toBe(model.get(o.event)!.length);
				}
				expect(calls).toEqual(expected);
			})
		);
	});
});

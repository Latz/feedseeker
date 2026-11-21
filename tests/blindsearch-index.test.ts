import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

vi.mock('../modules/checkFeed/index.ts', () => ({
	default: vi.fn(),
	ChallengeResponseError: class ChallengeResponseError extends Error {
		constructor(url: string) {
			super(`Fetch of ${url} was blocked by a bot-mitigation challenge`);
			this.name = 'ChallengeResponseError';
		}
	}
}));

import checkFeed, { ChallengeResponseError } from '../modules/checkFeed/index.ts';
import blindSearch from '../modules/blindsearch/index.ts';
import { generateEndpointUrls } from '../modules/blindsearch/urlGeneration.ts';
import { getEndpointsByMode } from '../modules/blindsearch/validation.ts';

const mockCheckFeed = checkFeed as unknown as Mock;
const SITE = 'https://example.com';
// Exactly the candidate list blindSearch generates for SITE in fast mode
const URLS = generateEndpointUrls(SITE, false, getEndpointsByMode('fast'));

type Event = { event: string; data: any };

function makeInstance(options?: Record<string, unknown>, site = SITE) {
	const events: Event[] = [];
	const instance = {
		site,
		options,
		emit: (event: string, data: unknown) => events.push({ event, data })
	};
	return { instance: instance as any, events };
}

/** Sequential run (concurrency 1) so call order and counts are deterministic. */
const seq = (extra: Record<string, unknown> = {}) => ({
	searchMode: 'fast',
	concurrency: 1,
	...extra
});

/** Make checkFeed answer per candidate index; everything else is "no feed". */
function feedsAt(
	map: Record<number, { type: string; title?: string | null; resolvedUrl?: string }>
) {
	mockCheckFeed.mockImplementation(async (url: string) => {
		const i = URLS.indexOf(url);
		const hit = map[i];
		return hit ? { title: null, ...hit } : null;
	});
}

const calledUrls = () => mockCheckFeed.mock.calls.map((c) => c[0]);
const logMessages = (events: Event[]) =>
	events.filter((e) => e.event === 'log' && e.data.message).map((e) => e.data.message as string);

beforeEach(() => {
	mockCheckFeed.mockReset();
	mockCheckFeed.mockResolvedValue(null);
});

describe('blindSearch — candidate iteration', () => {
	it('sanity: fast mode yields several candidates', () => {
		expect(URLS.length).toBeGreaterThan(4);
	});

	it('checks every candidate exactly once, in order, when nothing is found', async () => {
		const { instance } = makeInstance(seq());
		expect(await blindSearch(instance)).toEqual([]);
		expect(calledUrls()).toEqual(URLS);
		// blindSearch never pre-fetches: checkFeed must fetch each URL itself
		expect(mockCheckFeed.mock.calls.every((c) => c[1] === '')).toBe(true);
	});

	it('works without any options object (defaults to standard mode)', async () => {
		const { instance } = makeInstance(undefined);
		await blindSearch(instance);
		const standard = generateEndpointUrls(SITE, false, getEndpointsByMode('standard'));
		expect(new Set(calledUrls())).toEqual(new Set(standard));
		expect(mockCheckFeed.mock.calls[0][3]).toBeUndefined();
	});

	it('drops query params by default', async () => {
		const { instance } = makeInstance(seq(), `${SITE}/?lang=de`);
		await blindSearch(instance);
		expect(calledUrls().length).toBeGreaterThan(0);
		expect(calledUrls().some((u) => u.endsWith('?lang=de'))).toBe(false);
	});

	it('keeps query params with keepQueryParams', async () => {
		const { instance } = makeInstance(seq({ keepQueryParams: true }), `${SITE}/?lang=de`);
		await blindSearch(instance);
		expect(calledUrls().length).toBeGreaterThan(0);
		expect(calledUrls().every((u) => u.endsWith('?lang=de'))).toBe(true);
	});
});

describe('blindSearch — early termination by feed type', () => {
	it('stops right after finding both RSS and Atom', async () => {
		feedsAt({ 0: { type: 'rss', title: 'R' }, 1: { type: 'atom', title: 'A' } });
		const { instance } = makeInstance(seq());
		const feeds = await blindSearch(instance);
		expect(calledUrls()).toEqual(URLS.slice(0, 2));
		expect(feeds).toEqual([
			{ url: URLS[0], title: null, type: 'rss', feedTitle: 'R' },
			{ url: URLS[1], title: null, type: 'atom', feedTitle: 'A' }
		]);
	});

	it('stops after Atom then RSS as well (order independent)', async () => {
		feedsAt({ 0: { type: 'atom' }, 2: { type: 'rss' } });
		const { instance } = makeInstance(seq());
		await blindSearch(instance);
		expect(calledUrls()).toEqual(URLS.slice(0, 3));
	});

	it('keeps searching when only RSS feeds are found', async () => {
		feedsAt({ 0: { type: 'rss' }, 1: { type: 'rss' } });
		const { instance } = makeInstance(seq());
		await blindSearch(instance);
		expect(calledUrls()).toEqual(URLS);
	});

	it('keeps searching when only Atom feeds are found', async () => {
		feedsAt({ 0: { type: 'atom' }, 1: { type: 'atom' } });
		const { instance } = makeInstance(seq());
		await blindSearch(instance);
		expect(calledUrls()).toEqual(URLS);
	});

	it('does not count a JSON feed as RSS or Atom', async () => {
		feedsAt({ 0: { type: 'rss' }, 1: { type: 'json' } });
		const { instance } = makeInstance(seq());
		const feeds = await blindSearch(instance);
		expect(calledUrls()).toEqual(URLS);
		expect(feeds.map((f) => f.type)).toEqual(['rss', 'json']);
	});

	it('does not count a JSON feed as RSS when paired with Atom', async () => {
		feedsAt({ 0: { type: 'atom' }, 1: { type: 'json' } });
		const { instance } = makeInstance(seq());
		await blindSearch(instance);
		expect(calledUrls()).toEqual(URLS);
	});

	it('with all:true, checks every candidate even after RSS + Atom', async () => {
		feedsAt({ 0: { type: 'rss' }, 1: { type: 'atom' } });
		const { instance } = makeInstance(seq({ all: true }));
		await blindSearch(instance);
		expect(calledUrls()).toEqual(URLS);
	});
});

describe('blindSearch — maxFeeds', () => {
	it('stops at exactly maxFeeds and logs the limit once', async () => {
		mockCheckFeed.mockResolvedValue({ type: 'rss', title: null });
		const { instance, events } = makeInstance(seq({ all: true, maxFeeds: 2 }));
		const feeds = await blindSearch(instance);
		expect(feeds).toHaveLength(2);
		expect(calledUrls()).toEqual(URLS.slice(0, 2));
		const limitLogs = events.filter(
			(e) => e.event === 'log' && e.data.message?.includes('maximum feeds limit')
		);
		expect(limitLogs.map((e) => e.data)).toEqual([
			{
				module: 'blindsearch',
				message: 'Stopped due to reaching maximum feeds limit: 2 feeds found (max 2 allowed).'
			}
		]);
	});

	it('logs the limit even when it is reached on the last candidate', async () => {
		feedsAt({ [URLS.length - 1]: { type: 'rss' } });
		const { instance, events } = makeInstance(seq({ all: true, maxFeeds: 1 }));
		await blindSearch(instance);
		expect(logMessages(events).filter((m) => m.includes('maximum feeds limit'))).toHaveLength(1);
	});

	it('never returns more than maxFeeds with parallel workers', async () => {
		mockCheckFeed.mockResolvedValue({ type: 'rss', title: null });
		const { instance } = makeInstance({
			searchMode: 'fast',
			all: true,
			maxFeeds: 1,
			concurrency: 3
		});
		expect(await blindSearch(instance)).toHaveLength(1);
	});

	it('maxFeeds 0 means unlimited', async () => {
		mockCheckFeed.mockResolvedValue({ type: 'rss', title: null });
		const { instance } = makeInstance(seq({ all: true, maxFeeds: 0 }));
		expect(await blindSearch(instance)).toHaveLength(URLS.length);
	});
});

describe('blindSearch — deduplication', () => {
	it('collapses candidates that resolve to the same feed', async () => {
		const resolvedUrl = `${SITE}/feed/`;
		feedsAt({ 0: { type: 'rss', resolvedUrl }, 1: { type: 'rss', resolvedUrl } });
		const { instance } = makeInstance(seq({ all: true }));
		const feeds = await blindSearch(instance);
		expect(feeds).toEqual([{ url: URLS[0], title: null, type: 'rss', feedTitle: null }]);
	});

	it('duplicate hits are not mistaken for bot challenges', async () => {
		mockCheckFeed.mockResolvedValue({ type: 'rss', title: null, resolvedUrl: `${SITE}/feed/` });
		const { instance, events } = makeInstance(seq({ all: true }));
		const feeds = await blindSearch(instance);
		expect(feeds).toHaveLength(1);
		expect(calledUrls()).toEqual(URLS);
		expect(logMessages(events)).toEqual([]);
	});
});

describe('blindSearch — duplicate candidates', () => {
	it('checks each distinct candidate URL only once', async () => {
		const { instance } = makeInstance({ searchMode: 'standard', concurrency: 1 }, `${SITE}/blog/`);
		await blindSearch(instance);
		const urls = calledUrls();
		expect(urls.length).toBeGreaterThan(0);
		expect(new Set(urls).size).toBe(urls.length);
	});
});

describe('blindSearch — bot-challenge abort', () => {
	it('aborts after exactly 3 consecutive challenge responses', async () => {
		mockCheckFeed.mockImplementation(async (url: string) => {
			throw new ChallengeResponseError(url);
		});
		const { instance, events } = makeInstance(seq());
		expect(await blindSearch(instance)).toEqual([]);
		expect(calledUrls()).toEqual(URLS.slice(0, 3));
		const msgs = events.filter((e) => e.event === 'log' && e.data.message).map((e) => e.data);
		expect(msgs).toEqual([
			{
				module: 'blindsearch',
				message:
					'Stopped: the site is returning a bot-protection challenge page (e.g. Cloudflare) for ' +
					'candidate feed URLs, so blind search cannot reliably probe the remaining endpoints. ' +
					'This does not mean the site has no feed.'
			}
		]);
	});

	it('with parallel workers, aborts once and stops the other workers', async () => {
		mockCheckFeed.mockImplementation(async (url: string) => {
			throw new ChallengeResponseError(url);
		});
		const { instance, events } = makeInstance({ searchMode: 'fast', concurrency: 3 });
		await blindSearch(instance);
		expect(logMessages(events)).toHaveLength(1);
		expect(mockCheckFeed.mock.calls.length).toBeLessThan(URLS.length);
	});

	it('a normal response resets the challenge counter', async () => {
		mockCheckFeed.mockImplementation(async (url: string) => {
			const i = URLS.indexOf(url);
			if (i === 2) return null;
			if (i < 5) throw new ChallengeResponseError(url);
			return null;
		});
		const { instance, events } = makeInstance(seq());
		await blindSearch(instance);
		// 0,1 challenge; 2 reset; 3,4 challenge (only 2 in a row) → no abort
		expect(calledUrls()).toEqual(URLS);
		expect(logMessages(events)).toEqual([]);
	});

	it('RSS found before a challenge run is still reported', async () => {
		mockCheckFeed.mockImplementation(async (url: string) => {
			if (url === URLS[0]) return { type: 'rss', title: 'R' };
			throw new ChallengeResponseError(url);
		});
		const { instance } = makeInstance(seq());
		const feeds = await blindSearch(instance);
		expect(feeds.map((f) => f.url)).toEqual([URLS[0]]);
		expect(calledUrls()).toEqual(URLS.slice(0, 4));
	});
});

describe('blindSearch — events', () => {
	it('emits an exact start event', async () => {
		const { instance, events } = makeInstance(seq());
		await blindSearch(instance);
		expect(events[0]).toEqual({
			event: 'start',
			data: { module: 'blindsearch', niceName: 'Blind Search', endpointUrls: URLS.length }
		});
	});

	it('emits one progress log per checked candidate', async () => {
		const { instance, events } = makeInstance(seq());
		await blindSearch(instance);
		const progress = events.filter((e) => e.event === 'log').map((e) => e.data);
		expect(progress).toHaveLength(URLS.length);
		expect(progress[0]).toEqual({
			module: 'blindsearch',
			totalEndpoints: URLS.length,
			totalCount: 1,
			feedsFound: 0
		});
		expect(progress.at(-1).totalCount).toBe(URLS.length);
	});

	it('emits an end event with the found feeds', async () => {
		feedsAt({ 0: { type: 'rss' } });
		const { instance, events } = makeInstance(seq());
		const feeds = await blindSearch(instance);
		expect(events.at(-1)).toEqual({ event: 'end', data: { module: 'blindsearch', feeds } });
	});
});

describe('blindSearch — verbose rejection logging', () => {
	it('passes an onReject callback that logs url + reason when verbose', async () => {
		const { instance, events } = makeInstance(seq({ verbose: true }));
		mockCheckFeed.mockImplementation(
			async (url: string, _c: string, _i: unknown, onReject?: (r: string) => void) => {
				if (url === URLS[0]) onReject?.('not a feed');
				return null;
			}
		);
		await blindSearch(instance);
		expect(events).toContainEqual({
			event: 'log',
			data: { module: 'blindsearch', url: URLS[0], reason: 'not a feed' }
		});
	});

	it('passes no onReject callback when not verbose', async () => {
		const { instance } = makeInstance(seq());
		await blindSearch(instance);
		expect(mockCheckFeed.mock.calls.every((c) => c[3] === undefined)).toBe(true);
	});
});

describe('blindSearch — fetch errors', () => {
	it('emits an error event per failed candidate with showErrors', async () => {
		mockCheckFeed.mockImplementation(async (url: string) => {
			if (url === URLS[0]) throw new Error('boom');
			return null;
		});
		const { instance, events } = makeInstance(seq({ showErrors: true }));
		await blindSearch(instance);
		const errors = events.filter((e) => e.event === 'error');
		expect(errors).toHaveLength(1);
		expect(errors[0].data.module).toBe('blindsearch');
		expect(errors[0].data.error).toBe(`Error fetching ${URLS[0]}: boom`);
		expect(errors[0].data.explanation).toContain('blind search');
		expect(errors[0].data.suggestion).toContain('normal during blind search');
	});

	it('handles errors without an options object', async () => {
		mockCheckFeed.mockRejectedValue(new Error('boom'));
		const { instance, events } = makeInstance(undefined);
		await expect(blindSearch(instance)).resolves.toEqual([]);
		expect(events.some((e) => e.event === 'error')).toBe(false);
	});

	it('stays silent about errors without showErrors', async () => {
		mockCheckFeed.mockRejectedValue(new Error('boom'));
		const { instance, events } = makeInstance(seq());
		await blindSearch(instance);
		expect(events.some((e) => e.event === 'error')).toBe(false);
		expect(calledUrls()).toEqual(URLS);
	});

	it('does not report "no feed" results as errors', async () => {
		const { instance, events } = makeInstance(seq({ showErrors: true }));
		await blindSearch(instance);
		expect(events.some((e) => e.event === 'error')).toBe(false);
	});
});

describe('blindSearch — abort signal', () => {
	it('rejects immediately for an already-aborted signal', async () => {
		const controller = new AbortController();
		controller.abort();
		const { instance } = makeInstance(seq());
		await expect(blindSearch(instance, controller.signal)).rejects.toThrow(
			'Blind search operation was aborted'
		);
		expect(mockCheckFeed).not.toHaveBeenCalled();
	});
});

describe('blindSearch — requestDelay', () => {
	let spy: ReturnType<typeof vi.spyOn>;
	beforeEach(() => {
		spy = vi.spyOn(globalThis, 'setTimeout');
	});
	afterEach(() => spy.mockRestore());

	const delayCalls = (ms: number) => spy.mock.calls.filter((c) => c[1] === ms).length;

	it('waits between candidates but not after the last one', async () => {
		const { instance } = makeInstance(seq({ requestDelay: 1 }));
		await blindSearch(instance);
		expect(delayCalls(1)).toBe(URLS.length - 1);
	});

	it('does not wait at all with requestDelay 0', async () => {
		const { instance } = makeInstance(seq({ requestDelay: 0 }));
		await blindSearch(instance);
		expect(delayCalls(0)).toBe(0);
	});
});

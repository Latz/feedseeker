import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

vi.mock('../modules/fetchWithTimeout.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/checkFeed/index.ts', () => ({ default: vi.fn() }));

import fetchWithTimeout from '../modules/fetchWithTimeout.ts';
import checkFeed from '../modules/checkFeed/index.ts';
import deepSearch, { excludedFile } from '../modules/deepSearch.ts';

const mockFetch = fetchWithTimeout as unknown as Mock;
const mockCheckFeed = checkFeed as unknown as Mock;

const A = 'https://a.com';

/**
 * Fake web: URL → page. A string is a 200 HTML body, a number is an HTTP error
 * status, an Error is thrown by fetch. Unknown URLs are 404.
 * Bodies starting with "FEED:" are treated as feeds by the checkFeed mock.
 */
type Page = string | number | Error;
function web(pages: Record<string, Page>) {
	mockFetch.mockImplementation(async (url: string) => {
		const page = pages[url] ?? 404;
		if (page instanceof Error) throw page;
		if (typeof page === 'number') {
			return {
				ok: false,
				status: page,
				statusText: page === 404 ? 'Not Found' : 'Internal Server Error',
				text: async () => ''
			};
		}
		return { ok: true, status: 200, statusText: 'OK', text: async () => page };
	});
}

const links = (...hrefs: string[]) =>
	`<html><body>${hrefs.map((h) => `<a href="${h}">x</a>`).join('')}</body></html>`;
const fetched = () => mockFetch.mock.calls.map((c) => c[0] as string);
const pagesFetched = () =>
	fetched().filter((u) => !u.endsWith('/robots.txt') && !u.endsWith('/sitemap.xml'));

type Event = { event: string; data: any };
function makeInstance(extra: Record<string, unknown> = {}) {
	const events: Event[] = [];
	const instance = {
		options: {},
		emit: (event: string, data: unknown) => events.push({ event, data }),
		...extra
	};
	return { instance: instance as any, events };
}
/** Let background crawl tasks that outlive deepSearch() run to completion. */
const settle = () => new Promise((r) => setTimeout(r, 20));
const messages = (events: Event[]) =>
	events.filter((e) => e.event === 'log' && e.data.message).map((e) => e.data.message as string);

beforeEach(() => {
	mockFetch.mockReset();
	mockCheckFeed.mockReset();
	mockCheckFeed.mockImplementation(async (url: string, html: string) =>
		typeof html === 'string' && html.startsWith('FEED:')
			? { type: 'rss', title: html.slice(5) }
			: null
	);
});

describe('excludedFile', () => {
	it.each([
		'.zip',
		'.rar',
		'.7z',
		'.tar.gz',
		'.tar.bz2',
		'.tar.xz',
		'.tar',
		'.gz',
		'.bz2',
		'.xz',
		'.tgz',
		'.epub',
		'.mobi',
		'.azw',
		'.pdf',
		'.doc',
		'.docx',
		'.xls',
		'.xlsx',
		'.ppt',
		'.pptx',
		'.jpg',
		'.jpeg',
		'.png',
		'.gif',
		'.bmp',
		'.tiff',
		'.svg',
		'.mp3',
		'.mp4',
		'.avi',
		'.mov',
		'.wmv',
		'.mpg',
		'.mpeg',
		'.flv',
		'.mkv',
		'.webm',
		'.ogg',
		'.ogv',
		'.ogx'
	])('excludes %s files', (ext) => {
		expect(excludedFile(`${A}/file${ext}`)).toBe(true);
	});

	it('is case-insensitive', () => {
		expect(excludedFile(`${A}/Report.PDF`)).toBe(true);
	});

	it('keeps pages and feeds', () => {
		expect(excludedFile(`${A}/blog/post`)).toBe(false);
		expect(excludedFile(`${A}/feed.xml`)).toBe(false);
		expect(excludedFile('noextension')).toBe(false);
	});
});

describe('deepSearch — URL normalization', () => {
	it('treats www., #fragments and trailing slashes as the same page', async () => {
		web({
			[`${A}/`]: links('https://www.a.com/', '/#top', '/x/', '/x', '/x#frag')
		});
		await deepSearch(A, { depth: 2 });
		expect(pagesFetched()).toEqual([`${A}/`, `${A}/x`]);
	});
});

describe('deepSearch — sitemap seeding', () => {
	it('uses the Sitemap: line from robots.txt, ignoring commented lines', async () => {
		web({
			[`${A}/robots.txt`]: '# Sitemap: https://a.com/wrong.xml\nSitemap: https://a.com/right.xml',
			[`${A}/right.xml`]: '<urlset><loc>https://a.com/from-sitemap</loc></urlset>',
			[`${A}/wrong.xml`]: '<urlset><loc>https://a.com/wrong-page</loc></urlset>'
		});
		const { instance, events } = makeInstance();
		await deepSearch(A, { depth: 1 }, instance);
		expect(fetched()).toContain(`${A}/right.xml`);
		expect(fetched()).not.toContain(`${A}/wrong.xml`);
		expect(pagesFetched()).toContain(`${A}/from-sitemap`);
		expect(messages(events)).toContain('Seeded 1 URLs from sitemap.');
	});

	it('accepts "Sitemap:" without a space', async () => {
		web({ [`${A}/robots.txt`]: 'Sitemap:https://a.com/s.xml' });
		await deepSearch(A, { depth: 1 });
		expect(fetched()).toContain(`${A}/s.xml`);
		expect(fetched()).not.toContain(`${A}/sitemap.xml`);
	});

	it('ignores the body of a failed robots.txt and falls back to /sitemap.xml', async () => {
		mockFetch.mockImplementation(async (url: string) => {
			if (url === `${A}/robots.txt`) {
				return {
					ok: false,
					status: 404,
					statusText: 'Not Found',
					text: async () => 'Sitemap: https://a.com/x.xml'
				};
			}
			return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' };
		});
		await deepSearch(A, { depth: 1 });
		expect(fetched()).toContain(`${A}/sitemap.xml`);
		expect(fetched()).not.toContain(`${A}/x.xml`);
	});

	it('passes timeout and insecure to robots.txt, sitemap and page fetches', async () => {
		web({});
		await deepSearch(A, { depth: 1, timeout: 7, insecure: true });
		expect(mockFetch.mock.calls.length).toBe(3);
		for (const call of mockFetch.mock.calls)
			expect(call[1]).toEqual({ timeout: 7000, insecure: true });
	});

	it('does not seed from a sitemap that returns an error status', async () => {
		mockFetch.mockImplementation(async (url: string) => {
			if (url === `${A}/sitemap.xml`) {
				return {
					ok: false,
					status: 500,
					statusText: 'x',
					text: async () => '<loc>https://a.com/p</loc>'
				};
			}
			return { ok: false, status: 404, statusText: 'Not Found', text: async () => '' };
		});
		await deepSearch(A, { depth: 1 });
		expect(pagesFetched()).toEqual([`${A}/`]);
	});

	it('seeds nothing when the sitemap fetch throws', async () => {
		web({ [`${A}/sitemap.xml`]: new Error('net down'), [`${A}/`]: links() });
		await deepSearch(A, { depth: 1 });
		expect(pagesFetched()).toEqual([`${A}/`]);
	});

	it('trims, normalizes and domain-filters sitemap entries; counts duplicates once', async () => {
		web({
			[`${A}/sitemap.xml`]:
				'<loc> https://a.com/p/ </loc><loc>https://a.com/p</loc><loc>https://other.com/q</loc><loc>https://a.com/img.png</loc>'
		});
		const { instance, events } = makeInstance();
		await deepSearch(A, { depth: 1 }, instance);
		expect(pagesFetched()).toEqual([`${A}/`, `${A}/p`]);
		expect(messages(events)).toContain('Seeded 1 URLs from sitemap.');
	});

	it('seeds at most maxLinks URLs in total (start URL included)', async () => {
		web({
			[`${A}/sitemap.xml`]: ['p1', 'p2', 'p3', 'p4'].map((p) => `<loc>${A}/${p}</loc>`).join('')
		});
		const { instance, events } = makeInstance();
		await deepSearch(A, { depth: 1, maxLinks: 3 }, instance);
		expect(pagesFetched()).toEqual([`${A}/`, `${A}/p1`, `${A}/p2`]);
		expect(messages(events)).toContain('Seeded 2 URLs from sitemap.');
	});

	it('does not crawl sitemap URLs (depth 1) when depth is 0', async () => {
		web({ [`${A}/sitemap.xml`]: `<loc>${A}/p1</loc>` });
		await deepSearch(A, { depth: 0 });
		expect(pagesFetched()).toEqual([`${A}/`]);
	});
});

describe('deepSearch — events', () => {
	it('emits an exact start event and progress log', async () => {
		web({ [`${A}/`]: links() });
		const { instance, events } = makeInstance();
		await deepSearch(A, { depth: 1 }, instance);
		expect(events[0]).toEqual({
			event: 'start',
			data: { module: 'deepSearch', niceName: 'Deep Search' }
		});
		expect(events).toContainEqual({
			event: 'log',
			data: {
				module: 'deepSearch',
				url: `${A}/`,
				depth: 0,
				progress: { processed: 1, remaining: 0 }
			}
		});
	});

	it('logs fetch failures with url, depth and reason', async () => {
		web({ [`${A}/`]: links('/broken'), [`${A}/broken`]: 500 });
		const { instance, events } = makeInstance();
		await deepSearch(A, { depth: 1 }, instance);
		expect(events).toContainEqual({
			event: 'log',
			data: {
				module: 'deepSearch',
				url: `${A}/broken`,
				depth: 1,
				error: 'HTTP 500 Internal Server Error'
			}
		});
	});

	it('logs a missing response as a network error', async () => {
		mockFetch.mockResolvedValue(null);
		const { instance, events } = makeInstance();
		await deepSearch(A, { depth: 1 }, instance);
		expect(events).toContainEqual({
			event: 'log',
			data: {
				module: 'deepSearch',
				url: `${A}/`,
				depth: 0,
				error: 'Failed to fetch URL - timeout or network error'
			}
		});
	});

	it('emits exactly one end event', async () => {
		web({
			[`${A}/`]: links('/f1', '/f2', '/f3'),
			[`${A}/f1`]: 'FEED:1',
			[`${A}/f2`]: 'FEED:2',
			[`${A}/f3`]: 'FEED:3'
		});
		const { instance, events } = makeInstance();
		await deepSearch(A, { depth: 1, maxFeeds: 1 }, instance);
		expect(events.filter((e) => e.event === 'end')).toHaveLength(1);
	});
});

describe('deepSearch — failed pages', () => {
	it('does not check or parse a page that failed to load', async () => {
		web({ [`${A}/`]: links('/broken'), [`${A}/broken`]: 500 });
		const { instance, events } = makeInstance();
		await deepSearch(A, { depth: 2 }, instance);
		expect(mockCheckFeed.mock.calls.map((c) => c[0])).toEqual([`${A}/`]);
		expect(events.some((e) => e.event === 'error')).toBe(false);
	});

	it('reports an unexpected fetch exception as an async queue error', async () => {
		web({ [`${A}/`]: new Error('boom') });
		const { instance, events } = makeInstance();
		await deepSearch(A, { depth: 1 }, instance);
		const errors = events.filter((e) => e.event === 'error').map((e) => e.data);
		expect(errors).toHaveLength(1);
		expect(errors[0].module).toBe('deepSearch');
		expect(errors[0].error).toBe('Async error: Error: boom');
		expect(errors[0].explanation).toContain('async queue');
		expect(errors[0].suggestion).toContain('network connectivity');
	});
});

describe('deepSearch — maxErrors', () => {
	const tenBroken = () => {
		const pages: Record<string, Page> = {
			[`${A}/`]: links(...Array.from({ length: 10 }, (_, i) => `/b${i}`))
		};
		for (let i = 0; i < 10; i++) pages[`${A}/b${i}`] = 500;
		return pages;
	};

	it('stops after exactly maxErrors errors and logs it once', async () => {
		web(tenBroken());
		const { instance, events } = makeInstance();
		await deepSearch(A, { depth: 1, maxErrors: 2 }, instance);
		expect(messages(events).filter((m) => m.startsWith('Stopped due to'))).toEqual([
			'Stopped due to 2 errors (max 2 allowed).'
		]);
		// concurrency is 5: in-flight requests finish, queued ones are dropped,
		// also after deepSearch has returned
		await settle();
		expect(pagesFetched().length).toBeLessThan(11);
	});
});

describe('deepSearch — maxLinks', () => {
	it('logs the cap exactly once across several pages', async () => {
		web({
			[`${A}/`]: links('/a', '/b', '/c'),
			[`${A}/a`]: links('/d', '/e'),
			[`${A}/b`]: links('/f', '/g')
		});
		const { instance, events } = makeInstance();
		await deepSearch(A, { depth: 2, maxLinks: 3 }, instance);
		expect(messages(events).filter((m) => m.startsWith('Max links'))).toEqual([
			'Max links limit of 3 reached. Stopping deep search.'
		]);
		expect(pagesFetched()).toEqual([`${A}/`, `${A}/a`, `${A}/b`]);
	});

	it('foreign links do not use up the link budget when checkForeignFeeds is off', async () => {
		web({ [`${A}/`]: links('https://other.com/x', '/same') });
		await deepSearch(A, { depth: 1, maxLinks: 2 });
		expect(pagesFetched()).toEqual([`${A}/`, `${A}/same`]);
	});

	it('foreign links count toward the link budget when checkForeignFeeds is on', async () => {
		web({ [`${A}/`]: links('https://other.com/x', '/same') });
		await deepSearch(A, { depth: 1, maxLinks: 2, checkForeignFeeds: true });
		expect(pagesFetched()).toEqual([`${A}/`, 'https://other.com/x']);
	});
});

describe('deepSearch — foreign feeds', () => {
	it('checks foreign pages for feeds but never follows their links', async () => {
		web({
			[`${A}/`]: links('https://other.com/x'),
			'https://other.com/x': links('/deeper', `${A}/hidden`)
		});
		await deepSearch(A, { depth: 3, checkForeignFeeds: true });
		expect(pagesFetched()).toEqual([`${A}/`, 'https://other.com/x']);
	});
});

describe('deepSearch — feeds', () => {
	it('records a feed with an exact log entry', async () => {
		web({ [`${A}/`]: links('/f'), [`${A}/f`]: 'FEED:My Feed' });
		const { instance, events } = makeInstance();
		const feeds = await deepSearch(A, { depth: 1 }, instance);
		expect(feeds).toEqual([{ url: `${A}/f`, type: 'rss', title: 'My Feed', feedTitle: 'My Feed' }]);
		expect(events).toContainEqual({
			event: 'log',
			data: {
				module: 'deepSearch',
				url: `${A}/f`,
				depth: 2,
				feedCheck: { isFeed: true, type: 'rss' }
			}
		});
	});

	it('does not follow links inside a feed', async () => {
		web({ [`${A}/`]: `FEED:x<a href="/inner">i</a>` });
		await deepSearch(A, { depth: 2 });
		expect(pagesFetched()).toEqual([`${A}/`]);
	});

	const fourFeeds = () => ({
		[`${A}/`]: links('/f1', '/f2', '/f3', '/f4'),
		[`${A}/f1`]: 'FEED:1',
		[`${A}/f2`]: 'FEED:2',
		[`${A}/f3`]: 'FEED:3',
		[`${A}/f4`]: 'FEED:4'
	});

	it('maxFeeds 0 means unlimited', async () => {
		web(fourFeeds());
		expect(await deepSearch(A, { depth: 1, maxFeeds: 0 })).toHaveLength(4);
	});

	it('never returns more than maxFeeds and logs the limit once', async () => {
		web(fourFeeds());
		const { instance, events } = makeInstance();
		const feeds = await deepSearch(A, { depth: 1, maxFeeds: 2 }, instance);
		expect(feeds).toHaveLength(2);
		expect(messages(events).filter((m) => m.includes('maximum feeds limit'))).toEqual([
			'Stopped due to reaching maximum feeds limit: 2 feeds found (max 2 allowed).'
		]);
	});

	it('stops crawling queued pages once maxFeeds is reached', async () => {
		// concurrency 5: the first five links are in flight, the rest must be dropped
		const pages: Record<string, Page> = {
			[`${A}/`]: links(...Array.from({ length: 10 }, (_, i) => `/f${i}`))
		};
		for (let i = 0; i < 10; i++) pages[`${A}/f${i}`] = `FEED:${i}`;
		web(pages);
		await deepSearch(A, { depth: 1, maxFeeds: 1 });
		await settle();
		expect(pagesFetched().length).toBeLessThan(11);
	});
});

describe('deepSearch — prefetched homepage', () => {
	it('uses instance.content only for the start page', async () => {
		web({ [`${A}/p`]: links() });
		const { instance } = makeInstance({ site: A, content: links('/p') });
		await deepSearch(A, { depth: 1 }, instance);
		expect(pagesFetched()).toEqual([`${A}/p`]);
	});
});

describe('deepSearch — exact limit events', () => {
	const logData = (events: Event[], text: string) =>
		events.filter((e) => e.event === 'log' && e.data.message?.includes(text)).map((e) => e.data);

	it('tags the error-limit, seeding, link-limit and feed-limit logs with the module', async () => {
		const errorsRun = makeInstance();
		web({ [`${A}/`]: links('/b1', '/b2'), [`${A}/b1`]: 500, [`${A}/b2`]: 500 });
		await deepSearch(A, { depth: 1, maxErrors: 1 }, errorsRun.instance);
		expect(logData(errorsRun.events, 'Stopped due to')).toEqual([
			{ module: 'deepSearch', message: 'Stopped due to 1 errors (max 1 allowed).' }
		]);

		const seeded = makeInstance();
		web({ [`${A}/sitemap.xml`]: `<loc>${A}/p</loc>` });
		await deepSearch(A, { depth: 1 }, seeded.instance);
		expect(logData(seeded.events, 'Seeded')).toEqual([
			{ module: 'deepSearch', message: 'Seeded 1 URLs from sitemap.' }
		]);

		const capped = makeInstance();
		web({ [`${A}/`]: links('/a', '/b') });
		await deepSearch(A, { depth: 1, maxLinks: 2 }, capped.instance);
		expect(logData(capped.events, 'Max links')).toEqual([
			{ module: 'deepSearch', message: 'Max links limit of 2 reached. Stopping deep search.' }
		]);

		const limited = makeInstance();
		web({ [`${A}/`]: links('/f'), [`${A}/f`]: 'FEED:x' });
		await deepSearch(A, { depth: 1, maxFeeds: 1 }, limited.instance);
		expect(logData(limited.events, 'maximum feeds')).toEqual([
			{
				module: 'deepSearch',
				message: 'Stopped due to reaching maximum feeds limit: 1 feeds found (max 1 allowed).'
			}
		]);
	});

	it('never logs a feed limit with maxFeeds 0', async () => {
		web({ [`${A}/`]: links('/f1', '/f2'), [`${A}/f1`]: 'FEED:1', [`${A}/f2`]: 'FEED:2' });
		const { instance, events } = makeInstance();
		expect(await deepSearch(A, { depth: 1, maxFeeds: 0 }, instance)).toHaveLength(2);
		expect(logData(events, 'maximum feeds')).toEqual([]);
	});

	it('a repeated link does not count as hitting the link limit', async () => {
		// start page + /a fill the budget of 2 exactly; the second /a is a duplicate, not a new link
		web({ [`${A}/`]: links('/a', '/a') });
		const { instance, events } = makeInstance();
		await deepSearch(A, { depth: 1, maxLinks: 2 }, instance);
		expect(logData(events, 'Max links')).toEqual([]);
	});

	it('does not collect links from pages at the maximum depth', async () => {
		web({ [`${A}/`]: links('/a'), [`${A}/a`]: links('/b', '/c', '/d') });
		const { instance, events } = makeInstance();
		await deepSearch(A, { depth: 1, maxLinks: 3 }, instance);
		expect(pagesFetched()).toEqual([`${A}/`, `${A}/a`]);
		expect(logData(events, 'Max links')).toEqual([]);
	});
});

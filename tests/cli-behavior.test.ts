import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { run } from '../cli/index.ts';
import { type Feed } from '../modules/metaLinks.ts';

vi.mock('../modules/metaLinks.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/anchors/index.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/blindsearch/index.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/deepSearch.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/checkFreshness.ts', () => ({ checkFeedFreshness: vi.fn() }));
vi.mock('../modules/fetchWithTimeout.ts', () => ({ default: vi.fn(), setTlsSpoofEnabled: vi.fn() }));

import metaLinksMod from '../modules/metaLinks.ts';
import anchorsMod from '../modules/anchors/index.ts';
import blindsearchMod from '../modules/blindsearch/index.ts';
import deepSearchMod from '../modules/deepSearch.ts';
import fetchWithTimeout, { setTlsSpoofEnabled } from '../modules/fetchWithTimeout.ts';
import { checkFeedFreshness } from '../modules/checkFreshness.ts';
import bannerText from '../modules/banner.ts';

const meta = metaLinksMod as Mock;
const anchors = anchorsMod as Mock;
const blind = blindsearchMod as Mock;
const deep = deepSearchMod as Mock;

type Emitter = { emit: (event: string, data: unknown) => void };
const SITE = 'https://example.com';
const feed = (path: string, feedTitle: string | null = null): Feed => ({
	url: `${SITE}${path}`,
	type: 'rss',
	title: null,
	feedTitle
});

// oxlint-disable-next-line no-control-regex
const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

let stdout: Mock;
let log: Mock;
let error: Mock;
let exit: Mock;
const out = () => stdout.mock.calls.map((c) => stripAnsi(String(c[0]))).join('');
const logged = () => log.mock.calls.map((c) => stripAnsi(c.map(String).join(' ')));
const errors = () => error.mock.calls.map((c) => stripAnsi(c.map(String).join(' ')));

/** Make a strategy mock emit events on the FeedSeeker instance, then return feeds. */
function emitting(
	mock: Mock,
	events: Array<[string, unknown]>,
	feeds: Feed[] = [],
	instanceArg = 0
) {
	mock.mockImplementation(async (...args: unknown[]) => {
		const instance = args[instanceArg] as Emitter;
		for (const [event, data] of events) instance.emit(event, data);
		return feeds;
	});
}

const cli = (...args: string[]) => run(['node', 'feedseeker', ...args]);

beforeEach(() => {
	vi.clearAllMocks();
	stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true) as unknown as Mock;
	log = vi.spyOn(console, 'log').mockImplementation(() => {}) as unknown as Mock;
	error = vi.spyOn(console, 'error').mockImplementation(() => {}) as unknown as Mock;
	exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never) as unknown as Mock;
	// a fresh Response per call: a body can only be read once
	(fetchWithTimeout as Mock).mockImplementation(async () => new Response('<html></html>', { status: 200 }));
	for (const m of [meta, anchors, blind, deep]) m.mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

describe('CLI progress output — metaLinks', () => {
	it('prints start, a dot per log and the found count', async () => {
		emitting(
			meta,
			[
				['start', { module: 'metalinks', niceName: 'Meta Links' }],
				['log', { module: 'metalinks', message: 'Checking feed: x' }],
				['log', { module: 'metalinks', message: 'Checking feed: y' }],
				['end', { module: 'metalinks', feeds: [feed('/f')] }]
			],
			[feed('/f')]
		);
		await cli(SITE, '--metasearch');
		expect(out()).toBe('Starting Meta Links .. Found 1 feeds.\n');
	});

	it('prints "No feeds found." when a strategy ends empty', async () => {
		emitting(meta, [['end', { module: 'metalinks', feeds: [] }]]);
		await cli(SITE, '--metasearch');
		expect(out()).toBe(' No feeds found.\n');
	});

	it('prints rejection reasons instead of dots with --verbose', async () => {
		emitting(meta, [['log', { module: 'metalinks', url: `${SITE}/x`, reason: 'not a feed' }]]);
		await cli(SITE, '--metasearch', '--verbose');
		expect(out()).toBe(`\n  ${SITE}/x — not a feed`);
	});

	it('prints dots, not reasons, without --verbose', async () => {
		emitting(meta, [['log', { module: 'metalinks', url: `${SITE}/x`, reason: 'not a feed' }]]);
		await cli(SITE, '--metasearch');
		expect(out()).toBe('.');
	});

	it('prints no progress at all with --quiet', async () => {
		emitting(
			meta,
			[
				['start', { module: 'metalinks', niceName: 'Meta Links' }],
				['log', { module: 'metalinks', message: 'x' }],
				['end', { module: 'metalinks', feeds: [feed('/f')] }]
			],
			[feed('/f')]
		);
		await cli(SITE, '--metasearch', '-q');
		expect(out()).toBe('');
		expect(logged()).toEqual([`${SITE}/f`]);
	});
});

describe('CLI progress output — blind search / anchors', () => {
	it('rewrites the progress counter in place', async () => {
		emitting(blind, [
			['start', { module: 'blindsearch', niceName: 'Blind Search' }],
			['log', { module: 'blindsearch', totalCount: 1, totalEndpoints: 25 }],
			['log', { module: 'blindsearch', totalCount: 2, totalEndpoints: 25 }]
		]);
		await cli(SITE, '--blindsearch');
		// " (1/25)" is 7 chars: cursor moves back 7 before the next counter
		expect(out()).toBe('Starting Blind Search  (1/25)\x1b[7D (2/25)');
	});

	it('resets the counter width on each strategy start', async () => {
		emitting(blind, [
			['log', { module: 'blindsearch', totalCount: 9, totalEndpoints: 9 }],
			['start', { module: 'blindsearch', niceName: 'Blind Search' }],
			['log', { module: 'blindsearch', totalCount: 1, totalEndpoints: 9 }]
		]);
		await cli(SITE, '--blindsearch');
		expect(out()).toBe(' (9/9)Starting Blind Search  (1/9)');
	});

	it('prints messages on their own line', async () => {
		emitting(blind, [['log', { module: 'blindsearch', message: 'Stopped: limit' }]]);
		await cli(SITE, '--blindsearch');
		expect(out()).toBe('\n  Stopped: limit\n');
	});

	it('prints rejection reasons with --verbose', async () => {
		emitting(blind, [['log', { module: 'blindsearch', url: `${SITE}/rss`, reason: '404' }]]);
		await cli(SITE, '--blindsearch', '--verbose');
		expect(out()).toBe(`\n  ${SITE}/rss — 404`);
	});

	it('ignores reason-only logs without --verbose', async () => {
		emitting(blind, [['log', { module: 'blindsearch', url: `${SITE}/rss`, reason: '404' }]]);
		await cli(SITE, '--blindsearch');
		expect(out()).toBe('');
	});

	it('shows the anchors counter the same way', async () => {
		emitting(anchors, [['log', { module: 'anchors', totalCount: 3, totalEndpoints: 4 }]]);
		await cli(SITE, '--anchorsonly');
		expect(out()).toBe(' (3/4)');
	});
});

describe('CLI progress output — deep search', () => {
	const deepRun = async (events: Array<[string, unknown]>) => {
		emitting(deep, events, [], 2);
		await cli(SITE, '--deepsearch-only');
		return out();
	};

	it('prints messages', async () => {
		expect(await deepRun([['log', { module: 'deepSearch', message: 'Seeded 3 URLs from sitemap.' }]])).toBe(
			'  Seeded 3 URLs from sitemap.\n'
		);
	});

	it('prints crawl progress with host and path', async () => {
		const o = await deepRun([
			['log', { module: 'deepSearch', url: `${SITE}/blog`, depth: 1, progress: { processed: 2, remaining: 3 } }]
		]);
		expect(o).toBe('  [depth:1 2/5] example.com/blog\n');
	});

	it('shortens paths longer than 30 characters', async () => {
		const long = '/' + 'a'.repeat(30); // 31 chars
		const exact = '/' + 'b'.repeat(29); // 30 chars, kept
		const o = await deepRun([
			['log', { module: 'deepSearch', url: `${SITE}${long}`, depth: 1, progress: { processed: 1, remaining: 0 } }],
			['log', { module: 'deepSearch', url: `${SITE}${exact}`, depth: 1, progress: { processed: 1, remaining: 0 } }]
		]);
		expect(o).toBe(
			`  [depth:1 1/1] example.com${long.slice(0, 27)}...\n  [depth:1 1/1] example.com${exact}\n`
		);
	});

	it('treats missing progress numbers as 0 and survives unparsable URLs', async () => {
		const o = await deepRun([['log', { module: 'deepSearch', url: 'not a url', depth: 2, progress: {} }]]);
		expect(o).toBe('  [depth:2 0/0]\n');
	});

	it('reports the crawled URL count when deep search ends', async () => {
		const o = await deepRun([['end', { module: 'deepSearch', feeds: [], visitedUrls: 7 }]]);
		expect(o).toBe('  Done. Crawled 7 URLs.\n No feeds found.\n');
	});

	it('does not report a crawl count for other modules', async () => {
		emitting(meta, [['end', { module: 'metalinks', feeds: [], visitedUrls: 7 }]]);
		await cli(SITE, '--metasearch');
		expect(out()).toBe(' No feeds found.\n');
	});
});

describe('CLI --all mode', () => {
	it('prints per-strategy results and a deduplicated summary', async () => {
		emitting(meta, [['end', { module: 'metalinks', feeds: [feed('/a', 'A')] }]], [feed('/a', 'A')]);
		emitting(anchors, [['end', { module: 'anchors', feeds: [] }]]);
		emitting(blind, [['end', { module: 'blindsearch', feeds: [feed('/a', 'A'), feed('/b')] }]], [feed('/a', 'A'), feed('/b')]);
		await cli(SITE, '--all');
		expect(out()).toBe(' Found 1 feeds.\n No feeds found.\n Found 2 feeds.\n');
		// printFeeds from the end handlers, then the final summary
		expect(logged().slice(1)).toEqual([
			'A', `${SITE}/a`,
			'A', `${SITE}/a`, '', `${SITE}/b`,
			'\n=== All Strategies Complete ===',
			'Total unique feeds found: 2\n',
			'A', `${SITE}/a`, '', `${SITE}/b`
		]);
		expect(deep).toHaveBeenCalled();
	});
});

describe('CLI strategy selection', () => {
	it('default: runs strategies in order and stops at the first that finds feeds', async () => {
		anchors.mockResolvedValue([feed('/a')]);
		await cli(SITE);
		expect(meta).toHaveBeenCalled();
		expect(anchors).toHaveBeenCalled();
		expect(blind).not.toHaveBeenCalled();
		expect(deep).not.toHaveBeenCalled();
	});

	it('default: runs deep search last only with -d', async () => {
		await cli(SITE);
		expect(deep).not.toHaveBeenCalled();
		await cli(SITE, '-d');
		expect(deep).toHaveBeenCalledTimes(1);
	});

	it.each([
		['--anchorsonly', anchors],
		['--blindsearch', blind],
		['--deepsearch-only', deep]
	])('%s runs only that strategy', async (flag, only) => {
		await cli(SITE, flag as string);
		for (const m of [meta, anchors, blind, deep]) {
			expect(m).toHaveBeenCalledTimes(m === only ? 1 : 0);
		}
	});

	it('exits with code 2 when nothing is found, and not when feeds are found', async () => {
		await cli(SITE, '--metasearch');
		expect(exit).toHaveBeenCalledWith(2);
		exit.mockClear();
		meta.mockResolvedValue([feed('/f')]);
		await cli(SITE, '--metasearch');
		expect(exit).not.toHaveBeenCalled();
	});
});

describe('CLI error events', () => {
	const emitError = (data: unknown) => emitting(meta, [['error', data]]);

	it('prints Error objects with the site', async () => {
		emitError(new Error('boom'));
		await cli(SITE, '--metasearch');
		expect(errors()).toContain(`\nError for ${SITE}: boom`);
	});

	it('prints the error string of error events', async () => {
		emitError({ module: 'metalinks', error: 'bad link' });
		await cli(SITE, '--metasearch');
		expect(errors()).toContain(`\nError for ${SITE}: bad link`);
	});

	it('falls back to String() for events without an error string, and for primitives', async () => {
		emitError({ module: 'metalinks', error: 42 });
		await cli(SITE, '--metasearch');
		emitError('plain');
		await cli(SITE, '--metasearch');
		expect(errors()).toEqual([`\nError for ${SITE}: [object Object]`, `\nError for ${SITE}: plain`]);
	});

	it('keeps JSON output clean unless --display-errors is set', async () => {
		emitError({ module: 'metalinks', error: 'bad link' });
		await cli(SITE, '--metasearch', '--json');
		expect(errors()).toEqual([]);
		await cli(SITE, '--metasearch', '--json', '--display-errors');
		expect(errors()).toEqual([`\nError for ${SITE}: bad link`]);
	});

	it('stops after a failed initial fetch without running any strategy', async () => {
		(fetchWithTimeout as Mock).mockRejectedValue(new Error('ECONNREFUSED'));
		await cli(SITE);
		expect(meta).not.toHaveBeenCalled();
		expect(blind).not.toHaveBeenCalled();
		expect(errors().some((e) => e.startsWith(`\nError for ${SITE}:`))).toBe(true);
		expect(exit).toHaveBeenCalledWith(2);
	});
});

describe('CLI option parsing', () => {
	it.each([
		['--depth', '0', 'Depth must be a positive number (minimum 1)'],
		['--depth', 'x', 'Depth must be a positive number (minimum 1)'],
		['--max-links', '0', 'Max links must be a positive number (minimum 1)'],
		['--timeout', '0', 'Timeout must be a positive number (minimum 1 second)'],
		['--max-errors', '-1', 'Max errors must be a non-negative number'],
		['--max-feeds', '-1', 'Max feeds must be a non-negative number']
	])('%s %s is rejected', async (flag, value, message) => {
		await expect(cli(SITE, flag, value)).rejects.toThrow(message);
	});

	it('passes valid numeric options through, including the boundary values', async () => {
		await cli(SITE, '--deepsearch-only', '--depth', '1', '--max-links', '1', '--timeout', '1', '--max-errors', '0', '--max-feeds', '0');
		const options = deep.mock.calls[0][1];
		expect(options).toMatchObject({ depth: 1, maxLinks: 1, timeout: 1, maxErrors: 0, maxFeeds: 0 });
	});

	it('uses the documented defaults', async () => {
		await cli(SITE, '--deepsearch-only');
		expect(deep.mock.calls[0][1]).toMatchObject({ depth: 3, maxLinks: 1000, timeout: 15, maxErrors: 5, maxFeeds: 0, searchMode: 'standard' });
	});

	it('--display-errors and --verbose turn on module error output', async () => {
		await cli(SITE, '--metasearch', '--display-errors');
		expect(meta.mock.calls[0][0].options.showErrors).toBe(true);
		await cli(SITE, '--metasearch', '--verbose');
		expect(meta.mock.calls[1][0].options.showErrors).toBe(true);
		await cli(SITE, '--metasearch');
		expect(meta.mock.calls[2][0].options.showErrors).toBeFalsy();
	});

	it('--no-tls-spoof disables the spoof fallback, default enables it', async () => {
		await cli(SITE, '--metasearch');
		expect(setTlsSpoofEnabled).toHaveBeenLastCalledWith(true);
		await cli(SITE, '--metasearch', '--no-tls-spoof');
		expect(setTlsSpoofEnabled).toHaveBeenLastCalledWith(false);
	});
});

describe('CLI --check', () => {
	beforeEach(() => {
		meta.mockResolvedValue([feed('/fresh'), feed('/stale'), feed('/broken')]);
		(checkFeedFreshness as Mock).mockImplementation(async (f: Feed) => {
			if (f.url.endsWith('/broken')) throw new Error('x');
			return f.url.endsWith('/fresh');
		});
	});

	it.each([
		[['-c'], 30],
		[['-c', '7'], 7],
		[['-c', '0'], 30],
		[['-c', 'abc'], 30]
	])('%j checks freshness over %i days', async (flags, days) => {
		await cli(SITE, '--metasearch', '-q', ...(flags as string[]));
		expect((checkFeedFreshness as Mock).mock.calls[0][1]).toBe(days);
	});

	it('keeps only fresh feeds and passes timeout/insecure', async () => {
		await cli(SITE, '--metasearch', '-q', '-c', '--timeout', '9', '--insecure');
		expect((checkFeedFreshness as Mock).mock.calls[0][2]).toEqual({ options: { timeout: 9, insecure: true } });
		expect(logged()).toEqual([`${SITE}/fresh`]);
	});
});

describe('CLI banner and output formats', () => {
	it('prints the banner for interactive output', async () => {
		await cli(SITE, '--metasearch');
		expect(log.mock.calls[0][0]).toBe(`${bannerText}\n`);
	});

	it.each([['--json'], ['--quiet'], ['-q'], ['--format', 'json'], ['--format', 'opml']])(
		'suppresses the banner with %s',
		async (...flags) => {
			await cli(SITE, '--metasearch', ...flags);
			expect(log.mock.calls.some((c) => c[0] === `${bannerText}\n`)).toBe(false);
		}
	);

	it('keeps the banner with --format text', async () => {
		await cli(SITE, '--metasearch', '--format', 'text');
		expect(log.mock.calls[0][0]).toBe(`${bannerText}\n`);
	});

	it('writes OPML titled after the searched site', async () => {
		meta.mockResolvedValue([feed('/f')]);
		await cli(SITE, '--metasearch', '--format', 'opml');
		const opml = logged().join('\n');
		expect(opml).toContain('<opml');
		expect(opml).toContain(SITE);
		expect(opml).toContain(`${SITE}/f`);
	});
});

describe('CLI fatal errors', () => {
	it('prints a short message and exits 1', async () => {
		meta.mockRejectedValue(new Error('kaputt'));
		await cli(SITE, '--metasearch');
		expect(errors()).toContain('\nError: kaputt');
		expect(exit).toHaveBeenCalledWith(1);
	});

	it('prints the full error with --display-errors', async () => {
		const err = new Error('kaputt');
		meta.mockRejectedValue(err);
		await cli(SITE, '--metasearch', '--display-errors');
		expect(error).toHaveBeenCalledWith('\nError details:', err);
		expect(exit).toHaveBeenCalledWith(1);
	});

	it('shows help and exits 0 without a site', async () => {
		await cli();
		expect(exit).toHaveBeenCalledWith(0);
	});
});

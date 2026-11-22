/**
 * Feed parsing must stay fast on hostile input. Parsing runs synchronously, so a
 * regex that backtracks quadratically blocks the event loop — no fetch timeout can
 * interrupt it. 50 kB of "<feed xmlns" once kept checkAtom busy for ~10 minutes.
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import checkFeed from '../modules/checkFeed/index.ts';
import { checkFeedFreshness } from '../modules/checkFreshness.ts';
import { removeCDATA } from '../modules/checkFeed/textUtils.ts';

// ~500 kB: linear parsing takes a few ms, the old quadratic regexes took minutes
const SIZE = 500_000;
// generous so slow CI machines never flake; the old code missed it by orders of magnitude
const BUDGET_MS = 500;

const fragment = fc.constantFrom(
	'<rss ',
	'<rss version="2.0"',
	'<rdf:RDF',
	'<channel',
	'<channel>',
	'<item',
	'<item>',
	'<description',
	'<title',
	'<title>',
	'<feed ',
	'<feed xmlns',
	'xmlns ',
	'atom',
	'<entry',
	'<entry>',
	'<![CDATA[',
	'<pubDate>',
	'<dc:date>',
	'<updated>',
	'<published>',
	'<!--',
	'<?xml ',
	' ',
	'a'
);
const prefix = fc.constantFrom(
	'',
	'<?xml version="1.0"?>',
	'<rss version="2.0"><channel><description>d</description><item>',
	'<feed xmlns="http://www.w3.org/2005/Atom"><title>t</title><entry>',
	'<feed '
);
const suffix = fc.constantFrom('', '>', '</channel>', '</title>', ']]>', '</item>', '</entry>');

const hostile = fc
	.tuple(prefix, fc.array(fragment, { minLength: 1, maxLength: 4 }), suffix)
	.map(([pre, unit, post]) => {
		const u = unit.join('');
		return pre + u.repeat(Math.ceil(SIZE / u.length)) + post;
	});

describe('parsing hostile input stays linear', () => {
	let n = 0;

	it('checkFeed', async () => {
		await fc.assert(
			fc.asyncProperty(hostile, async (content) => {
				const start = performance.now();
				await checkFeed(`https://redos${++n}.example/`, content);
				expect(performance.now() - start).toBeLessThan(BUDGET_MS);
			}),
			{ numRuns: 60 }
		);
	});

	it('removeCDATA', () => {
		fc.assert(
			fc.property(hostile, (content) => {
				const start = performance.now();
				removeCDATA(content);
				expect(performance.now() - start).toBeLessThan(BUDGET_MS);
			}),
			{ numRuns: 30 }
		);
	});

	it.each([
		[
			'RSS',
			'<rss version="2.0"><channel><title>t</title><description>d</description><item>',
			'rss'
		],
		['Atom', '<feed xmlns="http://www.w3.org/2005/Atom"><title>t</title><entry>', 'atom']
	] as const)(
		'checkFeedFreshness on a %s feed full of unclosed date tags',
		async (_name, head, type) => {
			for (const tag of ['<pubDate>', '<dc:date>', '<updated>', '<published>', '<item', '<entry']) {
				// a real (if broken) feed, so checkFeed caches it for checkFeedFreshness
				const url = `https://redos-fresh${++n}.example/feed`;
				const content =
					head + tag.repeat(SIZE / tag.length) + (type === 'rss' ? '</item>' : '</entry>');
				expect(await checkFeed(url, content)).toMatchObject({ type });
				const start = performance.now();
				await checkFeedFreshness({ url, type, title: null, feedTitle: null }, 30, { options: {} });
				expect(performance.now() - start).toBeLessThan(BUDGET_MS);
			}
		}
	);
});

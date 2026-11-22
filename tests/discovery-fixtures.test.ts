/**
 * Feed discovery on real pages (tests/fixtures/html, trimmed copies of live
 * sites fetched 2026-11-22). The real checkFeed runs; only the network is
 * mocked: URLs confirmed to be feeds on the live sites serve a feed, every
 * other URL serves an ordinary HTML page.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';

vi.mock('../modules/fetchWithTimeout.ts', () => ({ default: vi.fn() }));

import fetchWithTimeout from '../modules/fetchWithTimeout.ts';
import metaLinks from '../modules/metaLinks.ts';
import checkAllAnchors from '../modules/anchors/index.ts';

const mockFetch = fetchWithTimeout as unknown as Mock;

// Verified against the live sites on 2026-11-22
const REAL_FEEDS = new Set([
	'https://wordpress.org/news/feed/',
	'https://wordpress.org/news/comments/feed/',
	'https://wordpress.org/news/feed/podcast',
	'https://gohugo.io/news/index.xml',
	'https://jekyllrb.com/feed.xml',
	'https://jekyllrb.com/feed/release.xml',
	'https://github.com/jekyll/jekyll/commits/master.atom',
	'https://mastodon.social/@Mastodon.rss',
	'https://blogger.googleblog.com/feeds/posts/default',
	'https://blogger.googleblog.com/feeds/posts/default?alt=rss',
	'https://www.blogger.com/feeds/2399953/posts/default',
	'https://www.noahpinion.blog/feed',
	'https://www.platformer.news/rss/',
	'https://github.com/nodejs/node/releases.atom',
	'https://github.com/nodejs/node/tags.atom',
	'https://blog.google/rss/'
]);
// Like the live WordPress podcast feed: a stylesheet processing instruction before <rss>
const FEED_BODY =
	'<?xml version="1.0" encoding="UTF-8"?>\n<?xml-stylesheet type="text/xsl" href="/feed.xsl"?>\n' +
	'<rss version="2.0"><channel><title>Feed</title><description>d</description><item></item></channel></rss>';
const PAGE_BODY = '<!DOCTYPE html><html><body>an ordinary page</body></html>';

function instanceFor(fixture: string, site: string) {
	const { document } = parseHTML(
		readFileSync(new URL(`./fixtures/html/${fixture}.html`, import.meta.url), 'utf-8')
	);
	return { site, document, options: { timeout: 5 }, emit: () => {} } as any;
}
const fetched = () => mockFetch.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
	mockFetch.mockReset();
	mockFetch.mockImplementation(
		async (url: string) =>
			new Response(REAL_FEEDS.has(url) ? FEED_BODY : PAGE_BODY, { status: 200 })
	);
});

describe('metaLinks on real pages', () => {
	it.each([
		[
			'wordpress',
			'https://wordpress.org/news/',
			[
				['https://wordpress.org/news/feed/', 'WordPress News » Feed'],
				['https://wordpress.org/news/comments/feed/', 'WordPress News » Comments Feed'],
				['https://wordpress.org/news/feed/podcast', 'Podcast RSS feed']
			]
		],
		// unquoted attributes, root-relative href
		['hugo', 'https://gohugo.io/news/', [['https://gohugo.io/news/index.xml', null]]],
		// includes a feed on another domain (GitHub)
		[
			'jekyll',
			'https://jekyllrb.com/news/',
			[
				['https://jekyllrb.com/feed.xml', 'Jekyll • Simple, blog-aware, static sites'],
				['https://jekyllrb.com/feed/release.xml', 'Jekyll releases posts'],
				[
					'https://github.com/jekyll/jekyll/commits/master.atom',
					'Recent commits to Jekyll’s master branch'
				]
			]
		],
		[
			'mastodon',
			'https://mastodon.social/@Mastodon',
			[['https://mastodon.social/@Mastodon.rss', null]]
		],
		// rel="service.post" also points at a (real) feed
		[
			'blogger',
			'https://blogger.googleblog.com/',
			[
				['https://blogger.googleblog.com/feeds/posts/default', 'Official Blogger Blog - Atom'],
				[
					'https://blogger.googleblog.com/feeds/posts/default?alt=rss',
					'Official Blogger Blog - RSS'
				],
				['https://www.blogger.com/feeds/2399953/posts/default', 'Official Blogger Blog - Atom']
			]
		],
		[
			'substack',
			'https://www.noahpinion.blog/',
			[['https://www.noahpinion.blog/feed', 'Noahpinion']]
		],
		[
			'platformer (Ghost)',
			'https://www.platformer.news/',
			[['https://www.platformer.news/rss/', 'Platformer']]
		],
		[
			'github',
			'https://github.com/nodejs/node/releases',
			[
				['https://github.com/nodejs/node/releases.atom', 'node Release Notes'],
				['https://github.com/nodejs/node/tags.atom', 'node Tags']
			]
		],
		// no feed link in the head at all
		['googleblog', 'https://blog.google/', []]
	])('%s', async (name, site, expected) => {
		const feeds = await metaLinks(instanceFor(name.split(' ')[0], site));
		expect(feeds.map((f) => [f.url, f.title])).toEqual(expected);
		expect(feeds.every((f) => f.type === 'rss' && f.feedTitle === 'Feed')).toBe(true);
	});

	it('never requests WordPress oEmbed endpoints', async () => {
		await metaLinks(instanceFor('wordpress', 'https://wordpress.org/news/'));
		expect(fetched().some((u) => u.includes('/oembed/'))).toBe(false);
	});

	it('rejects JSON links that are not feeds (WordPress REST API, Mastodon ActivityPub)', async () => {
		const wp = await metaLinks(instanceFor('wordpress', 'https://wordpress.org/news/'));
		expect(wp.some((f) => f.url.includes('/wp-json/'))).toBe(false);
		const mastodon = await metaLinks(instanceFor('mastodon', 'https://mastodon.social/@Mastodon'));
		expect(mastodon.some((f) => f.url.endsWith('/users/Mastodon'))).toBe(false);
	});
});

describe('anchors on real pages', () => {
	it('finds blog.google’s feed, which is only linked in the page body', async () => {
		const feeds = await checkAllAnchors(instanceFor('googleblog', 'https://blog.google/'));
		expect(feeds.map((f) => f.url)).toEqual(['https://blog.google/rss/']);
		// "/feed" is linked too, but serves an HTML page
		expect(fetched()).toContain('https://blog.google/feed');
	});

	it('skips feed links on other domains (Blogger links buzz.blogger.com)', async () => {
		await checkAllAnchors(instanceFor('blogger', 'https://blogger.googleblog.com/'));
		expect(fetched().some((u) => u.includes('buzz.blogger.com'))).toBe(false);
	});

	it.each([
		['wordpress', 'https://wordpress.org/news/'],
		['hugo', 'https://gohugo.io/news/'],
		['jekyll', 'https://jekyllrb.com/news/'],
		['platformer', 'https://www.platformer.news/'],
		['github', 'https://github.com/nodejs/node/releases']
	])('reports no false positives on %s', async (name, site) => {
		expect(await checkAllAnchors(instanceFor(name, site))).toEqual([]);
		expect(fetched().length).toBeGreaterThan(0);
	});
});

/**
 * Feed discovery against real, live websites. Not part of `npm test` (network,
 * flaky by nature); run with `npm run test:live` — nightly in CI
 * (.github/workflows/live.yml). A failure means a site changed its markup or
 * feed path, started blocking us, or is down: check by hand before "fixing" code.
 */
import { describe, it, expect } from 'vitest';
import FeedSeeker, { type FeedSeekerOptions } from '../../feedseeker.ts';

const meta: FeedSeekerOptions = { metasearch: true, timeout: 15 };

describe.each([
	// [site, options, a feed URL that must be among the results]
	['https://wordpress.org/news/', meta, 'https://wordpress.org/news/feed/'],
	['https://gohugo.io/news/', meta, 'https://gohugo.io/news/index.xml'],
	['https://jekyllrb.com/news/', meta, 'https://jekyllrb.com/feed.xml'],
	['https://mastodon.social/@Mastodon', meta, 'https://mastodon.social/@Mastodon.rss'],
	['https://blogger.googleblog.com/', meta, 'https://blogger.googleblog.com/feeds/posts/default'],
	['https://www.noahpinion.blog/', meta, 'https://www.noahpinion.blog/feed'],
	['https://www.platformer.news/', meta, 'https://www.platformer.news/rss/'],
	['https://github.com/nodejs/node/releases', meta, 'https://github.com/nodejs/node/releases.atom'],
	// only linked in the page body
	['https://blog.google/', { anchorsonly: true, timeout: 15 }, 'https://blog.google/rss/'],
	// not linked at all: found by guessing common paths
	[
		'https://xkcd.com/',
		{ blindsearch: true, searchMode: 'fast', timeout: 15 },
		'https://xkcd.com/atom.xml'
	],
	// the default search, all strategies
	['https://daringfireball.net/', { timeout: 15 }, 'https://daringfireball.net/feeds/main']
] as const)('%s', (site, options, expected) => {
	it(`finds ${expected}`, { timeout: 120_000, retry: 2 }, async () => {
		const feeds = await new FeedSeeker(site, { ...options }).startSearch();
		expect(feeds.map((f) => f.url)).toContain(expected);
	});
});

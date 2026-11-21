import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { escapeXml, formatOpml, printFeeds } from '../cli/output.ts';
import { type Feed } from '../modules/metaLinks.ts';

const feed = (url: string, type: Feed['type'], title: string | null = null, feedTitle: string | null = null): Feed => ({
	url,
	type,
	title,
	feedTitle
});

describe('escapeXml', () => {
	it('escapes &, <, > and "', () => {
		expect(escapeXml('a & <b> "c"')).toBe('a &amp; &lt;b&gt; &quot;c&quot;');
	});

	it('escapes & first, so existing entities are not left ambiguous', () => {
		expect(escapeXml('&lt;')).toBe('&amp;lt;');
	});
});

describe('formatOpml', () => {
	it('produces the exact OPML document', () => {
		const opml = formatOpml(
			[
				feed('https://a.example/atom', 'atom', 'Link title', 'Atom Feed'),
				feed('https://a.example/feed.json', 'json', 'Only link title'),
				feed('https://a.example/rss', 'rss')
			],
			'https://a.example'
		);
		expect(opml).toBe(
			[
				'<?xml version="1.0" encoding="UTF-8"?>',
				'<opml version="2.0">',
				'<head>',
				'  <title>Feeds from https://a.example</title>',
				'</head>',
				'<body>',
				'  <outline type="atom" text="Atom Feed" title="Atom Feed" xmlUrl="https://a.example/atom"/>',
				'  <outline type="json" text="Only link title" title="Only link title" xmlUrl="https://a.example/feed.json"/>',
				'  <outline type="rss" text="https://a.example/rss" title="https://a.example/rss" xmlUrl="https://a.example/rss"/>',
				'</body>',
				'</opml>'
			].join('\n')
		);
	});

	it('escapes titles and the site in the head', () => {
		const opml = formatOpml([feed('https://a.example/rss', 'rss', null, 'Tom & "Jerry" <3')], 'https://a.example/?a=1&b=2');
		expect(opml).toContain('<title>Feeds from https://a.example/?a=1&amp;b=2</title>');
		expect(opml).toContain('text="Tom &amp; &quot;Jerry&quot; &lt;3"');
	});

	it('escapes the feed URL in xmlUrl', () => {
		const opml = formatOpml([feed('https://a.example/?feed=rss2&lang=de', 'rss')], 'https://a.example');
		expect(opml).toContain('xmlUrl="https://a.example/?feed=rss2&amp;lang=de"');
		expect(opml).not.toMatch(/&(?!amp;|lt;|gt;|quot;)/);
	});

	it('has an empty body for no feeds', () => {
		expect(formatOpml([], 'x')).toContain('<body>\n\n</body>');
	});
});

describe('printFeeds', () => {
	let log: Mock;
	// eslint-disable-next-line no-control-regex
	const lines = () => log.mock.calls.map((c) => String(c[0]).replace(/\x1b\[[0-9;]*m/g, ''));
	beforeEach(() => {
		log = vi.spyOn(console, 'log').mockImplementation(() => {}) as unknown as Mock;
	});
	afterEach(() => vi.restoreAllMocks());

	it('prints the title above the URL, with a blank line between feeds only', () => {
		printFeeds([
			feed('https://a.example/1', 'rss', 'Link', 'Feed One'),
			feed('https://a.example/2', 'rss', 'Link Two'),
			feed('https://a.example/3', 'rss')
		]);
		expect(lines()).toEqual([
			'Feed One', 'https://a.example/1', '',
			'Link Two', 'https://a.example/2', '',
			'https://a.example/3'
		]);
	});

	it('skips empty titles', () => {
		printFeeds([feed('https://a.example/1', 'rss', null, '')]);
		expect(lines()).toEqual(['https://a.example/1']);
	});

	it('prints nothing for no feeds', () => {
		printFeeds([]);
		expect(log).not.toHaveBeenCalled();
	});
});

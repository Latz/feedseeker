import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseHTML } from 'linkedom';
import metaLinks from '../modules/metaLinks.ts';

// Mock checkFeed to avoid network calls
vi.mock('../modules/checkFeed.ts', () => ({
	default: vi.fn()
}));
import checkFeed from '../modules/checkFeed.ts';

// Mock fetchWithTimeout (transitively imported by checkFeed in the real module)
vi.mock('../modules/fetchWithTimeout.ts', () => ({
	default: vi.fn()
}));

function makeInstance(html, options = {}) {
	const { document } = parseHTML(html);
	const events = [];
	return {
		document,
		site: 'https://example.com',
		options,
		emit: (event, data) => events.push({ event, data }),
		_events: events
	};
}

describe('metaLinks()', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('emits "start" event at the beginning', async () => {
		const instance = makeInstance('<!DOCTYPE html><html><head></head><body></body></html>');
		await metaLinks(instance);
		const startEvent = instance._events.find((e) => e.event === 'start');
		expect(startEvent).toBeDefined();
		expect(startEvent.data).toMatchObject({ module: 'metalinks' });
	});

	it('always emits "end" event, even for an empty document', async () => {
		const instance = makeInstance('<!DOCTYPE html><html><head></head><body></body></html>');
		await metaLinks(instance);
		const endEvent = instance._events.find((e) => e.event === 'end');
		expect(endEvent).toBeDefined();
		expect(endEvent.data).toMatchObject({ module: 'metalinks' });
	});

	it('end event data contains the discovered feeds array', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'My Feed' });
		const instance = makeInstance(`<html><head>
      <link type="application/rss+xml" href="/feed.xml">
    </head></html>`);
		const result = await metaLinks(instance);
		const endEvent = instance._events.find((e) => e.event === 'end');
		expect(endEvent.data.feeds).toEqual(result);
	});

	it('returns [] for empty document', async () => {
		const instance = makeInstance('<!DOCTYPE html><html><head></head><body></body></html>');
		const result = await metaLinks(instance);
		expect(result).toEqual([]);
		expect(checkFeed).not.toHaveBeenCalled();
	});

	it('returns [] when checkFeed returns null for every link', async () => {
		checkFeed.mockResolvedValue(null);
		const instance = makeInstance(`<html><head>
      <link type="application/rss+xml" href="/feed.xml">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(result).toEqual([]);
	});

	it('finds RSS feed via type="application/rss+xml"', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'My RSS Feed' });
		const instance = makeInstance(`<html><head>
      <link type="application/rss+xml" href="/feed.xml">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(checkFeed).toHaveBeenCalledWith(
			'https://example.com/feed.xml',
			'',
			instance,
			undefined
		);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			url: 'https://example.com/feed.xml',
			type: 'rss',
			feedTitle: 'My RSS Feed'
		});
	});

	it('finds Atom feed via type="application/atom+xml"', async () => {
		checkFeed.mockResolvedValue({ type: 'atom', title: 'My Atom Feed' });
		const instance = makeInstance(`<html><head>
      <link type="application/atom+xml" href="/atom.xml">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ url: 'https://example.com/atom.xml', type: 'atom' });
	});

	it('finds JSON feed via type="application/feed+json"', async () => {
		checkFeed.mockResolvedValue({ type: 'json', title: 'JSON Feed' });
		const instance = makeInstance(`<html><head>
      <link type="application/feed+json" href="/feed.json">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(result).toHaveLength(1);
		expect(result[0].type).toBe('json');
	});

	it('finds feed via type="application/rdf+xml"', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'RDF Feed' });
		const instance = makeInstance(`<html><head>
      <link type="application/rdf+xml" href="/rdf.xml">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(result).toHaveLength(1);
	});

	it('finds feed via type="application/xml"', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'XML Feed' });
		const instance = makeInstance(`<html><head>
      <link type="application/xml" href="/podcast.xml">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(result).toHaveLength(1);
	});

	it('finds feed via rel="alternate" type="application/rss+xml"', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Alternate RSS' });
		const instance = makeInstance(`<html><head>
      <link rel="alternate" type="application/rss+xml" href="/rss-unique-path">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe('https://example.com/rss-unique-path');
	});

	it('finds feed via rel="alternate" with atom type', async () => {
		checkFeed.mockResolvedValue({ type: 'atom', title: 'Alternate Atom' });
		const instance = makeInstance(`<html><head>
      <link rel="alternate" type="application/atom+xml" href="/atom-unique">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(result).toHaveLength(1);
	});

	it('finds feed via rel="alternate" href matching /feed pattern', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Pattern Feed' });
		const instance = makeInstance(`<html><head>
      <link rel="alternate" href="/feed">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(result).toHaveLength(1);
	});

	it('finds feed via rel="alternate" href matching .xml extension', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'XML Feed' });
		const instance = makeInstance(`<html><head>
      <link rel="alternate" href="/syndication.xml">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(result).toHaveLength(1);
	});

	it('finds feed via rel="alternate" href matching .atom extension', async () => {
		checkFeed.mockResolvedValue({ type: 'atom', title: 'Atom Pattern' });
		const instance = makeInstance(`<html><head>
      <link rel="alternate" href="/blog.atom">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(result).toHaveLength(1);
	});

	it('finds feed via rel="alternate" href matching /rss pattern', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'RSS Pattern' });
		const instance = makeInstance(`<html><head>
      <link rel="alternate" href="/rss">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(result).toHaveLength(1);
	});

	it('skips rel="alternate" link whose href does not match feed patterns', async () => {
		const instance = makeInstance(`<html><head>
      <link rel="alternate" href="/about">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(result).toEqual([]);
		expect(checkFeed).not.toHaveBeenCalled();
	});

	it('includes link title attribute on returned feed object', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Feed Title From Content' });
		const instance = makeInstance(`<html><head>
      <link type="application/rss+xml" title="My Blog RSS" href="/feed.xml">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(result[0].title).toBe('My Blog RSS');
	});

	it('cleans excessive whitespace from link title attribute', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: null });
		const instance = makeInstance(`<html><head>
      <link type="application/rss+xml" title="  My   Blog  " href="/feed.xml">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(result[0].title).toBe('My Blog');
	});

	it('sets title to null when link has no title attribute', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Feed Title' });
		const instance = makeInstance(`<html><head>
      <link type="application/rss+xml" href="/feed.xml">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(result[0].title).toBeNull();
	});

	it('stores feedTitle from checkFeed result separately from link title', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Content-level Title' });
		const instance = makeInstance(`<html><head>
      <link type="application/rss+xml" title="Link Title" href="/feed.xml">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(result[0].title).toBe('Link Title');
		expect(result[0].feedTitle).toBe('Content-level Title');
	});

	it('does not call checkFeed twice for the same absolute URL', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Feed' });
		const instance = makeInstance(`<html><head>
      <link type="application/rss+xml" href="/dup.xml">
      <link rel="alternate" href="/dup.xml">
    </head></html>`);
		await metaLinks(instance);
		const callsForUrl = checkFeed.mock.calls.filter((c) => c[0] === 'https://example.com/dup.xml');
		expect(callsForUrl).toHaveLength(1);
	});

	it('returns all feeds when maxFeeds is 0 (unlimited)', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Feed' });
		const instance = makeInstance(
			`<html><head>
      <link type="application/rss+xml" href="/feed1.xml">
      <link type="application/rss+xml" href="/feed2.xml">
    </head></html>`,
			{ maxFeeds: 0 }
		);
		const result = await metaLinks(instance);
		expect(result).toHaveLength(2);
	});

	it('emits a log event when maxFeeds limit is reached', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Feed' });
		const instance = makeInstance(
			`<html><head>
      <link type="application/rss+xml" href="/feed1.xml">
      <link type="application/rss+xml" href="/feed2.xml">
    </head></html>`,
			{ maxFeeds: 1 }
		);
		await metaLinks(instance);
		const logEvent = instance._events.find(
			(e) => e.event === 'log' && e.data?.message?.includes('maximum feeds limit')
		);
		expect(logEvent).toBeDefined();
	});

	it('stops at the start of a later batch when maxFeeds was already reached in an earlier batch', async () => {
		// 6 links with batchSize=5: batch 1 processes links 1-5, batch 2 (link 6) should
		// short-circuit at the top of the loop instead of running any more checkFeed calls.
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Feed' });
		const links = Array.from({ length: 6 }, (_, i) => `<link type="application/rss+xml" href="/feed${i + 1}.xml">`).join('\n');
		const instance = makeInstance(`<html><head>${links}</head></html>`, { maxFeeds: 1 });
		await metaLinks(instance);
		const callsForBatch2 = checkFeed.mock.calls.filter((c) => c[0] === 'https://example.com/feed6.xml');
		expect(callsForBatch2).toHaveLength(0);
	});

	it('emits error and returns null href when a link href fails URL resolution, only when showErrors is true', async () => {
		const html = `<html><head><link type="application/rss+xml" href="http://[invalid"></head></html>`;
		const instanceShowErrors = makeInstance(html, { showErrors: true });
		const resultShow = await metaLinks(instanceShowErrors);
		expect(resultShow).toEqual([]);
		expect(checkFeed).not.toHaveBeenCalled();
		const errorEvent = instanceShowErrors._events.find((e) => e.event === 'error');
		expect(errorEvent).toBeDefined();
		expect(errorEvent.data.module).toBe('metalinks');

		checkFeed.mockClear();
		const instanceQuiet = makeInstance(html, { showErrors: false });
		const resultQuiet = await metaLinks(instanceQuiet);
		expect(resultQuiet).toEqual([]);
		expect(instanceQuiet._events.filter((e) => e.event === 'error')).toHaveLength(0);
	});

	it('stops after step 2 (rel=alternate type links) when maxFeeds is reached there, without evaluating step 3', async () => {
		// type="text/xml" doesn't match step 1's exact application/<type> selectors, but does
		// match step 2's `type*="xml"` substring selector — so this link is only found in step 2.
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Feed' });
		const html = `<html><head>
			<link rel="alternate" type="text/xml" href="/step2-feed.xml">
			<link rel="alternate" href="/feed/step3-pattern.xml">
		</head></html>`;
		const instance = makeInstance(html, { maxFeeds: 1 });
		const result = await metaLinks(instance);
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe('https://example.com/step2-feed.xml');
		const callsForStep3 = checkFeed.mock.calls.filter((c) => c[0] === 'https://example.com/feed/step3-pattern.xml');
		expect(callsForStep3).toHaveLength(0);
	});

	it('finds feeds via step 3 (href-pattern matched rel=alternate links) when steps 1 and 2 find nothing', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Feed' });
		const html = `<html><head>
			<link rel="alternate" href="/feed/pattern-match.xml">
		</head></html>`;
		const instance = makeInstance(html, { maxFeeds: 1 });
		const result = await metaLinks(instance);
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe('https://example.com/feed/pattern-match.xml');
	});

	it('skips a link when checkFeed throws and continues processing remaining links', async () => {
		checkFeed
			.mockRejectedValueOnce(new Error('Network error'))
			.mockResolvedValueOnce({ type: 'rss', title: 'Second Feed' });
		const instance = makeInstance(
			`<html><head>
      <link type="application/rss+xml" href="/bad.xml">
      <link type="application/rss+xml" href="/good.xml">
    </head></html>`,
			{ showErrors: false }
		);
		const result = await metaLinks(instance);
		expect(result).toHaveLength(1);
		expect(result[0].url).toBe('https://example.com/good.xml');
	});

	it('emits error event when checkFeed throws and showErrors is true', async () => {
		checkFeed.mockRejectedValue(new Error('timeout'));
		const instance = makeInstance(
			`<html><head>
      <link type="application/rss+xml" href="/feed.xml">
    </head></html>`,
			{ showErrors: true }
		);
		await metaLinks(instance);
		const errorEvent = instance._events.find((e) => e.event === 'error');
		expect(errorEvent).toBeDefined();
		expect(errorEvent.data).toMatchObject({ module: 'metalinks' });
	});

	it('does NOT emit error event when showErrors is false and checkFeed throws', async () => {
		checkFeed.mockRejectedValue(new Error('timeout'));
		const instance = makeInstance(
			`<html><head>
      <link type="application/rss+xml" href="/feed.xml">
    </head></html>`,
			{ showErrors: false }
		);
		await metaLinks(instance);
		const errorEvent = instance._events.find((e) => e.event === 'error');
		expect(errorEvent).toBeUndefined();
	});

	it('skips a link element that has no href attribute', async () => {
		const instance = makeInstance(`<html><head>
      <link type="application/rss+xml">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(result).toEqual([]);
		expect(checkFeed).not.toHaveBeenCalled();
	});

	it('resolves relative hrefs against instance.site', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Feed' });
		const instance = makeInstance(`<html><head>
      <link type="application/rss+xml" href="/blog/feed.xml">
    </head></html>`);
		instance.site = 'https://myblog.com';
		const result = await metaLinks(instance);
		expect(result[0].url).toBe('https://myblog.com/blog/feed.xml');
	});

	it('collects feeds found across all three selector passes', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Feed' });
		const instance = makeInstance(`<html><head>
      <link type="application/rss+xml" href="/type-feed.xml">
      <link rel="alternate" href="/pattern/feed">
    </head></html>`);
		const result = await metaLinks(instance);
		expect(result).toHaveLength(2);
	});

	it('emits a log event for each URL checked', async () => {
		checkFeed.mockResolvedValue({ type: 'rss', title: 'Feed' });
		const instance = makeInstance(`<html><head>
      <link type="application/rss+xml" href="/feed1.xml">
      <link type="application/rss+xml" href="/feed2.xml">
    </head></html>`);
		await metaLinks(instance);
		const logEvents = instance._events.filter(
			(e) => e.event === 'log' && e.data?.message?.startsWith('Checking feed')
		);
		expect(logEvents).toHaveLength(2);
	});

	it('emits a log event with the rejection reason when verbose and checkFeed rejects', async () => {
		checkFeed.mockImplementation(async (url, _content, _instance, onReject) => {
			onReject?.('content is a valid Atom feed but has no entries yet');
			return null;
		});
		const instance = makeInstance(
			`<html><head><link type="application/atom+xml" href="/feed.xml"></head></html>`,
			{ verbose: true }
		);
		await metaLinks(instance);
		const reasonEvent = instance._events.find(
			(e) => e.event === 'log' && e.data?.reason && e.data?.url
		);
		expect(reasonEvent).toBeDefined();
		expect(reasonEvent.data).toMatchObject({
			module: 'metalinks',
			url: 'https://example.com/feed.xml',
			reason: 'content is a valid Atom feed but has no entries yet'
		});
	});

	it('does not emit a reason log event when not verbose', async () => {
		checkFeed.mockImplementation(async (url, _content, _instance, onReject) => {
			onReject?.('content is a valid Atom feed but has no entries yet');
			return null;
		});
		const instance = makeInstance(
			`<html><head><link type="application/atom+xml" href="/feed.xml"></head></html>`
		);
		await metaLinks(instance);
		const reasonEvent = instance._events.find((e) => e.event === 'log' && e.data?.reason);
		expect(reasonEvent).toBeUndefined();
	});
});

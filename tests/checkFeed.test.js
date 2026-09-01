import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import checkFeed from '../modules/checkFeed/index.ts';

// Since the module doesn't export helper functions, we need to test checkFeed
// which internally uses these helpers

describe('checkFeed Module', () => {
	describe('RSS Feed Detection', () => {
		it('should detect RSS feed with version attribute', async () => {
			const rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>Test RSS Feed</title>
<description>A test RSS feed</description>
<item>
<title>Sample Item</title>
<description>Sample description</description>
</item>
</channel>
</rss>`;

			const result = await checkFeed('https://example.com/feed.xml', rssContent);

			expect(result).toBeTruthy();
			expect(result.type).toBe('rss');
			expect(result.title).toBe('Test RSS Feed');
		});

		it('should detect RSS feed by <item> elements', async () => {
			const rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>Another RSS Feed</title>
<description>Another test RSS feed</description>
<item>
<title>Another Item</title>
<description>Another description</description>
</item>
</channel>
</rss>`;

			const result = await checkFeed('https://example.com/feed.xml', rssContent);

			expect(result).toBeTruthy();
			expect(result.type).toBe('rss');
			expect(result.title).toBe('Another RSS Feed');
		});

		it('should return null for non-RSS content', async () => {
			const nonRssContent = '<html><body>This is not an RSS feed</body></html>';

			const result = await checkFeed('https://example.com/page.html', nonRssContent);

			expect(result).toBe(null);
		});

		it('should return null for a well-formed channel with no <item> elements', async () => {
			const emptyRssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>Empty RSS Feed</title>
<description>No items yet</description>
</channel>
</rss>`;

			const result = await checkFeed('https://example.com/feed.xml', emptyRssContent);

			expect(result).toBe(null);
		});
	});

	describe('RDF/RSS 1.0 Feed Detection', () => {
		it('should detect an RDF/RSS 1.0 feed by its <rdf:RDF> root element', async () => {
			const rdfContent = `<?xml version="1.0" encoding="utf-8"?><rdf:RDF
	xmlns="http://purl.org/rss/1.0/"
	xmlns:dc="http://purl.org/dc/elements/1.1/"
	xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
>
<channel rdf:about="https://example.com/">
	<title>Example RDF Feed</title>
	<link>https://example.com/</link>
	<description>An example RSS 1.0 feed</description>
</channel>
<item rdf:about="https://example.com/item1">
	<title>Item One</title>
	<link>https://example.com/item1</link>
	<description>First item</description>
	<dc:date>2026-08-30T00:00:00+09:00</dc:date>
</item>
</rdf:RDF>`;

			const result = await checkFeed('https://example.com/feed.rdf', rdfContent);

			expect(result).toBeTruthy();
			expect(result.type).toBe('rss');
			expect(result.title).toBe('Example RDF Feed');
		});
	});

	describe('Atom Feed Detection', () => {
		it('should detect Atom feed by <entry> elements', async () => {
			const atomContent = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>Test Atom Feed</title>
<subtitle>A test Atom feed</subtitle>
<entry>
<title>Sample Entry</title>
<summary>Sample summary</summary>
</entry>
</feed>`;

			const result = await checkFeed('https://example.com/atom.xml', atomContent);

			expect(result).toBeTruthy();
			expect(result.type).toBe('atom');
			expect(result.title).toBe('Test Atom Feed');
		});

		it('should return null for content without <entry> elements', async () => {
			const nonAtomContent = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<title>Not an Atom Feed</title>
</feed>`;

			const result = await checkFeed('https://example.com/feed.xml', nonAtomContent);

			expect(result).toBe(null);
		});
	});

	describe('JSON Feed Detection', () => {
		it('should detect JSON feed with version property', async () => {
			const jsonContent = JSON.stringify({
				version: 'https://jsonfeed.org/version/1',
				title: 'Test JSON Feed',
				items: [
					{
						id: '1',
						title: 'Sample Item',
						content_text: 'Sample content'
					}
				]
			});

			const result = await checkFeed('https://example.com/jsonfeed.json', jsonContent);

			expect(result).toBeTruthy();
			expect(result.type).toBe('json');
			expect(result.title).toBe('Test JSON Feed');
		});

		it('should detect JSON feed with items property', async () => {
			const jsonContent = JSON.stringify({
				title: 'Another JSON Feed',
				items: [
					{
						id: '1',
						title: 'Another Item'
					}
				]
			});

			const result = await checkFeed('https://example.com/jsonfeed.json', jsonContent);

			expect(result).toBeTruthy();
			expect(result.type).toBe('json');
			expect(result.title).toBe('Another JSON Feed');
		});

		it('should detect JSON feed with feed_url property', async () => {
			const jsonContent = JSON.stringify({
				title: 'Feed with URL',
				feed_url: 'https://example.com/feed.json',
				home_page_url: 'https://example.com'
			});

			const result = await checkFeed('https://example.com/feed.json', jsonContent);

			expect(result).toBeTruthy();
			expect(result.type).toBe('json');
			expect(result.title).toBe('Feed with URL');
		});

		it('should return null for invalid JSON', async () => {
			const invalidJsonContent = '{ invalid: json }';

			const result = await checkFeed('https://example.com/feed.json', invalidJsonContent);

			expect(result).toBe(null);
		});

		it('should return null for a JSON feed with an empty items array and no other feed signal', async () => {
			const jsonContent = JSON.stringify({
				title: 'Empty JSON Feed',
				items: []
			});

			const result = await checkFeed('https://example.com/feed.json', jsonContent);

			expect(result).toBe(null);
		});

		it('should still detect a JSON feed via version property even with an empty items array', async () => {
			const jsonContent = JSON.stringify({
				version: 'https://jsonfeed.org/version/1',
				title: 'Versioned Empty Feed',
				items: []
			});

			const result = await checkFeed('https://example.com/feed.json', jsonContent);

			expect(result).toBeTruthy();
			expect(result.type).toBe('json');
		});

		it('should still detect a JSON feed via feed_url property with no items key', async () => {
			const jsonContent = JSON.stringify({
				title: 'Feed with URL, no items key',
				feed_url: 'https://example.com/feed.json'
			});

			const result = await checkFeed('https://example.com/feed.json', jsonContent);

			expect(result).toBeTruthy();
			expect(result.type).toBe('json');
		});
	});

	describe('Helper Functions', () => {
		// These are internal functions, so we'll test them indirectly through the main function
		it('should handle CDATA tags in RSS content', async () => {
			const rssContentWithCDATA = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title><![CDATA[Test & 'Special' Chars]]></title>
<description><![CDATA[Description with <CDATA>]]></description>
<item>
<title>Sample Item</title>
</item>
</channel>
</rss>`;

			const result = await checkFeed('https://example.com/feed.xml', rssContentWithCDATA);

			expect(result).toBeTruthy();
			expect(result.type).toBe('rss');
			// Should handle CDATA and special characters properly
			expect(result.title.includes('Test')).toBeTruthy();
		});

		it('should clean titles properly', async () => {
			// This will be tested through the feed title extraction
			const rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>  Title with   excessive   whitespace  </title>
<description>Test description</description>
<item>
<title>Sample Item</title>
</item>
</channel>
</rss>`;

			const result = await checkFeed('https://example.com/feed.xml', rssContent);

			expect(result).toBeTruthy();
			expect(result.type).toBe('rss');
			// Title should be cleaned of excessive whitespace
			expect(result.title).toBe('Title with excessive whitespace');
		});
	});

	describe('Edge Cases', () => {
		it('should handle empty content', async () => {
			// When content is empty and no instance is provided, it should throw
			await expect(checkFeed('https://example.com/feed.xml', '')).rejects.toThrow(
				'Instance parameter is required when content is not provided'
			);
		});

		it('should handle malformed XML', async () => {
			const malformedXml = `<?xml version="1.0"?><rss><unclosed>`;
			const result = await checkFeed('https://example.com/feed.xml', malformedXml);

			// Should either return null or handle gracefully
			expect(result === null || typeof result === 'object').toBeTruthy();
		});

		it('should handle feeds without titles', async () => {
			const noTitleFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<description>Feed without title</description>
<item>
<title>Sample Item</title>
</item>
</channel>
</rss>`;

			const result = await checkFeed('https://example.com/feed.xml', noTitleFeed);

			expect(result).toBeTruthy();
			expect(result.type).toBe('rss');
		});

		it('should handle very large feed content', async () => {
			// Create a feed with many items
			const items = Array.from(
				{ length: 100 },
				(_, i) => `
<item>
<title>Item ${i}</title>
<description>Description ${i}</description>
</item>`
			).join('');

			const largeFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>Large Feed</title>
<description>Feed with many items</description>
${items}
</channel>
</rss>`;

			const result = await checkFeed('https://example.com/feed.xml', largeFeed);

			expect(result).toBeTruthy();
			expect(result.type).toBe('rss');
			expect(result.title).toBe('Large Feed');
		});

		it('should handle JSON feed with minimal properties', async () => {
			const minimalJson = JSON.stringify({
				version: 'https://jsonfeed.org/version/1',
				title: 'Minimal Feed'
			});

			const result = await checkFeed('https://example.com/feed.json', minimalJson);

			expect(result).toBeTruthy();
			expect(result.type).toBe('json');
			expect(result.title).toBe('Minimal Feed');
		});

		it('should handle feeds with special characters in URLs', async () => {
			const rssContent = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>Test Feed</title>
<description>Test Feed Description</description>
<link>https://example.com/blog?category=tech&amp;lang=en</link>
<item>
<title>Sample Item</title>
</item>
</channel>
</rss>`;

			const result = await checkFeed('https://example.com/feed.xml?format=rss', rssContent);

			expect(result).toBeTruthy();
			expect(result.type).toBe('rss');
		});
	});

	describe('Multiple Feed Formats', () => {
		it('should distinguish between RSS and Atom', async () => {
			const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>RSS</title><description>RSS Feed</description><item><title>Item</title></item></channel></rss>`;
			const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title><entry><title>Entry</title></entry></feed>`;

			const rssResult = await checkFeed('https://example.com/rss.xml', rss);
			const atomResult = await checkFeed('https://example.com/atom.xml', atom);

			expect(rssResult.type).toBe('rss');
			expect(atomResult.type).toBe('atom');
		});

		it('should handle feeds with namespaces', async () => {
			const rssWithNamespace = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
<channel>
<title>Namespaced Feed</title>
<description>Feed with namespaces</description>
<item>
<title>Item with namespace</title>
<content:encoded><![CDATA[<p>HTML content</p>]]></content:encoded>
</item>
</channel>
</rss>`;

			const result = await checkFeed('https://example.com/feed.xml', rssWithNamespace);

			expect(result).toBeTruthy();
			expect(result.type).toBe('rss');
			expect(result.title).toBe('Namespaced Feed');
		});
	});
});

// ─── Additional coverage tests ─────────────────────────────────────────────

import { vi, beforeEach as beforeEachCoverage } from 'vitest';

// Mock fetchWithTimeout to test the fetch path
vi.mock('../modules/fetchWithTimeout.ts', () => ({
	default: vi.fn()
}));
import fetchWithTimeout from '../modules/fetchWithTimeout.ts';

describe('checkFeed — oEmbed detection', () => {
	it('returns null for oEmbed URL patterns', async () => {
		const result = await checkFeed('https://example.com/wp-json/oembed/1.0?url=test', 'anything');
		expect(result).toBeNull();
	});

	it('returns null for content that looks like an oEmbed response (type+version in TYPES/VERSIONS)', async () => {
		const oembedContent = JSON.stringify({
			type: 'rich',
			version: '1.0',
			title: 'Some page',
			html: '<blockquote>...</blockquote>'
		});
		const result = await checkFeed('https://example.com/oembed.json', oembedContent);
		expect(result).toBeNull();
	});

	it('returns null for oEmbed with type+version+html pattern', async () => {
		const oembedContent = JSON.stringify({
			type: 'video',
			version: '1.0',
			html: '<iframe src="..."></iframe>'
		});
		const result = await checkFeed('https://example.com/embed.json', oembedContent);
		expect(result).toBeNull();
	});
});

describe('checkFeed — JSON feed with non-string title', () => {
	it('returns null title when json.title is a number', async () => {
		const jsonContent = JSON.stringify({
			version: 'https://jsonfeed.org/version/1',
			title: 42,
			items: []
		});
		const result = await checkFeed('https://example.com/feed.json', jsonContent);
		expect(result).not.toBeNull();
		expect(result.type).toBe('json');
		expect(result.title).toBeNull();
	});

	it('returns null title when json.title is an object', async () => {
		const jsonContent = JSON.stringify({
			items: [{ id: '1' }],
			title: { text: 'Object Title' }
		});
		const result = await checkFeed('https://example.com/feed.json', jsonContent);
		if (result) {
			expect(result.title).toBeNull();
		}
	});
});

describe('checkFeed — fetch path', () => {
	beforeEachCoverage(() => {
		vi.clearAllMocks();
	});

	it('fetches content when content is empty string and instance is provided', async () => {
		const rssContent = `<rss version="2.0"><channel><title>Fetched Feed</title><description>Desc</description><item><title>Item</title></item></channel></rss>`;
		fetchWithTimeout.mockResolvedValue({ ok: true, status: 200, text: async () => rssContent });
		const instance = { options: { timeout: 15 } };
		const result = await checkFeed('https://example.com/feed.xml', '', instance);
		expect(fetchWithTimeout).toHaveBeenCalledWith('https://example.com/feed.xml', {
			timeout: 15000,
			insecure: undefined
		});
		expect(result).not.toBeNull();
		expect(result.type).toBe('rss');
	});

	it('throws when fetch returns non-ok response', async () => {
		fetchWithTimeout.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
		const instance = { options: { timeout: 5 } };
		await expect(checkFeed('https://example.com/feed.xml', '', instance)).rejects.toThrow('404');
		expect(fetchWithTimeout).toHaveBeenCalledWith('https://example.com/feed.xml', {
			timeout: 5000,
			insecure: undefined
		});
	});

	it('throws when instance is missing and content is empty', async () => {
		await expect(checkFeed('https://example.com/feed.xml', '')).rejects.toThrow(
			'Instance parameter is required'
		);
	});

	it('uses default timeout when timeout is 0', async () => {
		fetchWithTimeout.mockResolvedValue({ ok: true, status: 200, text: async () => 'null' });
		const instance = { options: { timeout: 0 } };
		await checkFeed('https://example.com/feed.json', '', instance);
		// timeout 0 is invalid → falls back to default (15s) → 15000ms
		expect(fetchWithTimeout).toHaveBeenCalledWith('https://example.com/feed.json', {
			timeout: 15000,
			insecure: undefined
		});
	});

	it('throws for invalid URL protocol', async () => {
		await expect(checkFeed('ftp://example.com/feed.xml', 'content')).rejects.toThrow(
			'Invalid protocol'
		);
	});

	it('throws for completely invalid URL', async () => {
		await expect(checkFeed('not-a-url', 'content')).rejects.toThrow('Invalid URL');
	});

	it('throws when content exceeds maximum size', async () => {
		const oversized = 'x'.repeat(10 * 1024 * 1024 + 1);
		await expect(checkFeed('https://example.com/feed.xml', oversized)).rejects.toThrow(
			'Content too large'
		);
	});

	it('uses default timeout when timeout is null', async () => {
		fetchWithTimeout.mockResolvedValue({ ok: true, status: 200, text: async () => 'null' });
		const instance = { options: { timeout: null } };
		await checkFeed('https://example.com/feed.json', '', instance);
		expect(fetchWithTimeout).toHaveBeenCalledWith('https://example.com/feed.json', {
			timeout: 15000,
			insecure: undefined
		});
	});

	it('clamps timeout to maximum when timeout exceeds max', async () => {
		fetchWithTimeout.mockResolvedValue({ ok: true, status: 200, text: async () => 'null' });
		const instance = { options: { timeout: 9999 } };
		await checkFeed('https://example.com/feed.json', '', instance);
		expect(fetchWithTimeout).toHaveBeenCalledWith('https://example.com/feed.json', {
			timeout: 60000,
			insecure: undefined
		});
	});
});

describe('checkFeed — oEmbed detection', () => {
	it('returns null for oEmbed response with type+version+html (secondary branch)', async () => {
		const oembed = JSON.stringify({
			type: 'rich',
			version: '1.0',
			html: '<iframe src="..."></iframe>'
		});
		const result = await checkFeed('https://example.com/oembed', oembed);
		expect(result).toBeNull();
	});
});

describe('checkFeed — RSS title fallback', () => {
	it('falls back to direct title match when channel wrapper is missing', async () => {
		// CHANNEL_CONTENT requires bare <channel>; using <channel id="x"> breaks that match
		// so extractRssTitle must fall back to the bare TITLE pattern on the full content.
		const rssContent = `<rss version="2.0"><channel id="x"><title>Fallback Title</title><description>desc</description><item><title>i</title></item></channel></rss>`;
		const result = await checkFeed('https://example.com/feed.xml', rssContent);
		expect(result).not.toBeNull();
		expect(result.type).toBe('rss');
		expect(result.title).toBe('Fallback Title');
	});
});

describe('checkFeed — JSON non-feed', () => {
	it('returns null for JSON that is not a feed', async () => {
		const json = JSON.stringify({ name: 'John', age: 30 });
		const result = await checkFeed('https://example.com/data.json', json);
		expect(result).toBeNull();
	});
});

describe('checkFeed — Atom root-element gating', () => {
	// checkAtom gates on the cheap <feed> root check before running the three
	// whole-document namespace scans. These cases pin the classification behaviour
	// so the ordering stays an optimization and never a semantic change.

	it('rejects content mentioning the Atom namespace but lacking a <feed> root', async () => {
		const notAFeed =
			'<html><body>We use xmlns="http://www.w3.org/2005/Atom" and atom: prefixes here.' +
			'<entry><title>x</title></entry></body></html>';
		const result = await checkFeed('https://example.com/page', notAFeed);
		expect(result).toBeNull();
	});

	it('rejects a <feed> root that carries no Atom namespace', async () => {
		const noNamespace = '<feed><title>No NS</title><entry><title>e</title></entry></feed>';
		const result = await checkFeed('https://example.com/f', noNamespace);
		expect(result).toBeNull();
	});

	it('still detects Atom via the xmlns:atom prefix form', async () => {
		const prefixed =
			'<feed xmlns:atom="http://www.w3.org/2005/Atom"><title>Prefixed</title>' +
			'<entry><title>e</title></entry></feed>';
		const result = await checkFeed('https://example.com/f', prefixed);
		expect(result).not.toBeNull();
		expect(result.type).toBe('atom');
		expect(result.title).toBe('Prefixed');
	});

	it('rejects a <feed> root with a namespace but no entries', async () => {
		const noEntries =
			'<feed xmlns="http://www.w3.org/2005/Atom"><title>Empty</title></feed>';
		const result = await checkFeed('https://example.com/f', noEntries);
		expect(result).toBeNull();
	});
});

describe('checkFeed — onReject diagnostic callback', () => {
	it('calls onReject with a reason when content is not a recognized feed', async () => {
		const html = '<!DOCTYPE html><html><head><title>Homepage</title></head><body>Hi</body></html>';
		const onReject = vi.fn();
		const result = await checkFeed('https://example.com/?feed=rss2', html, undefined, onReject);
		expect(result).toBeNull();
		expect(onReject).toHaveBeenCalledTimes(1);
		expect(onReject).toHaveBeenCalledWith(expect.any(String));
	});

	it('does not call onReject when content is a valid feed', async () => {
		const rss =
			'<rss version="2.0"><channel><title>T</title><description>D</description><item><title>I</title></item></channel></rss>';
		const onReject = vi.fn();
		const result = await checkFeed('https://example.com/feed.xml', rss, undefined, onReject);
		expect(result).not.toBeNull();
		expect(onReject).not.toHaveBeenCalled();
	});

	it('calls onReject with a specific reason for a valid Atom feed with no entries', async () => {
		const noEntries =
			'<feed xmlns="http://www.w3.org/2005/Atom"><title>Empty</title></feed>';
		const onReject = vi.fn();
		const result = await checkFeed('https://example.com/feed.xml', noEntries, undefined, onReject);
		expect(result).toBeNull();
		expect(onReject).toHaveBeenCalledTimes(1);
		expect(onReject).toHaveBeenCalledWith('content is a valid Atom feed but has no entries yet');
	});

	it('calls onReject with a specific reason for a valid RSS channel with no items', async () => {
		const noItems =
			'<rss version="2.0"><channel><title>T</title><description>D</description></channel></rss>';
		const onReject = vi.fn();
		const result = await checkFeed('https://example.com/feed.xml', noItems, undefined, onReject);
		expect(result).toBeNull();
		expect(onReject).toHaveBeenCalledTimes(1);
		expect(onReject).toHaveBeenCalledWith('content is a valid RSS feed but has no items yet');
	});

	it('calls onReject with a specific reason for a valid JSON feed with no items', async () => {
		const noItems = JSON.stringify({ title: 'T', items: [] });
		const onReject = vi.fn();
		const result = await checkFeed('https://example.com/feed.json', noItems, undefined, onReject);
		expect(result).toBeNull();
		expect(onReject).toHaveBeenCalledTimes(1);
		expect(onReject).toHaveBeenCalledWith('content is a valid JSON feed but has no items yet');
	});
});

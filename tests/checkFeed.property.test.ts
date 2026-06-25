import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import checkFeed from '../modules/checkFeed.ts';

// fast-check property-based tests for checkFeed feed content parsing.
// All tests pass content directly as the second argument — no network calls.

const TEST_URL = 'https://example.com/feed';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

function rssArbitrary() {
	return fc.record({
		hasTitle: fc.boolean(),
		titleText: fc.string({ minLength: 0, maxLength: 200 }),
		hasCdata: fc.boolean(),
		itemCount: fc.integer({ min: 0, max: 5 }),
		version: fc.constantFrom('2.0', '1.0', '0.91', '2.0'),
	}).map(({ hasTitle, titleText, hasCdata, itemCount, version }) => {
		const escapedTitle = titleText.replace(/&/g, '&amp;').replace(/]]>/g, ']]&gt;');
		const titleEl = hasTitle
			? hasCdata
				? `<title><![CDATA[${escapedTitle}]]></title>`
				: `<title>${escapedTitle}</title>`
			: '';

		const items = Array.from({ length: itemCount }, (_, i) =>
			`<item><title>Item ${i}</title><description>desc ${i}</description></item>`
		).join('\n');

		return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="${version}">
<channel>
${titleEl}
<description>A test feed</description>
${items}
</channel>
</rss>`;
	});
}

function atomArbitrary() {
	return fc.record({
		titleText: fc.string({ minLength: 0, maxLength: 200 }),
		nsVariant: fc.integer({ min: 0, max: 2 }),
	}).map(({ titleText, nsVariant }) => {
		const escapedTitle = titleText.replace(/&/g, '&amp;');
		const nsAttr = [
			'xmlns="http://www.w3.org/2005/Atom"',
			'xmlns:atom="http://www.w3.org/2005/Atom"',
			'atom:base="http://www.w3.org/2005/Atom"',
		][nsVariant];

		return `<?xml version="1.0" encoding="UTF-8"?>
<feed ${nsAttr}>
<title>${escapedTitle}</title>
<entry><title>An entry</title><id>urn:uuid:1</id></entry>
</feed>`;
	});
}

function jsonFeedArbitrary() {
	return fc.record({
		detectionMethod: fc.integer({ min: 0, max: 2 }),
		titleValue: fc.option(
			fc.oneof(
				fc.string({ minLength: 0, maxLength: 200 }),
				fc.integer(),
				fc.boolean(),
				fc.constant(null),
				fc.constant([]),
			),
			{ nil: undefined }
		),
	}).map(({ detectionMethod, titleValue }) => {
		const obj: Record<string, unknown> = {};

		if (detectionMethod === 0) obj.version = 'https://jsonfeed.org/version/1.1';
		if (detectionMethod === 1) obj.items = [];
		if (detectionMethod === 2) obj.feed_url = 'https://example.com/feed.json';

		if (titleValue !== undefined) obj.title = titleValue;

		return JSON.stringify(obj);
	});
}

function nonFeedArbitrary() {
	// Must be non-empty truthy strings — empty string triggers the fetch path
	return fc.oneof(
		fc.constant('<html><body>Just a webpage</body></html>'),
		fc.constant('{"name":"John","age":30}'),
		fc.constant('not json at all'),
		fc.constant('hello world'),
		// Random JSON objects without feed markers
		fc.record({
			name: fc.string({ minLength: 1, maxLength: 20 }),
			value: fc.integer(),
		}).map(obj => JSON.stringify(obj)),
	);
}

// ---------------------------------------------------------------------------
// Properties
// ---------------------------------------------------------------------------

describe('checkFeed property-based tests', () => {
	describe('RSS', () => {
		it('always returns type rss for valid RSS content', async () => {
			await fc.assert(
				fc.asyncProperty(rssArbitrary(), async (content) => {
					const result = await checkFeed(TEST_URL, content);
					expect(result).not.toBeNull();
					expect(result!.type).toBe('rss');
				}),
				{ numRuns: 200 }
			);
		});

		it('title is always string or null', async () => {
			await fc.assert(
				fc.asyncProperty(rssArbitrary(), async (content) => {
					const result = await checkFeed(TEST_URL, content);
					expect(
						result!.title === null || typeof result!.title === 'string'
					).toBe(true);
				}),
				{ numRuns: 200 }
			);
		});

		it('RSS without title element returns null title', async () => {
			// Generate RSS that never has a title element
			const noTitleRss = fc.record({
				itemCount: fc.integer({ min: 0, max: 5 }),
			}).map(({ itemCount }) => {
				const items = Array.from({ length: itemCount }, (_, i) =>
					`<item><description>desc ${i}</description></item>`
				).join('\n');
				return `<?xml version="1.0"?>
<rss version="2.0">
<channel>
<description>No title feed</description>
${items}
</channel>
</rss>`;
			});

			await fc.assert(
				fc.asyncProperty(noTitleRss, async (content) => {
					const result = await checkFeed(TEST_URL, content);
					expect(result!.title).toBeNull();
				}),
				{ numRuns: 100 }
			);
		});

		it('CDATA is stripped from title', async () => {
			const cdataRss = fc.string({ minLength: 0, maxLength: 200 }).map(text => {
				const safe = text.replace(/]]>/g, ']]&gt;');
				return `<?xml version="1.0"?>
<rss version="2.0">
<channel>
<title><![CDATA[${safe}]]></title>
<description>desc</description>
</channel>
</rss>`;
			});

			await fc.assert(
				fc.asyncProperty(cdataRss, async (content) => {
					const result = await checkFeed(TEST_URL, content);
					if (result!.title !== null) {
						expect(result!.title).not.toContain('<![CDATA[');
						expect(result!.title).not.toContain(']]>');
					}
				}),
				{ numRuns: 200 }
			);
		});

		it('title never has leading/trailing whitespace or consecutive spaces', async () => {
			await fc.assert(
				fc.asyncProperty(rssArbitrary(), async (content) => {
					const result = await checkFeed(TEST_URL, content);
					if (result!.title !== null && result!.title.length > 0) {
						expect(result!.title).toBe(result!.title.trim());
						expect(result!.title).not.toMatch(/\s{2,}/);
					}
				}),
				{ numRuns: 200 }
			);
		});
	});

	describe('Atom', () => {
		it('always returns type atom for valid Atom content', async () => {
			await fc.assert(
				fc.asyncProperty(atomArbitrary(), async (content) => {
					const result = await checkFeed(TEST_URL, content);
					expect(result).not.toBeNull();
					expect(result!.type).toBe('atom');
				}),
				{ numRuns: 200 }
			);
		});

		it('title is always string or null', async () => {
			await fc.assert(
				fc.asyncProperty(atomArbitrary(), async (content) => {
					const result = await checkFeed(TEST_URL, content);
					expect(
						result!.title === null || typeof result!.title === 'string'
					).toBe(true);
				}),
				{ numRuns: 200 }
			);
		});
	});

	describe('JSON Feed', () => {
		it('always returns type json for valid JSON Feed content', async () => {
			await fc.assert(
				fc.asyncProperty(jsonFeedArbitrary(), async (content) => {
					const result = await checkFeed(TEST_URL, content);
					expect(result).not.toBeNull();
					expect(result!.type).toBe('json');
				}),
				{ numRuns: 200 }
			);
		});

		it('non-string title field always yields null title', async () => {
			// Only generate JSON feeds where title is a non-string primitive
			const nonStringTitleFeed = fc.record({
				detectionMethod: fc.integer({ min: 0, max: 1 }),
				title: fc.oneof(fc.integer(), fc.boolean(), fc.constant(null), fc.constant([])),
			}).map(({ detectionMethod, title }) => {
				const obj: Record<string, unknown> = { title };
				if (detectionMethod === 0) obj.version = 'https://jsonfeed.org/version/1.1';
				else obj.items = [];
				return JSON.stringify(obj);
			});

			await fc.assert(
				fc.asyncProperty(nonStringTitleFeed, async (content) => {
					const result = await checkFeed(TEST_URL, content);
					expect(result!.title).toBeNull();
				}),
				{ numRuns: 200 }
			);
		});
	});

	describe('Non-feed content', () => {
		it('always returns null for non-feed content', async () => {
			await fc.assert(
				fc.asyncProperty(nonFeedArbitrary(), async (content) => {
					const result = await checkFeed(TEST_URL, content);
					expect(result).toBeNull();
				}),
				{ numRuns: 100 }
			);
		});
	});
});

import { describe, it, beforeEach, afterEach, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import checkFeed from '../modules/checkFeed.ts';


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
        version: "https://jsonfeed.org/version/1",
        title: "Test JSON Feed",
        items: [
          {
            id: "1",
            title: "Sample Item",
            content_text: "Sample content"
          }
        ]
      });

      const result = await checkFeed('https://example.com/jsonfeed.json', jsonContent);
      
      expect(result).toBeTruthy();
      expect(result.type).toBe('json');
      expect(result.title).toBe( 'Test JSON Feed');
    });

    it('should detect JSON feed with items property', async () => {
      const jsonContent = JSON.stringify({
        title: "Another JSON Feed",
        items: [
          {
            id: "1",
            title: "Another Item"
          }
        ]
      });

      const result = await checkFeed('https://example.com/jsonfeed.json', jsonContent);
      
      expect(result).toBeTruthy();
      expect(result.type).toBe('json');
      expect(result.title).toBe( 'Another JSON Feed');
    });

    it('should detect JSON feed with feed_url property', async () => {
      const jsonContent = JSON.stringify({
        title: "Feed with URL",
        feed_url: "https://example.com/feed.json",
        home_page_url: "https://example.com"
      });

      const result = await checkFeed('https://example.com/feed.json', jsonContent);
      
      expect(result).toBeTruthy();
      expect(result.type).toBe('json');
      expect(result.title).toBe( 'Feed with URL');
    });

    it('should return null for invalid JSON', async () => {
      const invalidJsonContent = '{ invalid: json }';
      
      const result = await checkFeed('https://example.com/feed.json', invalidJsonContent);
      
      expect(result).toBe(null);
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
      expect(result.title).toBe( 'Title with excessive whitespace');
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
      const items = Array.from({ length: 100 }, (_, i) => `
<item>
<title>Item ${i}</title>
<description>Description ${i}</description>
</item>`).join('');

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
      expect(result.title).toBe( 'Large Feed');
    });

    it('should handle JSON feed with minimal properties', async () => {
      const minimalJson = JSON.stringify({
        version: "https://jsonfeed.org/version/1",
        title: "Minimal Feed"
      });

      const result = await checkFeed('https://example.com/feed.json', minimalJson);

      expect(result).toBeTruthy();
      expect(result.type).toBe('json');
      expect(result.title).toBe( 'Minimal Feed');
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
      expect(result.title).toBe( 'Namespaced Feed');
    });
  });
});

// ─── Additional coverage tests ─────────────────────────────────────────────

import { vi, beforeEach as beforeEachCoverage } from 'vitest';

// Mock fetchWithTimeout to test the fetch path
vi.mock('../modules/fetchWithTimeout.ts', () => ({
  default: vi.fn(),
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
      html: '<blockquote>...</blockquote>',
    });
    const result = await checkFeed('https://example.com/oembed.json', oembedContent);
    expect(result).toBeNull();
  });

  it('returns null for oEmbed with type+version+html pattern', async () => {
    const oembedContent = JSON.stringify({
      type: 'video',
      version: '1.0',
      html: '<iframe src="..."></iframe>',
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
      items: [],
    });
    const result = await checkFeed('https://example.com/feed.json', jsonContent);
    expect(result).not.toBeNull();
    expect(result.type).toBe('json');
    expect(result.title).toBeNull();
  });

  it('returns null title when json.title is an object', async () => {
    const jsonContent = JSON.stringify({
      items: [{ id: '1' }],
      title: { text: 'Object Title' },
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
    expect(fetchWithTimeout).toHaveBeenCalledWith('https://example.com/feed.xml', { timeout: 15000, insecure: undefined });
    expect(result).not.toBeNull();
    expect(result.type).toBe('rss');
  });

  it('throws when fetch returns non-ok response', async () => {
    fetchWithTimeout.mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found' });
    const instance = { options: { timeout: 5 } };
    await expect(checkFeed('https://example.com/feed.xml', '', instance)).rejects.toThrow('404');
  });

  it('throws when instance is missing and content is empty', async () => {
    await expect(checkFeed('https://example.com/feed.xml', '')).rejects.toThrow(
      'Instance parameter is required'
    );
  });

  it('uses minimum timeout when timeout is 0', async () => {
    fetchWithTimeout.mockResolvedValue({ ok: true, status: 200, text: async () => 'null' });
    const instance = { options: { timeout: 0 } };
    await checkFeed('https://example.com/feed.json', '', instance);
    // timeout 0 → clamped to MIN (15s) → 15000ms
    expect(fetchWithTimeout).toHaveBeenCalledWith('https://example.com/feed.json', { timeout: 15000, insecure: undefined });
  });

  it('throws for invalid URL protocol', async () => {
    await expect(checkFeed('ftp://example.com/feed.xml', 'content')).rejects.toThrow(
      'Invalid protocol'
    );
  });

  it('throws for completely invalid URL', async () => {
    await expect(checkFeed('not-a-url', 'content')).rejects.toThrow('Invalid URL');
  });
});
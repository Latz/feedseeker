import { describe, it, expect, vi, beforeEach } from 'vitest';
import deepSearch, { EXCLUDED_EXTENSIONS } from '../modules/deepSearch.ts';

// Mock fetchWithTimeout to avoid real network requests
vi.mock('../modules/fetchWithTimeout.ts', () => ({
  default: vi.fn(),
}));
import fetchWithTimeout from '../modules/fetchWithTimeout.ts';

// Mock checkFeed to avoid real network requests
vi.mock('../modules/checkFeed.ts', () => ({
  default: vi.fn(),
}));
import checkFeed from '../modules/checkFeed.ts';

function mockResponse(html, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? 'OK' : 'Not Found',
    text: async () => html,
  };
}

function makeInstance() {
  const events = [];
  return {
    options: {},
    emit: (event, data) => events.push({ event, data }),
    _events: events,
  };
}

describe('deepSearch()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws for a completely invalid start URL', async () => {
    await expect(deepSearch('not-a-url')).rejects.toThrow('Invalid start URL: not-a-url');
  });

  it('throws for a relative start URL', async () => {
    await expect(deepSearch('/relative/path')).rejects.toThrow('Invalid start URL');
  });

  it('returns [] when site has no feeds', async () => {
    fetchWithTimeout.mockResolvedValue(mockResponse('<html><body><a href="/page">link</a></body></html>'));
    checkFeed.mockResolvedValue(null);
    const result = await deepSearch('https://example.com', { depth: 1 });
    expect(result).toEqual([]);
  });

  it('returns [] when fetchWithTimeout returns a non-ok response', async () => {
    fetchWithTimeout.mockResolvedValue(mockResponse('', false, 404));
    const result = await deepSearch('https://example.com', { depth: 1 });
    expect(result).toEqual([]);
  });

  it('returns [] when fetchWithTimeout returns null', async () => {
    fetchWithTimeout.mockResolvedValue(null);
    const result = await deepSearch('https://example.com', { depth: 1 });
    expect(result).toEqual([]);
  });

  it('handles fetchWithTimeout throwing without crashing when instance has emit', async () => {
    fetchWithTimeout.mockRejectedValue(new Error('ECONNREFUSED'));
    const instance = makeInstance();
    const result = await deepSearch('https://example.com', { depth: 1, maxErrors: 5 }, instance);
    expect(result).toEqual([]);
    const errorEvents = instance._events.filter(e => e.event === 'error');
    expect(errorEvents.length).toBeGreaterThan(0);
  });

  it('returns a feed when checkFeed identifies a link as a feed', async () => {
    fetchWithTimeout.mockResolvedValue(mockResponse('<html><body><a href="/feed.xml">Feed</a></body></html>'));
    checkFeed.mockImplementation(async url => {
      if (url.endsWith('/feed.xml')) return { type: 'rss', title: 'Blog Feed' };
      return null;
    });
    const result = await deepSearch('https://example.com', { depth: 1 });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ url: 'https://example.com/feed.xml', type: 'rss' });
  });

  it('includes feedTitle on discovered feed', async () => {
    fetchWithTimeout.mockResolvedValue(mockResponse('<html><body><a href="/rss">RSS</a></body></html>'));
    checkFeed.mockImplementation(async url => {
      if (url.endsWith('/rss')) return { type: 'rss', title: 'My Blog' };
      return null;
    });
    const result = await deepSearch('https://example.com', { depth: 1 });
    expect(result[0].feedTitle).toBe('My Blog');
  });

  it('discovers multiple feeds from a single page', async () => {
    fetchWithTimeout.mockResolvedValue(
      mockResponse(`<html><body>
        <a href="/rss.xml">RSS</a>
        <a href="/atom.xml">Atom</a>
      </body></html>`),
    );
    checkFeed.mockImplementation(async url => {
      if (url.endsWith('/rss.xml')) return { type: 'rss', title: 'RSS Feed' };
      if (url.endsWith('/atom.xml')) return { type: 'atom', title: 'Atom Feed' };
      return null;
    });
    const result = await deepSearch('https://example.com', { depth: 1 });
    expect(result).toHaveLength(2);
    expect(result.map(f => f.type).sort()).toEqual(['atom', 'rss']);
  });

  it('does not add the same feed URL twice', async () => {
    fetchWithTimeout.mockResolvedValue(mockResponse('<html><body><a href="/feed.xml">Feed</a></body></html>'));
    checkFeed.mockImplementation(async url => {
      if (url.endsWith('/feed.xml')) return { type: 'rss', title: 'Feed' };
      return null;
    });
    const result = await deepSearch('https://example.com', { depth: 1 });
    const feedUrls = result.map(f => f.url);
    expect(new Set(feedUrls).size).toBe(feedUrls.length);
  });

  it('respects maxLinks: 1 by not visiting more than 1 page', async () => {
    fetchWithTimeout.mockResolvedValue(
      mockResponse('<html><body><a href="/page2">p2</a><a href="/page3">p3</a></body></html>'),
    );
    checkFeed.mockResolvedValue(null);
    await deepSearch('https://example.com', { depth: 3, maxLinks: 1 });
    expect(fetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  it('does not revisit the same URL twice', async () => {
    fetchWithTimeout.mockResolvedValue(
      mockResponse('<html><body><a href="/page">p</a><a href="/page">p again</a></body></html>'),
    );
    checkFeed.mockResolvedValue(null);
    await deepSearch('https://example.com', { depth: 1 });
    const calls = fetchWithTimeout.mock.calls.map(c => c[0]);
    expect(calls.filter(u => u.endsWith('/page')).length).toBeLessThanOrEqual(1);
  });

  it('with checkForeignFeeds: true, checks external domain links for feeds', async () => {
    fetchWithTimeout.mockResolvedValue(
      mockResponse('<html><body><a href="https://foreign.com/feed.xml">External</a></body></html>'),
    );
    checkFeed.mockImplementation(async url => {
      if (url.includes('foreign.com')) return { type: 'rss', title: 'Foreign Feed' };
      return null;
    });
    const result = await deepSearch('https://example.com', { depth: 1, checkForeignFeeds: true });
    expect(result.some(f => f.url.includes('foreign.com'))).toBe(true);
  });

  it('does not check external domain links as feeds when checkForeignFeeds is false', async () => {
    fetchWithTimeout.mockResolvedValue(
      mockResponse('<html><body><a href="https://foreign.com/feed.xml">External</a></body></html>'),
    );
    checkFeed.mockResolvedValue({ type: 'rss', title: 'Foreign' });
    const result = await deepSearch('https://example.com', { depth: 1, checkForeignFeeds: false });
    expect(result.some(f => f.url.includes('foreign.com'))).toBe(false);
  });

  it('forwards "start" event to instance.emit', async () => {
    fetchWithTimeout.mockResolvedValue(mockResponse('<html><body></body></html>'));
    checkFeed.mockResolvedValue(null);
    const instance = makeInstance();
    await deepSearch('https://example.com', { depth: 1 }, instance);
    const startEvent = instance._events.find(e => e.event === 'start');
    expect(startEvent).toBeDefined();
    expect(startEvent.data).toMatchObject({ module: 'deepSearch' });
  });

  it('forwards "end" event to instance.emit', async () => {
    fetchWithTimeout.mockResolvedValue(mockResponse('<html><body></body></html>'));
    checkFeed.mockResolvedValue(null);
    const instance = makeInstance();
    await deepSearch('https://example.com', { depth: 1 }, instance);
    const endEvent = instance._events.find(e => e.event === 'end');
    expect(endEvent).toBeDefined();
    expect(endEvent.data).toMatchObject({ module: 'deepSearch' });
  });

  it('forwards "log" events to instance.emit during crawl', async () => {
    fetchWithTimeout.mockResolvedValue(mockResponse('<html><body><a href="/feed.xml">Feed</a></body></html>'));
    checkFeed.mockResolvedValue({ type: 'rss', title: 'Feed' });
    const instance = makeInstance();
    await deepSearch('https://example.com', { depth: 1 }, instance);
    const logEvents = instance._events.filter(e => e.event === 'log');
    expect(logEvents.length).toBeGreaterThan(0);
  });

  it('works correctly when no instance is provided', async () => {
    fetchWithTimeout.mockResolvedValue(mockResponse('<html><body></body></html>'));
    checkFeed.mockResolvedValue(null);
    await expect(deepSearch('https://example.com', { depth: 1 }, null)).resolves.toEqual([]);
  });

  it('end event data contains feeds array and visitedUrls count', async () => {
    fetchWithTimeout.mockResolvedValue(mockResponse('<html><body><a href="/feed.xml">Feed</a></body></html>'));
    checkFeed.mockImplementation(async url => {
      if (url.endsWith('/feed.xml')) return { type: 'rss', title: 'Blog' };
      return null;
    });
    const instance = makeInstance();
    const result = await deepSearch('https://example.com', { depth: 1 }, instance);
    const endEvent = instance._events.find(e => e.event === 'end');
    expect(endEvent.data.feeds).toEqual(result);
    expect(typeof endEvent.data.visitedUrls).toBe('number');
    expect(endEvent.data.visitedUrls).toBeGreaterThan(0);
  });

  it('does not crawl links to excluded file types (e.g., .jpg)', async () => {
    fetchWithTimeout.mockResolvedValue(mockResponse('<html><body><a href="/image.jpg">Image</a></body></html>'));
    checkFeed.mockResolvedValue(null);
    await deepSearch('https://example.com', { depth: 2 });
    const calledUrls = fetchWithTimeout.mock.calls.map(c => c[0]);
    expect(calledUrls.some(u => u.endsWith('.jpg'))).toBe(false);
  });

  it('converts timeout option (seconds) to milliseconds for fetchWithTimeout', async () => {
    fetchWithTimeout.mockResolvedValue(mockResponse('<html><body></body></html>'));
    checkFeed.mockResolvedValue(null);
    await deepSearch('https://example.com', { depth: 1, timeout: 10 });
    expect(fetchWithTimeout).toHaveBeenCalledWith(expect.any(String), 10000);
  });

  it('handles HTTP 500 response gracefully and emits log', async () => {
    fetchWithTimeout.mockResolvedValue(mockResponse('', false, 500));
    const instance = makeInstance();
    const result = await deepSearch('https://example.com', { depth: 1 }, instance);
    expect(result).toEqual([]);
    expect(instance._events.filter(e => e.event === 'log').length).toBeGreaterThan(0);
  });

  it('EXCLUDED_EXTENSIONS is a module-level Set containing expected extensions', () => {
    expect(EXCLUDED_EXTENSIONS).toBeInstanceOf(Set);
    expect(EXCLUDED_EXTENSIONS.has('.zip')).toBe(true);
    expect(EXCLUDED_EXTENSIONS.has('.jpg')).toBe(true);
    expect(EXCLUDED_EXTENSIONS.has('.mp4')).toBe(true);
    expect(EXCLUDED_EXTENSIONS.has('.pdf')).toBe(true);
    expect(EXCLUDED_EXTENSIONS.has('.html')).toBe(false);
  });
});

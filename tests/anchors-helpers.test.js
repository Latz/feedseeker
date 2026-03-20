import { describe, it, expect } from 'vitest';

// Replicated from modules/anchors.ts (not exported — tested inline like deepSearch.test.js)

function parseUrlSafely(url, base) {
	try {
		return new URL(url, base);
	} catch {
		return null;
	}
}

function isValidHttpUrl(url) {
	const parsed = parseUrlSafely(url);
	if (!parsed) return false;
	return parsed.protocol === 'http:' || parsed.protocol === 'https:';
}

function isRelativePath(url) {
	const parsed = parseUrlSafely(url);
	if (parsed) return false;
	return !url.includes('://');
}

function isAllowedDomain(url, baseUrl) {
	const parsedUrl = parseUrlSafely(url);
	if (!parsedUrl) return true; // relative URL — same domain by definition

	if (parsedUrl.hostname === baseUrl.hostname) return true;

	const allowedDomains = [
		'feedburner.com',
		'feeds.feedburner.com',
		'feedproxy.google.com',
		'feeds2.feedburner.com'
	];
	return (
		allowedDomains.includes(parsedUrl.hostname) ||
		allowedDomains.some((domain) => parsedUrl.hostname.endsWith('.' + domain))
	);
}

function extractUrlsFromText(text) {
	const urlRegex = /https?:\/\/[^\s"'<>)]+/gi;
	const matches = text.match(urlRegex);
	if (!matches) return [];
	const uniqueUrls = new Set();
	for (const url of matches) {
		const cleaned = url.replace(/[.,;:!?]+$/, '');
		uniqueUrls.add(cleaned);
	}
	return Array.from(uniqueUrls);
}

describe('anchors helper functions', () => {
	describe('parseUrlSafely()', () => {
		it('parses a valid absolute URL', () => {
			const result = parseUrlSafely('https://example.com/feed');
			expect(result).not.toBeNull();
			expect(result.hostname).toBe('example.com');
		});

		it('returns null for invalid URL without base', () => {
			expect(parseUrlSafely('not a url')).toBeNull();
		});

		it('resolves a relative path against a base URL', () => {
			const result = parseUrlSafely('/feed.xml', 'https://example.com');
			expect(result).not.toBeNull();
			expect(result.href).toBe('https://example.com/feed.xml');
		});

		it('resolves a relative path with a subdirectory base', () => {
			const result = parseUrlSafely('../rss.xml', 'https://example.com/blog/post');
			expect(result).not.toBeNull();
			expect(result.pathname).toBe('/rss.xml');
		});

		it('returns null for malformed input without base', () => {
			expect(parseUrlSafely(':::bad:::')).toBeNull();
		});
	});

	describe('isValidHttpUrl()', () => {
		it('returns true for https URLs', () => {
			expect(isValidHttpUrl('https://example.com')).toBe(true);
		});

		it('returns true for http URLs', () => {
			expect(isValidHttpUrl('http://example.com')).toBe(true);
		});

		it('returns false for ftp URLs', () => {
			expect(isValidHttpUrl('ftp://example.com')).toBe(false);
		});

		it('returns false for mailto links', () => {
			expect(isValidHttpUrl('mailto:test@example.com')).toBe(false);
		});

		it('returns false for javascript: links', () => {
			expect(isValidHttpUrl('javascript:void(0)')).toBe(false);
		});

		it('returns false for relative paths (no base provided)', () => {
			expect(isValidHttpUrl('/feed.xml')).toBe(false);
			expect(isValidHttpUrl('./rss')).toBe(false);
		});

		it('returns false for empty string', () => {
			expect(isValidHttpUrl('')).toBe(false);
		});
	});

	describe('isRelativePath()', () => {
		it('returns true for path-relative URLs', () => {
			expect(isRelativePath('/feed.xml')).toBe(true);
			expect(isRelativePath('./rss')).toBe(true);
			expect(isRelativePath('../atom.xml')).toBe(true);
			expect(isRelativePath('feed')).toBe(true);
		});

		it('returns false for absolute http URLs', () => {
			expect(isRelativePath('https://example.com/feed')).toBe(false);
			expect(isRelativePath('http://example.com')).toBe(false);
		});

		it('returns false for non-http absolute URLs that parse successfully', () => {
			// ftp:// parses as a valid URL, so it is not a relative path
			expect(isRelativePath('ftp://example.com')).toBe(false);
		});

		it('returns true for a bare filename with no scheme', () => {
			expect(isRelativePath('feed.xml')).toBe(true);
		});
	});

	describe('isAllowedDomain()', () => {
		const base = new URL('https://example.com');

		it('allows same hostname', () => {
			expect(isAllowedDomain('https://example.com/feed', base)).toBe(true);
		});

		it('rejects different hostname', () => {
			expect(isAllowedDomain('https://other.com/feed', base)).toBe(false);
		});

		it('allows feeds.feedburner.com as an exception', () => {
			expect(isAllowedDomain('https://feeds.feedburner.com/example', base)).toBe(true);
		});

		it('allows feedproxy.google.com as an exception', () => {
			expect(isAllowedDomain('https://feedproxy.google.com/~r/example', base)).toBe(true);
		});

		it('rejects unrelated external domain', () => {
			expect(isAllowedDomain('https://malicious.com/feed', base)).toBe(false);
		});

		it('returns true for unparseable URL (treated as relative/same-domain)', () => {
			expect(isAllowedDomain(':::bad:::', base)).toBe(true);
		});

		it('rejects a subdomain of the base when hostnames differ exactly', () => {
			// sub.example.com !== example.com — compares exact hostname
			expect(isAllowedDomain('https://sub.example.com/feed', base)).toBe(false);
		});

		it('allows same domain with different path and query', () => {
			expect(isAllowedDomain('https://example.com/blog/feed?format=rss', base)).toBe(true);
		});
	});

	describe('extractUrlsFromText()', () => {
		it('extracts http and https URLs from plain text', () => {
			const text = 'Visit https://example.com/feed or http://other.com/rss for updates.';
			const urls = extractUrlsFromText(text);
			expect(urls).toContain('https://example.com/feed');
			expect(urls).toContain('http://other.com/rss');
		});

		it('returns empty array when no URLs present', () => {
			expect(extractUrlsFromText('no urls here')).toEqual([]);
		});

		it('deduplicates repeated URLs', () => {
			const text = 'https://example.com/feed https://example.com/feed';
			const urls = extractUrlsFromText(text);
			expect(urls).toHaveLength(1);
			expect(urls[0]).toBe('https://example.com/feed');
		});

		it('strips trailing punctuation from URLs', () => {
			const text = 'See https://example.com/feed.xml, for details!';
			const urls = extractUrlsFromText(text);
			expect(urls).toContain('https://example.com/feed.xml');
			expect(urls.some((u) => u.endsWith(',') || u.endsWith('!'))).toBe(false);
		});

		it('extracts URLs from HTML attribute values', () => {
			const html = 'data-url="https://example.com/rss"';
			const urls = extractUrlsFromText(html);
			expect(urls).toContain('https://example.com/rss');
		});

		it('handles empty string gracefully', () => {
			expect(extractUrlsFromText('')).toEqual([]);
		});

		it('extracts URLs with query parameters', () => {
			const text = 'Feed at https://example.com/feed?format=rss&lang=en here.';
			const urls = extractUrlsFromText(text);
			expect(urls.some((u) => u.includes('format=rss'))).toBe(true);
		});

		it('does not extract non-http URLs', () => {
			const text = 'ftp://example.com/file mailto:test@example.com';
			const urls = extractUrlsFromText(text);
			expect(urls).toHaveLength(0);
		});
	});
});

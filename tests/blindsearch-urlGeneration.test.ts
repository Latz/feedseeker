import { describe, it, expect, vi, afterEach } from 'vitest';
import { generateEndpointUrls } from '../modules/blindsearch/urlGeneration.ts';
import { MAX_URL_LENGTH } from '../modules/blindsearch/validation.ts';

describe('blindsearch/urlGeneration', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('generateEndpointUrls', () => {
		it('throws for a malformed URL', () => {
			expect(() => generateEndpointUrls('not-a-url', false, ['feed'])).toThrow(
				'Invalid URL provided to blindSearch'
			);
		});

		it('throws for a URL exceeding the maximum length', () => {
			const longUrl = `https://example.com/${'a'.repeat(MAX_URL_LENGTH)}`;
			expect(() => generateEndpointUrls(longUrl, false, ['feed'])).toThrow('URL too long');
		});

		it('throws for a non-http(s) protocol', () => {
			expect(() => generateEndpointUrls('ftp://example.com', false, ['feed'])).toThrow(
				'Invalid protocol "ftp:"'
			);
		});

		it('skips generating a URL when the endpoint would exceed the max URL length', () => {
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const longEndpoint = 'a'.repeat(MAX_URL_LENGTH);
			const urls = generateEndpointUrls('https://example.com', false, [longEndpoint]);
			expect(urls).toEqual([]);
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping URL (too long)'));
		});

		it('stops generating URLs once the generation limit is reached', () => {
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			const manyEndpoints = Array.from({ length: 10001 }, (_, i) => `feed${i}`);
			const urls = generateEndpointUrls('https://example.com', false, manyEndpoints);
			expect(urls.length).toBe(10000);
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('URL generation limit reached'));
		});
	});
});

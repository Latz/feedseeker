import { describe, it, expect } from 'vitest';
import { isOEmbedEndpoint, isOEmbedResponse } from '../modules/checkFeed/oembed.ts';

describe('isOEmbedEndpoint', () => {
	it('matches the WordPress oEmbed path', () => {
		expect(isOEmbedEndpoint('https://example.com/wp-json/oembed/1.0/embed?url=x')).toBe(true);
	});

	it('matches a generic /oembed path that lacks the WordPress prefix', () => {
		expect(isOEmbedEndpoint('https://example.com/oembed?url=x')).toBe(true);
	});

	it('does not match regular feed URLs', () => {
		expect(isOEmbedEndpoint('https://example.com/feed.json')).toBe(false);
	});
});

describe('isOEmbedResponse', () => {
	it('accepts a known type with a known version, even without html', () => {
		expect(isOEmbedResponse({ type: 'photo', version: '1.0' })).toBe(true);
	});

	it('rejects an unknown type with a known version and no html', () => {
		expect(isOEmbedResponse({ type: 'feed', version: '1.0' })).toBe(false);
	});

	it('rejects a known type with an unknown version and no html', () => {
		expect(isOEmbedResponse({ type: 'rich', version: '3.0' })).toBe(false);
	});

	it('rejects a known version without any type', () => {
		expect(isOEmbedResponse({ version: '1.0' })).toBe(false);
	});

	it('accepts any type + version when html is present', () => {
		expect(isOEmbedResponse({ type: 'custom', version: '9', html: '<p>x</p>' })).toBe(true);
	});

	it('rejects type + html without a version', () => {
		expect(isOEmbedResponse({ type: 'custom', html: '<p>x</p>' })).toBe(false);
	});

	it('rejects type + version (non-standard) without html', () => {
		expect(isOEmbedResponse({ type: 'custom', version: '9' })).toBe(false);
	});

	it('rejects version + html without a type', () => {
		expect(isOEmbedResponse({ version: '9', html: '<p>x</p>' })).toBe(false);
	});

	it('rejects a plain JSON feed object', () => {
		expect(isOEmbedResponse({ version: 'https://jsonfeed.org/version/1.1', items: [] })).toBe(false);
	});
});

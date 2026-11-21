import { describe, it, expect, vi } from 'vitest';
import { checkRss } from '../modules/checkFeed/checkRss.ts';

const rss = (body: string): string => `<?xml version="1.0"?><rss version="2.0">${body}</rss>`;
const NO_ITEMS_REASON = 'content is a valid RSS feed but has no items yet';

describe('checkRss — detection', () => {
	it('accepts channel + description + item', () => {
		const result = checkRss(rss('<channel><title>T</title><description>d</description><item></item></channel>'));
		expect(result).toEqual({ type: 'rss', title: 'T' });
	});

	it('rejects feed structure without an <rss version> or <rdf:RDF> root', () => {
		const html = '<html><channel><title>T</title><description>d</description><item></item></channel></html>';
		expect(checkRss(html)).toBeNull();
	});

	it('rejects a channel with items but no description', () => {
		expect(checkRss(rss('<channel><title>T</title><item></item></channel>'))).toBeNull();
	});

	it('rejects description + items without a channel', () => {
		expect(checkRss(rss('<description>d</description><item></item>'))).toBeNull();
	});
});

describe('checkRss — title extraction', () => {
	it('prefers the channel title over a <title> that appears before the channel', () => {
		const content = rss(
			'<title>Outer</title><channel><title>Channel</title><description>d</description><item><title>Item</title></item></channel>'
		);
		expect(checkRss(content)?.title).toBe('Channel');
	});

	it('falls back to the first <title> when </channel> is missing', () => {
		const content = rss('<channel><title>Unclosed</title><description>d</description><item></item>');
		expect(checkRss(content)).toEqual({ type: 'rss', title: 'Unclosed' });
	});

	it('returns a null title when the channel has no title', () => {
		const content = rss('<channel><description>d</description><item></item></channel>');
		expect(checkRss(content)).toEqual({ type: 'rss', title: null });
	});
});

describe('checkRss — onReject for empty channels', () => {
	it('reports an empty but well-formed channel', () => {
		const onReject = vi.fn();
		expect(checkRss(rss('<channel><title>T</title><description>d</description></channel>'), onReject)).toBeNull();
		expect(onReject).toHaveBeenCalledExactlyOnceWith(NO_ITEMS_REASON);
	});

	it('does not throw when no callback is given', () => {
		expect(checkRss(rss('<channel><title>T</title><description>d</description></channel>'))).toBeNull();
	});

	it('stays silent when </channel> is missing', () => {
		const onReject = vi.fn();
		checkRss(rss('<channel><title>T</title><description>d</description>'), onReject);
		expect(onReject).not.toHaveBeenCalled();
	});

	it('stays silent when the description is missing', () => {
		const onReject = vi.fn();
		checkRss(rss('<channel><title>T</title></channel>'), onReject);
		expect(onReject).not.toHaveBeenCalled();
	});

	it('stays silent when the opening <channel> is missing', () => {
		const onReject = vi.fn();
		checkRss(rss('<description>d</description></channel>'), onReject);
		expect(onReject).not.toHaveBeenCalled();
	});

	it('stays silent for a valid feed with items', () => {
		const onReject = vi.fn();
		checkRss(rss('<channel><description>d</description><item></item></channel>'), onReject);
		expect(onReject).not.toHaveBeenCalled();
	});
});

import { describe, it, expect, vi } from 'vitest';
import { checkJson } from '../modules/checkFeed/checkJson.ts';

const NO_ITEMS = 'content is a valid JSON feed but has no items yet';
const json = (value: unknown) => JSON.stringify(value);

describe('checkJson — detection', () => {
	it.each([
		['a jsonfeed version', { version: 'https://jsonfeed.org/version/1.1', title: 'V' }],
		['non-empty items', { items: [{ id: '1' }], title: 'V' }],
		['a feed_url', { feed_url: 'https://a.example/feed.json', title: 'V' }],
		['items despite a non-string version', { version: 1, items: [{ id: '1' }], title: 'V' }]
	])('accepts a feed identified by %s', (_name, value) => {
		expect(checkJson(json(value))).toEqual({ type: 'json', title: 'V' });
	});

	it('rejects a version that does not mention jsonfeed', () => {
		expect(checkJson(json({ version: '1.0', title: 'x' }))).toBeNull();
	});

	it('rejects an oEmbed response even if it looks feed-like', () => {
		expect(checkJson(json({ type: 'rich', version: '1.0', html: '<p/>', items: [{}] }))).toBeNull();
	});

	it.each([['not json at all'], ['null'], ['[1, 2]']])(
		'returns null (not undefined) for %s',
		(content) => {
			expect(checkJson(content)).toBeNull();
		}
	);
});

describe('checkJson — "no items" reason', () => {
	it('is reported for an empty items array', () => {
		const onReject = vi.fn();
		expect(checkJson(json({ version: 'x', items: [] }), onReject)).toBeNull();
		expect(onReject).toHaveBeenCalledWith(NO_ITEMS);
	});

	it.each([
		['no items property', { title: 'x' }],
		['an empty string as items', { items: '' }]
	])('is not reported for %s', (_name, value) => {
		const onReject = vi.fn();
		expect(checkJson(json(value), onReject)).toBeNull();
		expect(onReject).not.toHaveBeenCalled();
	});

	it('works without a callback', () => {
		expect(checkJson(json({ items: [] }))).toBeNull();
	});
});

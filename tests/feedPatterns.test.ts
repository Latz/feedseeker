import { describe, it, expect, vi } from 'vitest';
import { checkRss } from '../modules/checkFeed/checkRss.ts';
import { checkAtom } from '../modules/checkFeed/checkAtom.ts';

const channel = '<channel><title>T</title><description>d</description><item></item></channel>';

describe('RSS root element', () => {
	it.each([
		['plain', '<rss version="2.0">'],
		['version without a dot', '<rss version="2">'],
		['single quotes', "<rss version='0.91'>"],
		['spaces around =', '<rss version = "2.0">'],
		['other attributes first', '<rss xmlns:atom="http://www.w3.org/2005/Atom" version="2.0">']
	])('accepts %s', (_name, root) => {
		expect(checkRss(`<?xml version="1.0"?>${root}${channel}</rss>`)).toEqual({
			type: 'rss',
			title: 'T'
		});
	});
});

describe('RSS channel parts with attributes', () => {
	it('accepts a description that carries attributes', () => {
		const feed =
			'<rss version="2.0"><channel><title>T</title><description xml:lang="de">d</description><item></item></channel></rss>';
		expect(checkRss(feed)).toEqual({ type: 'rss', title: 'T' });
	});

	it('reads the title from inside a channel that carries attributes', () => {
		const feed =
			'<rss version="2.0"><title>Outer</title><channel rdf:about="https://a.example/"><title>Channel</title>' +
			'<description>d</description><item></item></channel></rss>';
		expect(checkRss(feed)?.title).toBe('Channel');
	});
});

describe('Atom namespace and entries', () => {
	const atom = (root: string, entry = '<entry><title>e</title></entry>') =>
		`<?xml version="1.0"?>${root}<title>Atom T</title>${entry}</feed>`;

	it.each([
		['default namespace', '<feed xmlns="http://www.w3.org/2005/Atom">'],
		[
			'prefixed namespace after other attributes',
			'<feed xml:lang="en" xmlns:atom="http://www.w3.org/2005/Atom">'
		],
		['atom: attribute after other attributes', '<feed xml:lang="en" atom:version="1.0">']
	])('recognizes %s', (_name, root) => {
		expect(checkAtom(atom(root))).toEqual({ type: 'atom', title: 'Atom T' });
	});

	it('recognizes entries that carry attributes', () => {
		const feed = atom(
			'<feed xmlns="http://www.w3.org/2005/Atom">',
			'<entry xml:lang="de"><title>e</title></entry>'
		);
		expect(checkAtom(feed)).toEqual({ type: 'atom', title: 'Atom T' });
	});

	it('rejects a <feed> element without an Atom namespace', () => {
		expect(checkAtom(atom('<feed>'))).toBeNull();
	});

	describe('"no entries" rejection reason', () => {
		const reason = 'content is a valid Atom feed but has no entries yet';
		const ns = '<feed xmlns="http://www.w3.org/2005/Atom">';

		it('is reported for a titled feed without entries', () => {
			const onReject = vi.fn();
			expect(checkAtom(`${ns}<title>T</title></feed>`, onReject)).toBeNull();
			expect(onReject).toHaveBeenCalledWith(reason);
		});

		it.each([
			['entries but no title', `${ns}<entry></entry></feed>`],
			['neither title nor entries', `${ns}</feed>`]
		])('is not reported for %s', (_name, feed) => {
			const onReject = vi.fn();
			expect(checkAtom(feed, onReject)).toBeNull();
			expect(onReject).not.toHaveBeenCalledWith(reason);
		});

		it('works without a callback', () => {
			expect(checkAtom(`${ns}<title>T</title></feed>`)).toBeNull();
		});
	});
});

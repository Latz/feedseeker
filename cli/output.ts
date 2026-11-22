import { styleText } from 'node:util';
import { type Feed } from '../modules/metaLinks.ts';

// Characters XML 1.0 forbids even when escaped; one in a feed title would make the OPML unreadable
const ILLEGAL_XML_CHARS = new RegExp(
	// oxlint-disable-next-line no-control-regex -- intentionally matches control characters
	'[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\uFFFE\\uFFFF]',
	'g'
);

export function escapeXml(s: string): string {
	return s
		.replace(ILLEGAL_XML_CHARS, '')
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

export function formatOpml(feeds: Feed[], siteUrl: string): string {
	const title = escapeXml(`Feeds from ${siteUrl}`);
	const outlines = feeds
		.map((f) => {
			const label = escapeXml(f.feedTitle ?? f.title ?? f.url);
			const type = f.type === 'atom' ? 'atom' : f.type === 'json' ? 'json' : 'rss';
			return `  <outline type="${type}" text="${label}" title="${label}" xmlUrl="${escapeXml(f.url)}"/>`;
		})
		.join('\n');
	return [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<opml version="2.0">',
		'<head>',
		`  <title>${title}</title>`,
		'</head>',
		'<body>',
		outlines,
		'</body>',
		'</opml>'
	].join('\n');
}

/**
 * Prints feeds in a human-readable format, showing title (if available) above the URL.
 */
export function printFeeds(feeds: Feed[]): void {
	feeds.forEach((feed, i) => {
		const title = feed.feedTitle ?? feed.title;
		if (title) {
			console.log(styleText('cyan', title));
		}
		console.log(feed.url);
		if (i < feeds.length - 1) console.log('');
	});
}

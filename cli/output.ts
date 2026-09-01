import { styleText } from 'node:util';
import { type Feed } from '../modules/metaLinks.ts';

export function escapeXml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatOpml(feeds: Feed[], siteUrl: string): string {
	const title = escapeXml(`Feeds from ${siteUrl}`);
	const outlines = feeds
		.map((f) => {
			const label = escapeXml(f.feedTitle ?? f.title ?? f.url);
			const type = f.type === 'atom' ? 'atom' : f.type === 'json' ? 'json' : 'rss';
			return `  <outline type="${type}" text="${label}" title="${label}" xmlUrl="${f.url}"/>`;
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
		'</opml>',
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

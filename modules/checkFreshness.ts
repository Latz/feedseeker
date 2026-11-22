import fetchWithTimeout from './fetchWithTimeout.ts';
import type { Feed } from './metaLinks.ts';
import { type FeedSeekerInstance, takeCachedFeedContent } from './checkFeed/index.ts';
import { elementText } from './checkFeed/textUtils.ts';

// Tag starts for elementText (linear, unlike /<item>([\s\S]*?)<\/item>/ on hostile input)
const FRESHNESS_PATTERNS = {
	// <item> or <item …>, but not RSS 1.0's <items> table of contents
	RSS_ITEM: /<item[\s>]/i,
	RSS_PUBDATE: /<pubDate>/i,
	// RSS 1.0 (RDF) items carry Dublin Core dates instead of <pubDate>
	RSS_DC_DATE: /<dc:date>/i,
	ATOM_ENTRY: /<entry/i,
	ATOM_UPDATED: /<updated>/i,
	ATOM_PUBLISHED: /<published>/i
};

function parseDate(str: string): Date | null {
	const trimmed = str.trim();
	if (!trimmed) return null;
	const d = new Date(trimmed);
	return Number.isNaN(d.getTime()) ? null : d;
}

function extractRssDate(content: string): Date | null {
	const item = elementText(content, FRESHNESS_PATTERNS.RSS_ITEM, 'item');
	if (item === null) return null;
	const date =
		elementText(item, FRESHNESS_PATTERNS.RSS_PUBDATE, 'pubDate') ??
		elementText(item, FRESHNESS_PATTERNS.RSS_DC_DATE, 'dc:date');
	return date === null ? null : parseDate(date);
}

function extractAtomDate(content: string): Date | null {
	const entry = elementText(content, FRESHNESS_PATTERNS.ATOM_ENTRY, 'entry');
	if (entry === null) return null;
	const updated = elementText(entry, FRESHNESS_PATTERNS.ATOM_UPDATED, 'updated');
	if (updated !== null) return parseDate(updated);
	const published = elementText(entry, FRESHNESS_PATTERNS.ATOM_PUBLISHED, 'published');
	return published === null ? null : parseDate(published);
}

function extractJsonDate(content: string): Date | null {
	try {
		const json = JSON.parse(content);
		if (!Array.isArray(json.items) || json.items.length === 0) return null;
		const item = json.items[0];
		const dateStr = item.date_published ?? item.date_modified ?? null;
		return dateStr && typeof dateStr === 'string' ? parseDate(dateStr) : null;
	} catch {
		return null;
	}
}

export async function checkFeedFreshness(
	feed: Feed,
	days: number,
	instance: FeedSeekerInstance
): Promise<boolean> {
	// Discovery already downloaded this feed in most cases.
	let content = takeCachedFeedContent(feed.url);
	if (content === undefined) {
		try {
			const timeout = (instance.options.timeout ?? 15) * 1000;
			const response = await fetchWithTimeout(feed.url, {
				timeout,
				insecure: instance.options.insecure
			});
			if (!response.ok) return true;
			content = await response.text();
		} catch {
			return true;
		}
	}

	let date: Date | null = null;
	if (feed.type === 'rss') {
		date = extractRssDate(content);
	} else if (feed.type === 'atom') {
		date = extractAtomDate(content);
	} else if (feed.type === 'json') {
		date = extractJsonDate(content);
	}

	if (!date) return true;
	return date.getTime() >= Date.now() - days * 86_400_000;
}

import fetchWithTimeout from './fetchWithTimeout.ts';
import type { Feed } from './metaLinks.ts';
import type { FeedSeekerInstance } from './checkFeed.ts';

const FRESHNESS_PATTERNS = {
	RSS_FIRST_ITEM: /<item[^>]*>([\s\S]*?)<\/item>/i,
	RSS_PUBDATE: /<pubDate>([\s\S]*?)<\/pubDate>/i,
	ATOM_FIRST_ENTRY: /<entry[^>]*>([\s\S]*?)<\/entry>/i,
	ATOM_UPDATED: /<updated>([\s\S]*?)<\/updated>/i,
	ATOM_PUBLISHED: /<published>([\s\S]*?)<\/published>/i
};

function parseDate(str: string): Date | null {
	const trimmed = str.trim();
	if (!trimmed) return null;
	const d = new Date(trimmed);
	return isNaN(d.getTime()) ? null : d;
}

function extractRssDate(content: string): Date | null {
	const itemMatch = FRESHNESS_PATTERNS.RSS_FIRST_ITEM.exec(content);
	if (!itemMatch) return null;
	const pubDateMatch = FRESHNESS_PATTERNS.RSS_PUBDATE.exec(itemMatch[1]);
	return pubDateMatch ? parseDate(pubDateMatch[1]) : null;
}

function extractAtomDate(content: string): Date | null {
	const entryMatch = FRESHNESS_PATTERNS.ATOM_FIRST_ENTRY.exec(content);
	if (!entryMatch) return null;
	const entryContent = entryMatch[1];
	const updatedMatch = FRESHNESS_PATTERNS.ATOM_UPDATED.exec(entryContent);
	if (updatedMatch) return parseDate(updatedMatch[1]);
	const publishedMatch = FRESHNESS_PATTERNS.ATOM_PUBLISHED.exec(entryContent);
	return publishedMatch ? parseDate(publishedMatch[1]) : null;
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
	let content: string;
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

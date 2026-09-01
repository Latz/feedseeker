import { FEED_PATTERNS } from './feedPatterns.ts';
import { cleanTitle, removeCDATA } from './textUtils.ts';
import { type FeedResult } from './types.ts';

/**
 * Extracts title from RSS content
 * @param content - The RSS content to extract the title from
 * @returns The extracted and cleaned title, or null if not found
 */
function extractRssTitle(content: string): string | null {
	// Extract title from RSS feed (channel title, not item title)
	const channelMatch = FEED_PATTERNS.RSS.CHANNEL_CONTENT.exec(content);
	if (channelMatch) {
		const channelContent = channelMatch[1];
		const titleMatch = FEED_PATTERNS.RSS.TITLE.exec(channelContent);
		const title = titleMatch ? cleanTitle(removeCDATA(titleMatch[1])) : null;
		return title;
	}
	// Fallback to original method if channel parsing fails
	const match = FEED_PATTERNS.RSS.TITLE.exec(content);
	const title = match ? cleanTitle(removeCDATA(match[1])) : null;
	return title;
}

/**
 * Checks if content is an RSS feed
 * @param content - The content to check for RSS feed elements
 * @returns Object with type 'rss' and title if RSS feed, null otherwise
 */
export function checkRss(content: string, onReject?: (reason: string) => void): FeedResult | null {
	// Step 1: Check for an RSS root element: either <rss version="..."> (RSS 0.91/2.0/etc.)
	// or <rdf:RDF> (RSS 1.0, which has no <rss> tag at all).
	if (FEED_PATTERNS.RSS.VERSION.test(content) || FEED_PATTERNS.RSS.RDF_ROOT.test(content)) {
		// Step 2: Validate required RSS structure elements
		const hasChannel = FEED_PATTERNS.RSS.CHANNEL.test(content); // Container for feed metadata
		const hasItem = FEED_PATTERNS.RSS.ITEM.test(content); // Individual feed entries
		const hasDescription = FEED_PATTERNS.RSS.DESCRIPTION.test(content); // Content description

		// Step 3: Validate RSS structure - must have channel + description + items
		if (hasChannel && hasDescription && hasItem) {
			const title = extractRssTitle(content);
			return { type: 'rss', title };
		}

		// A well-formed channel (proper </channel> closure, has a description) that
		// simply has no <item> elements yet is not "not a feed" — surface that
		// distinction instead of the generic rejection message below.
		if (hasChannel && hasDescription && !hasItem && FEED_PATTERNS.RSS.CHANNEL_END.test(content)) {
			onReject?.('content is a valid RSS feed but has no items yet');
		}
	}
	return null;
}

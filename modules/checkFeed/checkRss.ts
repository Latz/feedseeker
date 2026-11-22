import { FEED_PATTERNS } from './feedPatterns.ts';
import { cleanTitle, elementText, firstOpenTag, openTags, removeCDATA } from './textUtils.ts';
import { type FeedResult } from './types.ts';

/**
 * Extracts title from RSS content
 * @param content - The RSS content to extract the title from
 * @returns The extracted and cleaned title, or null if not found
 */
function extractRssTitle(content: string): string | null {
	// Extract title from RSS feed (channel title, not item title)
	const channelContent = elementText(content, FEED_PATTERNS.RSS.CHANNEL, 'channel');
	// Fallback to the whole document if channel parsing fails
	const text = elementText(channelContent ?? content, FEED_PATTERNS.RSS.TITLE, 'title');
	return text === null ? null : cleanTitle(removeCDATA(text));
}

/**
 * Checks if content is an RSS feed
 * @param content - The content to check for RSS feed elements
 * @returns Object with type 'rss' and title if RSS feed, null otherwise
 */
export function checkRss(content: string, onReject?: (reason: string) => void): FeedResult | null {
	// Step 1: Check for an RSS root element: either <rss version="..."> (RSS 0.91/2.0/etc.)
	// or <rdf:RDF> (RSS 1.0, which has no <rss> tag at all).
	const hasVersionedRoot = openTags(content, FEED_PATTERNS.RSS.ROOT).some(({ tag }) =>
		FEED_PATTERNS.RSS.VERSION.test(tag)
	);
	if (hasVersionedRoot || firstOpenTag(content, FEED_PATTERNS.RSS.RDF_ROOT) !== null) {
		// Step 2: Validate required RSS structure elements
		const hasChannel = firstOpenTag(content, FEED_PATTERNS.RSS.CHANNEL) !== null; // Container for feed metadata
		const hasItem = firstOpenTag(content, FEED_PATTERNS.RSS.ITEM) !== null; // Individual feed entries
		const hasDescription = firstOpenTag(content, FEED_PATTERNS.RSS.DESCRIPTION) !== null; // Content description

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

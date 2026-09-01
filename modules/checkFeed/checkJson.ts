import { isOEmbedResponse } from './oembed.ts';
import { cleanTitle } from './textUtils.ts';
import { type FeedResult } from './types.ts';

/**
 * Checks if content is a JSON feed
 * @param content - The content to check for JSON feed properties
 * @returns Object with type 'json' and title if JSON feed, null otherwise
 */
export function checkJson(content: string, onReject?: (reason: string) => void): FeedResult | null {
	try {
		const json = JSON.parse(content);

		// Check if this looks like an oEmbed response - these are NOT feeds
		if (isOEmbedResponse(json)) {
			return null;
		}

		const isJsonFeedVersion =
			json.version && typeof json.version === 'string' && json.version.includes('jsonfeed');
		const hasNonEmptyItems = Array.isArray(json.items) && json.items.length > 0;

		// Check if it's a JSON feed by looking for common properties
		// JSON feeds should have the version property with 'jsonfeed' in the value,
		// a non-empty 'items' array, or a feed_url pointing back at itself
		if (isJsonFeedVersion || hasNonEmptyItems || json.feed_url) {
			// Extract title from JSON feed
			// Security: Validate that title is a string before processing
			const rawTitle = json.title || json.name || null;
			const title = typeof rawTitle === 'string' ? cleanTitle(rawTitle) : null;
			return { type: 'json', title };
		}

		// A well-formed JSON feed (has an items array) that simply has no items
		// yet is not "not a feed" — surface that distinction instead of the
		// generic rejection message below.
		if (Array.isArray(json.items) && json.items.length === 0) {
			onReject?.('content is a valid JSON feed but has no items yet');
		}
		return null;
	} catch {
		// Not valid JSON or parsing failed
		return null;
	}
}

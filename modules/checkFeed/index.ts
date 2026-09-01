/**
 * @fileoverview checkFeed - Feed validation and type detection utility
 *
 * This module provides comprehensive feed validation for RSS, Atom, and JSON feeds.
 * It fetches feed URLs, analyzes their content structure, and extracts metadata
 * like titles and feed types. Uses pre-compiled regex patterns for optimal performance.
 *
 * @module checkFeed
 * @version 1.0.0
 * @author latz
 * @since 1.0.0
 */

import fetchWithTimeout from '../fetchWithTimeout.ts';
import { isOEmbedEndpoint } from './oembed.ts';
import { validateUrl, validateContentSize, validateTimeout } from './validation.ts';
import { checkRss } from './checkRss.ts';
import { checkAtom } from './checkAtom.ts';
import { checkJson } from './checkJson.ts';
import { type FeedResult, type FeedSeekerInstance } from './types.ts';

export { type FeedResult, type FeedSeekerInstance } from './types.ts';

/**
 * Validates if a URL is a feed (RSS, Atom, or JSON) by analyzing its content structure
 * Fetches content if not provided and uses pre-compiled regex patterns for efficient parsing
 * @param {string} url - The URL to check (must be a valid HTTP/HTTPS URL)
 * @param {string} [content=''] - The content to analyze (optional, will fetch if not provided)
 * @param {FeedSeekerInstance} [instance] - The FeedSeeker instance with options
 * @returns {Promise<FeedResult|null>} Feed object with type and title properties, or null if not a valid feed
 * @throws {Error} When network errors occur during content fetching
 * @example
 * // Check a URL by fetching its content
 * const result = await checkFeed('https://example.com/feed.xml');
 * console.log(result); // { type: 'rss', title: 'Example Blog' }
 *
 * // Check pre-fetched content
 * const content = '<rss version="2.0">...</rss>';
 * const result = await checkFeed('https://example.com/feed.xml', content);
 * console.log(result); // { type: 'rss', title: 'Example Blog' }
 *
 * // Returns null for non-feed content
 * const result = await checkFeed('https://example.com/not-a-feed');
 * console.log(result); // null
 */
export default async function checkFeed(
	url: string,
	content: string = '',
	instance?: FeedSeekerInstance,
	onReject?: (reason: string) => void
): Promise<FeedResult | null> {
	// Security: Validate URL format and protocol
	validateUrl(url);

	// Check if URL pattern indicates this is likely an oEmbed endpoint
	if (isOEmbedEndpoint(url)) {
		// WordPress oEmbed endpoints are not feeds
		onReject?.('URL matches a WordPress oEmbed endpoint pattern, not a feed');
		return null;
	}

	// Only fetch content if it's not provided by the caller
	if (!content) {
		if (!instance) {
			throw new Error('Instance parameter is required when content is not provided');
		}

		// Security: Validate and normalize timeout value
		const timeoutSecs = validateTimeout(instance.options.timeout);
		const timeout = timeoutSecs * 1000;

		const response = await fetchWithTimeout(url, { timeout, insecure: instance.options.insecure });
		if (!response.ok) {
			throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
		}
		content = await response.text();
	}

	// Security: Validate content size to prevent memory exhaustion
	validateContentSize(content);

	// Check for RSS, Atom, or JSON feeds
	let specificRejectReason: string | undefined;
	const captureReject = (reason: string): void => {
		specificRejectReason = reason;
	};
	const result =
		checkRss(content, captureReject) ||
		checkAtom(content, captureReject) ||
		checkJson(content, captureReject) ||
		null;
	if (!result) {
		onReject?.(specificRejectReason ?? 'content is not a recognized RSS, Atom, or JSON feed format');
	}
	return result;
}

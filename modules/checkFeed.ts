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

import fetchWithTimeout from './fetchWithTimeout.ts';

/**
 * Security and validation constants
 */
const VALIDATION_LIMITS = {
	MAX_CONTENT_SIZE: 10 * 1024 * 1024, // 10MB maximum content size
	DEFAULT_TIMEOUT: 5, // Default timeout in seconds
	MAX_TIMEOUT: 60, // Maximum timeout in seconds (60 seconds)
	MIN_TIMEOUT: 1, // Minimum timeout in seconds
} as const;

/**
 * oEmbed detection constants
 */
const OEMBED = {
	TYPES: ['rich', 'video', 'photo', 'link'] as const,
	VERSIONS: ['1.0', '2.0'] as const,
	URL_PATTERNS: ['/wp-json/oembed/', '/oembed'] as const,
} as const;

/**
 * Type definitions for feed check results
 */
export interface FeedResult {
	type: 'rss' | 'atom' | 'json';
	title: string | null;
}

export interface FeedSeekerOptions {
	timeout?: number;
	maxFeeds?: number;
	showErrors?: boolean;
	all?: boolean;
	keepQueryParams?: boolean;
	followMetaRefresh?: boolean;
	deepsearchOnly?: boolean;
	metasearch?: boolean;
	blindsearch?: boolean;
	anchorsonly?: boolean;
	deepsearch?: boolean;
	depth?: number;
	maxLinks?: number;
	checkForeignFeeds?: boolean;
	maxErrors?: number;
	requestDelay?: number; // Delay in milliseconds between requests for rate limiting (default: 0)
	searchMode?: 'fast' | 'standard' | 'exhaustive'; // Blind search thoroughness: fast (~25 endpoints), standard (~150 endpoints), exhaustive (~350+ endpoints)
	concurrency?: number; // Number of concurrent requests for blind search (default: 3)
	insecure?: boolean;
}

export interface FeedSeekerInstance {
	options: FeedSeekerOptions;
	emit?: (event: string, data: unknown) => void;
}

// Pre-compiled regex patterns for all feed detection and processing
// Performance optimization: Compiling regex patterns once at module load time instead of
// creating new RegExp objects on every function call (eliminates 9+ regex compilations per checkFeed call)
const FEED_PATTERNS = {
	// CDATA processing - matches XML CDATA sections: <![CDATA[content]]>
	// Used to extract clean text content from feeds that wrap content in CDATA
	CDATA: /<!\[CDATA\[(.*?)\]\]>/g,

	// RSS feed detection patterns
	RSS: {
		// Matches RSS root element with version attribute: <rss version="2.0">
		// [^>]* matches any attributes before version, \s+ ensures whitespace before version
		VERSION: /<rss\s[^>]*version\s*=\s*["'][\d.]+["']/i,

		// Matches RSS channel opening tag (required container for RSS content)
		CHANNEL: /<channel[^>]*>/i,

		// Matches RSS item opening tag (individual feed entries)
		ITEM: /<item[^>]*>/i,

		// Matches RSS description opening tag (content description)
		DESCRIPTION: /<description[^>]*>/i,

		// Matches RSS channel closing tag
		CHANNEL_END: /<\/channel>/i,

		// Captures entire channel content between opening and closing tags
		// [\s\S]*? uses non-greedy matching to capture everything including newlines
		CHANNEL_CONTENT: /<channel>([\s\S]*?)<\/channel>/i,

		// Captures title content between title tags (feed or item title)
		TITLE: /<title>([\s\S]*?)<\/title>/i,
	},

	// Atom feed detection patterns
	ATOM: {
		// Matches Atom feed opening tag with optional attributes: <feed ...>
		// (?:\s+[^>]*)? is a non-capturing group for optional attributes
		FEED_START: /<feed[\s>]/i,

		// Matches Atom namespace declaration: xmlns="...atom..." or xmlns:atom="..."
		// These patterns ensure the feed uses the Atom XML namespace
		NAMESPACE_XMLNS: /<feed[^>]*xmlns[^>]*atom/i,
		NAMESPACE_XMLNS_ATOM: /<feed[^>]*xmlns:atom/i,
		NAMESPACE_ATOM_PREFIX: /<feed[^>]*atom:/i,

		// Matches Atom entry opening tag (individual feed entries)
		ENTRY: /<entry[^>]*>/i,

		// Matches Atom title opening tag
		TITLE_TAG: /<title[^>]*>/i,

		// Captures title content between title tags
		TITLE_CONTENT: /<title>([\s\S]*?)<\/title>/i,
	},
};

/**
 * Validates that a URL uses HTTP or HTTPS protocol
 * @param url - The URL to validate
 * @throws {Error} When URL is invalid or uses non-HTTP(S) protocol
 */
function validateUrl(url: string): void {
	let urlObj: URL;

	try {
		urlObj = new URL(url);
	} catch {
		throw new Error(`Invalid URL: ${url}`);
	}

	// Security: Only allow HTTP and HTTPS protocols
	if (!['http:', 'https:'].includes(urlObj.protocol)) {
		throw new Error(
			`Invalid protocol: ${urlObj.protocol}. Only http: and https: protocols are allowed.`
		);
	}
}

/**
 * Validates content size to prevent memory exhaustion
 * @param content - The content to validate
 * @throws {Error} When content exceeds maximum size limit
 */
function validateContentSize(content: string): void {
	if (content.length > VALIDATION_LIMITS.MAX_CONTENT_SIZE) {
		throw new Error(
			`Content too large: ${content.length} bytes. Maximum allowed: ${VALIDATION_LIMITS.MAX_CONTENT_SIZE} bytes.`
		);
	}
}

/**
 * Validates and normalizes timeout value
 * @param timeout - The timeout value in seconds (optional)
 * @returns Validated timeout value in seconds
 */
function validateTimeout(timeout: number | undefined): number {
	// Use default if not provided
	if (timeout === undefined || timeout === null) {
		return VALIDATION_LIMITS.DEFAULT_TIMEOUT;
	}

	// Validate that timeout is a finite number
	if (!Number.isFinite(timeout) || timeout < VALIDATION_LIMITS.MIN_TIMEOUT) {
		console.warn(
			`Invalid timeout value ${timeout}. Using minimum: ${VALIDATION_LIMITS.MIN_TIMEOUT} seconds.`
		);
		return VALIDATION_LIMITS.MIN_TIMEOUT;
	}

	// Clamp to maximum allowed value
	if (timeout > VALIDATION_LIMITS.MAX_TIMEOUT) {
		console.warn(
			`Timeout value ${timeout} exceeds maximum. Clamping to ${VALIDATION_LIMITS.MAX_TIMEOUT} seconds.`
		);
		return VALIDATION_LIMITS.MAX_TIMEOUT;
	}

	return Math.floor(timeout);
}

/**
 * Checks if a URL is likely an oEmbed endpoint
 * @param url - The URL to check
 * @returns True if URL matches oEmbed patterns
 */
function isOEmbedEndpoint(url: string): boolean {
	return OEMBED.URL_PATTERNS.some(pattern => url.includes(pattern));
}

/**
 * Checks if JSON data is an oEmbed response
 * @param json - The parsed JSON data
 * @returns True if data appears to be an oEmbed response
 */
function isOEmbedResponse(json: any): boolean {
	// Check for standard oEmbed type and version
	if (
		json.type &&
		(OEMBED.TYPES as readonly string[]).includes(json.type) &&
		(OEMBED.VERSIONS as readonly string[]).includes(json.version)
	) {
		return true;
	}

	// Check for other oEmbed indicators (type + version + html)
	if (json.type && json.version && json.html) {
		return true;
	}

	return false;
}

/**
 * Removes CDATA tags from text content
 * @param text - The text to remove CDATA tags from
 * @returns The text with CDATA tags removed
 */
function removeCDATA(text: string): string {
	return text.replaceAll(FEED_PATTERNS.CDATA, '$1');
}

/**
 * Cleans titles by removing excessive whitespace and newlines
 * @param title - The title to clean
 * @returns The cleaned title, or null if input is falsy
 */
function cleanTitle(title: string | null | undefined): string | null {
	if (!title) return null; // Explicitly return null for falsy values
	// Remove leading/trailing whitespace and collapse multiple whitespace characters
	return title.replaceAll(/\s+/g, ' ').trim();
}

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
export default async function checkFeed(url: string, content: string = '', instance?: FeedSeekerInstance): Promise<FeedResult | null> {
	// Security: Validate URL format and protocol
	validateUrl(url);

	// Check if URL pattern indicates this is likely an oEmbed endpoint
	if (isOEmbedEndpoint(url)) {
		// WordPress oEmbed endpoints are not feeds
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
	const result = checkRss(content) || checkAtom(content) || checkJson(content) || null;
	return result;
}

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
function checkRss(content: string): FeedResult | null {
	// Step 1: Check for RSS root element with version attribute
	// RSS feeds must start with an <rss> tag with a version attribute (RSS 0.91, 1.0, 2.0, etc.)
	if (FEED_PATTERNS.RSS.VERSION.test(content)) {
		// Step 2: Validate required RSS structure elements
		const hasChannel = FEED_PATTERNS.RSS.CHANNEL.test(content); // Container for feed metadata
		const hasItem = FEED_PATTERNS.RSS.ITEM.test(content); // Individual feed entries
		const hasDescription = FEED_PATTERNS.RSS.DESCRIPTION.test(content); // Content description

		// Step 3: Validate RSS structure - must have channel + description + (items OR proper channel closure)
		// The (hasItem || FEED_PATTERNS.RSS.CHANNEL_END.test(content)) check handles edge cases:
		// - Normal feeds: have <item> elements
		// - Empty feeds: have proper </channel> closure but no items yet
		if (hasChannel && hasDescription && (hasItem || FEED_PATTERNS.RSS.CHANNEL_END.test(content))) {
			const title = extractRssTitle(content);
			return { type: 'rss', title };
		}
	}
	return null;
}

/**
 * Checks if content is an Atom feed
 * @param content - The content to check for Atom feed elements
 * @returns Object with type 'atom' and title if Atom feed, null otherwise
 */
function checkAtom(content: string): FeedResult | null {
	// Check for Atom feed root element with appropriate namespace
	const hasAtomNamespace =
		FEED_PATTERNS.ATOM.NAMESPACE_XMLNS.test(content) ||
		FEED_PATTERNS.ATOM.NAMESPACE_XMLNS_ATOM.test(content) ||
		FEED_PATTERNS.ATOM.NAMESPACE_ATOM_PREFIX.test(content);

	if (FEED_PATTERNS.ATOM.FEED_START.test(content) && hasAtomNamespace) {
		// For Atom feeds, having <entry> elements is required to be a valid feed
		const hasEntry = FEED_PATTERNS.ATOM.ENTRY.test(content);

		// Additional check: Atom feeds should also have a feed-level title
		const hasTitle = FEED_PATTERNS.ATOM.TITLE_TAG.test(content);

		if (hasEntry && hasTitle) {
			// Extract title from Atom feed (feed title, not entry title)
			const match = FEED_PATTERNS.ATOM.TITLE_CONTENT.exec(content);
			const title = match ? cleanTitle(removeCDATA(match[1])) : null;
			return { type: 'atom', title };
		}
	}
	return null;
}

/**
 * Checks if content is a JSON feed
 * @param content - The content to check for JSON feed properties
 * @returns Object with type 'json' and title if JSON feed, null otherwise
 */
function checkJson(content: string): FeedResult | null {
	try {
		const json = JSON.parse(content);

		// Check if this looks like an oEmbed response - these are NOT feeds
		if (isOEmbedResponse(json)) {
			return null;
		}

		// Check if it's a JSON feed by looking for common properties
		// JSON feeds should have the version property with 'jsonfeed' in the value
		// or both 'items' array and other feed properties
		if (
			(json.version && typeof json.version === 'string' && json.version.includes('jsonfeed')) ||
			(json.items && Array.isArray(json.items)) ||
			json.feed_url
		) {
			// Extract title from JSON feed
			// Security: Validate that title is a string before processing
			const rawTitle = json.title || json.name || null;
			const title = typeof rawTitle === 'string' ? cleanTitle(rawTitle) : null;
			return { type: 'json', title };
		}
		return null;
	} catch {
		// Not valid JSON or parsing failed
		return null;
	}
}

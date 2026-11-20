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
import {
	validateUrl,
	validateContentSize,
	validateTimeout,
	VALIDATION_LIMITS
} from './validation.ts';
import { checkRss } from './checkRss.ts';
import { checkAtom } from './checkAtom.ts';
import { checkJson } from './checkJson.ts';
import { isChallengeResponse } from '../challengeDetection.ts';
import { type FeedResult, type FeedSeekerInstance } from './types.ts';

/**
 * Error thrown when a candidate feed URL returned a bot-mitigation challenge
 * page (e.g. Cloudflare) instead of real content. Distinguished from a plain
 * fetch failure so callers (blindSearch) can stop probing a host instead of
 * treating it as an ordinary miss worth retrying at the next candidate URL.
 */
export class ChallengeResponseError extends Error {
	constructor(url: string) {
		super(`Fetch of ${url} was blocked by a bot-mitigation challenge`);
		this.name = 'ChallengeResponseError';
	}
}

export { type FeedResult, type FeedSeekerInstance } from './types.ts';

// An HTML document start (optionally after an XML declaration / comments). Feeds
// start with <?xml, <rss, <feed, <rdf:RDF or {, so this never matches one.
const HTML_DOCUMENT_START =
	/^\s*(?:<\?xml[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<(?:!doctype\s+html|html)[\s>]/i;
const HTML_SNIFF_BYTES = 2048;
// Once a body is known to be HTML, the rest is read and thrown away rather than
// cancelled: cancelling closes the keep-alive connection, and a new TLS handshake
// per candidate measured ~3x slower than draining a typical page. Only pages
// larger than this are cut off.
const HTML_DRAIN_LIMIT_BYTES = 1024 * 1024;

/**
 * Reads the response body, but returns null as soon as the first few KB show
 * an HTML document — most candidates (soft 404s, article pages) are full HTML
 * pages that would otherwise be buffered and regex-scanned only to be rejected.
 */
async function readUnlessHtmlPage(response: Response): Promise<string | null> {
	const reader = response.body?.getReader();
	if (!reader) return response.text();

	const decoder = new TextDecoder();
	let text = '';
	let sniffed = false;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		text += decoder.decode(value, { stream: true });
		if (!sniffed && text.length >= HTML_SNIFF_BYTES) {
			sniffed = true;
			if (HTML_DOCUMENT_START.test(text.slice(0, HTML_SNIFF_BYTES))) {
				await drainOrCancel(reader, text.length);
				return null;
			}
		}
		if (text.length > VALIDATION_LIMITS.MAX_CONTENT_SIZE) break; // validateContentSize rejects it
	}
	text += decoder.decode();
	return !sniffed && HTML_DOCUMENT_START.test(text) ? null : text;
}

async function drainOrCancel(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	alreadyRead: number
): Promise<void> {
	try {
		let total = alreadyRead;
		for (;;) {
			const { done, value } = await reader.read();
			if (done) return;
			total += value.byteLength;
			if (total > HTML_DRAIN_LIMIT_BYTES) {
				await reader.cancel();
				return;
			}
		}
	} catch {
		// timeout/abort while draining — the page is rejected either way
	}
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
	let resolvedUrl: string | undefined;
	if (!content) {
		if (!instance) {
			throw new Error('Instance parameter is required when content is not provided');
		}

		// Security: Validate and normalize timeout value
		const timeoutSecs = validateTimeout(instance.options.timeout);
		const timeout = timeoutSecs * 1000;

		const response = await fetchWithTimeout(url, { timeout, insecure: instance.options.insecure });
		if (!response.ok) {
			if (isChallengeResponse(response, '')) {
				throw new ChallengeResponseError(url);
			}
			throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
		}
		// Reject before downloading when the server announces an oversized body.
		const contentLength = Number(response.headers?.get('content-length'));
		if (contentLength > VALIDATION_LIMITS.MAX_CONTENT_SIZE) {
			await response.body?.cancel().catch(() => {});
			throw new Error(
				`Content too large: ${contentLength} bytes. Maximum allowed: ${VALIDATION_LIMITS.MAX_CONTENT_SIZE} bytes.`
			);
		}
		const body = await readUnlessHtmlPage(response);
		if (body === null) {
			onReject?.('content is an HTML page, not a feed');
			return null;
		}
		content = body;
		// response.url reflects where the request actually landed after following
		// redirects, which may differ from the requested url.
		resolvedUrl = response.url || undefined;
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
		onReject?.(
			specificRejectReason ?? 'content is not a recognized RSS, Atom, or JSON feed format'
		);
		return null;
	}
	rememberFeedContent(url, content);
	return resolvedUrl ? { ...result, resolvedUrl } : result;
}

// Content of recently recognized feeds, so `--check` can read a feed's items
// without downloading it a second time. Bounded in count and per-entry size
// because library users who never read it back must not leak memory.
const FEED_CACHE_MAX_ENTRIES = 20;
const FEED_CACHE_MAX_CHARS = 2 * 1024 * 1024;
const feedContentCache = new Map<string, string>();

function rememberFeedContent(url: string, content: string): void {
	if (content.length > FEED_CACHE_MAX_CHARS) return;
	feedContentCache.delete(url); // re-insert so it counts as newest
	feedContentCache.set(url, content);
	if (feedContentCache.size > FEED_CACHE_MAX_ENTRIES) {
		feedContentCache.delete(feedContentCache.keys().next().value!);
	}
}

/** Returns (and forgets) the content checkFeed saw for this feed URL, if still cached. */
export function takeCachedFeedContent(url: string): string | undefined {
	const content = feedContentCache.get(url);
	feedContentCache.delete(url);
	return content;
}

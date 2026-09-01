/**
 * @fileoverview anchors - Feed discovery through anchor link analysis
 *
 * This module analyzes anchor elements (<a> tags) on web pages to discover potential
 * feed URLs. It includes utilities for URL parsing, domain filtering, meta refresh
 * handling, and comprehensive anchor processing with memory optimization.
 *
 * @module anchors
 * @version 1.0.0
 * @author latz
 * @since 1.0.0
 */

import { parseHTML } from 'linkedom';
import checkFeed from '../checkFeed/index.ts';
import fetchWithTimeout from '../fetchWithTimeout.ts';
import { type Feed, type MetaLinksInstance } from '../metaLinks.ts';
import { isValidHttpUrl, isRelativePath, parseUrlSafely } from './urlUtils.ts';
import { isAllowedDomain } from './domainFilter.ts';

export { ALLOWED_DOMAINS } from './domainFilter.ts';

// Regex hoisted to module level — String.prototype.match with /g resets lastIndex implicitly, so reuse is safe
const URL_REGEX = /https?:\/\/[^\s"'<>)]+/gi;

/**
 * Fetches and parses the meta-refresh target URL, then recursively checks it for feeds.
 * Returns an empty array (rather than throwing) if the target page can't be fetched.
 */
async function followRedirectTarget(instance: MetaLinksInstance, redirectUrl: string): Promise<Feed[]> {
	const response = await fetchWithTimeout(redirectUrl, {
		timeout: instance.options?.timeout,
		insecure: instance.options?.insecure
	});
	if (!response?.ok) return [];
	const html = await response.text();
	const { document } = parseHTML(html);
	return checkAnchors({ ...instance, site: redirectUrl, document });
}

/**
 * Handles meta refresh redirects if present in the document.
 * It will fetch the content of the new URL and update the instance's document.
 * @param {MetaLinksInstance} instance - The FeedSeeker instance containing document and site info.
 */
function handleMetaRefreshRedirect(instance: MetaLinksInstance): Promise<Feed[]> | null {
	if (instance.options.followMetaRefresh) {
		if (instance.document && typeof instance.document.querySelector === 'function') {
			const content = instance.document
				.querySelector('meta[http-equiv="refresh"]')
				?.getAttribute('content');
			if (content) {
				const match = /url=(.*)/i.exec(content);
				if (match?.[1]) {
					const redirectUrl = new URL(match[1], instance.site).href;
					instance.emit('log', {
						module: 'anchors',
						message: `Following meta refresh redirect to ${redirectUrl}`
					});
					return followRedirectTarget(instance, redirectUrl);
				}
			}
		}
	}
	return null;
}

/**
 * Resolves the URL from an anchor element.
 * @param {HTMLAnchorElement} anchor - The anchor element.
 * @param {URL} baseUrl - The base URL for resolving relative paths.
 * @param {MetaLinksInstance} instance - The FeedSeeker instance for emitting errors.
 * @returns {string|null} The resolved URL or null if invalid.
 */
function getUrlFromAnchor(
	anchor: HTMLAnchorElement,
	baseUrl: URL,
	instance: MetaLinksInstance
): string | null {
	if (!anchor.href) {
		return null;
	}

	if (isValidHttpUrl(anchor.href)) {
		return anchor.href;
	}

	if (isRelativePath(anchor.href)) {
		const resolvedUrl = parseUrlSafely(anchor.href, baseUrl);
		if (!resolvedUrl) {
			instance.emit('error', {
				module: 'anchors',
				error: `Invalid relative URL: ${anchor.href}`,
				explanation:
					'A relative URL found in an anchor tag could not be resolved against the base URL. This may be due to malformed relative path syntax.',
				suggestion:
					'Check the anchor href attribute for proper relative path format (e.g., "./feed.xml", "../rss.xml", or "/feed").'
			});
			return null;
		}
		return resolvedUrl.href;
	}

	// Skips non-HTTP schemes (mailto:, javascript:, ftp:, etc.)
	return null;
}

/**
 * Extracts all HTTP and HTTPS URLs from plain text content
 * @param {string} text - The text content to search for URLs
 * @returns {string[]} Array of unique URLs found in the text
 */
function extractUrlsFromText(text: string): string[] {
	const matches = text.match(URL_REGEX);

	if (!matches) {
		return [];
	}

	// Remove duplicates and clean up trailing punctuation that might be caught
	const uniqueUrls = new Set<string>();
	for (const url of matches) {
		// Remove trailing punctuation that's likely not part of the URL
		// Using a loop instead of regex to avoid potential ReDoS via backtracking
		let cleaned = url;
		while (cleaned.length > 0 && '.,;:!?'.includes(cleaned.at(-1)!)) {
			cleaned = cleaned.slice(0, -1);
		}
		uniqueUrls.add(cleaned);
	}

	return Array.from(uniqueUrls);
}

/**
 * Context object for processing anchors
 */
interface AnchorContext {
	instance: MetaLinksInstance;
	baseUrl: URL;
	feedUrls: Feed[];
}

/**
 * Checks a single anchor to see if it's a feed and adds it to the list if so.
 * @param {HTMLAnchorElement} anchor - The anchor element to check.
 * @param {AnchorContext} context - The context containing instance, baseUrl, and feedUrls array.
 * @returns {Promise<void>}
 */
async function processAnchor(
	anchor: HTMLAnchorElement,
	urlToCheck: string,
	context: AnchorContext
): Promise<void> {
	const { instance, feedUrls } = context;

	try {
		const feedResult = await checkFeed(urlToCheck, '', instance);
		if (feedResult) {
			feedUrls.push({
				url: urlToCheck,
				title: anchor.textContent?.trim() || null,
				type: feedResult.type,
				feedTitle: feedResult.title
			});
		}
	} catch (error: unknown) {
		if (instance.options?.showErrors) {
			const err = error instanceof Error ? error : new Error(String(error));
			instance.emit('error', {
				module: 'anchors',
				error: `Error checking feed at ${urlToCheck}: ${err.message}`,
				explanation:
					'An error occurred while trying to fetch and validate a potential feed URL found in an anchor tag. This could be due to network timeouts, server errors, or invalid feed content.',
				suggestion:
					'Check if the URL is accessible and returns valid feed content. Network connectivity issues or server problems may cause this error.'
			});
		}
	}
}

/**
 * Emits a log event indicating the max feeds limit has been reached.
 */
function emitMaxFeedsReached(
	instance: MetaLinksInstance,
	feedCount: number,
	maxFeeds: number
): void {
	instance.emit('log', {
		module: 'anchors',
		message: `Stopped due to reaching maximum feeds limit: ${feedCount} feeds found (max ${maxFeeds} allowed).`
	});
}

/**
 * Processes anchor tags in batches and appends found feeds to context.feedUrls.
 * @returns {number} Number of anchors processed.
 */
async function processAnchorPhase(
	filteredAnchors: { anchor: HTMLAnchorElement; url: string }[],
	context: AnchorContext,
	concurrency: number,
	maxFeeds: number
): Promise<number> {
	let processedCount = 0;
	for (let i = 0; i < filteredAnchors.length; i += concurrency) {
		if (maxFeeds > 0 && context.feedUrls.length >= maxFeeds) {
			emitMaxFeedsReached(context.instance, context.feedUrls.length, maxFeeds);
			break;
		}
		const batch = filteredAnchors.slice(i, i + concurrency);
		await Promise.allSettled(
			batch.map(async ({ anchor, url }) => {
				if (maxFeeds > 0 && context.feedUrls.length >= maxFeeds) return;
				processedCount++;
				context.instance.emit('log', {
					module: 'anchors',
					totalCount: processedCount,
					totalEndpoints: filteredAnchors.length
				});
				await processAnchor(anchor, url, context);
			})
		);
	}
	return processedCount;
}

/**
 * Extracts plain-text URLs from the page body and checks them for feeds.
 */
async function processPlainTextPhase(
	context: AnchorContext,
	baseUrl: URL,
	anchorCount: number,
	startCount: number,
	concurrency: number,
	maxFeeds: number
): Promise<void> {
	// linkedom's .body/.head getters throw (rather than returning null) when the
	// parsed content has no documentElement, e.g. a non-HTML response body.
	const bodyText = context.instance.document.documentElement
		? context.instance.document.body?.textContent || ''
		: '';
	const plainTextUrls = extractUrlsFromText(bodyText);

	const checkedUrls = new Set(context.feedUrls.map((feed) => feed.url));
	const urlsToCheck: string[] = [];
	for (const url of plainTextUrls) {
		if (!checkedUrls.has(url) && isAllowedDomain(url, baseUrl)) {
			urlsToCheck.push(url);
			checkedUrls.add(url);
		}
	}

	let count = startCount;
	const totalEndpoints = anchorCount + urlsToCheck.length;
	for (let i = 0; i < urlsToCheck.length; i += concurrency) {
		if (maxFeeds > 0 && context.feedUrls.length >= maxFeeds) {
			emitMaxFeedsReached(context.instance, context.feedUrls.length, maxFeeds);
			break;
		}
		const batch = urlsToCheck.slice(i, i + concurrency);
		await Promise.allSettled(
			batch.map(async (url) => {
				if (maxFeeds > 0 && context.feedUrls.length >= maxFeeds) return;
				context.instance.emit('log', { module: 'anchors', totalCount: count++, totalEndpoints });
				try {
					const feedResult = await checkFeed(url, '', context.instance);
					if (feedResult) {
						context.feedUrls.push({
							url,
							title: null,
							type: feedResult.type,
							feedTitle: feedResult.title
						});
					}
				} catch (error: unknown) {
					if (context.instance.options?.showErrors) {
						const err = error instanceof Error ? error : new Error(String(error));
						context.instance.emit('error', {
							module: 'anchors',
							error: `Error checking feed at ${url}: ${err.message}`,
							explanation:
								'An error occurred while trying to fetch and validate a potential feed URL found in page text. This could be due to network timeouts, server errors, or invalid feed content.',
							suggestion:
								'Check if the URL is accessible and returns valid feed content. Network connectivity issues or server problems may cause this error.'
						});
					}
				}
			})
		);
	}
}

/**
 * Checks all links on the page and verifies if they are feeds
 * @param {MetaLinksInstance} instance - The FeedSeeker instance containing document and site info
 * @returns {Promise<Feed[]>} A promise that resolves to an array of found feed URLs
 */
async function checkAnchors(instance: MetaLinksInstance): Promise<Feed[]> {
	const redirectResult = handleMetaRefreshRedirect(instance);
	if (redirectResult) {
		return redirectResult;
	}

	const baseUrl = new URL(instance.site);
	const allAnchors = instance.document.querySelectorAll('a');
	const filteredAnchors: { anchor: HTMLAnchorElement; url: string }[] = [];

	for (const anchor of allAnchors) {
		const urlToCheck = getUrlFromAnchor(anchor, baseUrl, instance);
		if (urlToCheck && isAllowedDomain(urlToCheck, baseUrl)) {
			filteredAnchors.push({ anchor, url: urlToCheck });
		}
	}

	const maxFeeds = instance.options?.maxFeeds || 0;
	const concurrency = instance.options?.concurrency ?? 3;
	const context: AnchorContext = { instance, baseUrl, feedUrls: [] };

	// Phase 1: anchor tags
	const processedCount = await processAnchorPhase(filteredAnchors, context, concurrency, maxFeeds);

	// Phase 2: plain-text URLs in body
	if (maxFeeds === 0 || context.feedUrls.length < maxFeeds) {
		await processPlainTextPhase(
			context,
			baseUrl,
			filteredAnchors.length,
			processedCount + 1,
			concurrency,
			maxFeeds
		);
	}

	return context.feedUrls;
}

/**
 * Main function to analyze all anchor elements and plain-text URLs on a page for potential feed URLs
 * First processes anchor tags, then extracts and validates any HTTP/HTTPS URLs found in page text
 * Processes with memory optimization, domain filtering, and comprehensive validation
 * @param {MetaLinksInstance} instance - The FeedSeeker instance containing parsed HTML and configuration
 * @returns {Promise<Feed[]>} Array of validated feed objects with url, title, and type properties
 * @throws {Error} When feed validation fails or network errors occur
 * @example
 * const feedSeeker = new FeedSeeker('https://example.com');
 * const feeds = await checkAllAnchors(feedSeeker);
 * console.log(feeds); // [{ url: '...', title: '...', type: 'rss' }]
 */
export default async function checkAllAnchors(instance: MetaLinksInstance): Promise<Feed[]> {
	instance.emit('start', {
		module: 'anchors',
		niceName: 'Check All Anchors'
	});

	const feeds = await checkAnchors(instance);

	instance.emit('end', { module: 'anchors', feeds });
	return feeds;
}

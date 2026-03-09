/**
 * @fileoverview metaLinks - Feed discovery through HTML meta link elements
 *
 * This module searches for RSS, Atom, and JSON feeds by analyzing <link> elements
 * in the HTML head section. It looks for specific rel and type attributes that
 * indicate feed URLs and validates them before returning results.
 *
 * @module metaLinks
 * @version 1.0.0
 * @author latz
 * @since 1.0.0
 */

import checkFeed, { type FeedSeekerInstance } from './checkFeed.ts';

/**
 * Feed type MIME types to search for in link elements
 */
const FEED_TYPES = ['feed+json', 'rss+xml', 'atom+xml', 'xml', 'rdf+xml'] as const;

/**
 * URL patterns that suggest a feed
 */
const FEED_PATTERNS = ['/rss', '/feed', '/atom', '.rss', '.atom', '.xml', '.json'] as const;

/**
 * Cleans titles by removing excessive whitespace and newlines
 * @param {string} title - The title to clean
 * @returns {string} The cleaned title
 */
function cleanTitle(title: string | null | undefined): string | null {
	if (!title) return null;
	// Remove leading/trailing whitespace and collapse multiple whitespace characters
	return title.replaceAll(/\s+/g, ' ').trim();
}

/**
 * Feed object structure
 */
export interface Feed {
	url: string;
	title: string | null;
	type: 'rss' | 'atom' | 'json';
	feedTitle: string | null;
}

/**
 * Extended FeedSeeker instance for metaLinks
 */
export interface MetaLinksInstance extends FeedSeekerInstance {
	document: Document;
	site: string;
	emit: (event: string, data: unknown) => void;
}

/**
 * Processes multiple links in parallel while respecting the maxFeeds limit.
 * @param {HTMLLinkElement[]} links - The link elements to process.
 * @param {MetaLinksInstance} instance - The FeedSeeker instance.
 * @param {Array<Feed>} feeds - The array of found feeds.
 * @param {Set<string>} foundUrls - A set of URLs that have already been added.
 * @param {number} batchSize - Number of links to process concurrently (default: 5).
 * @returns {Promise<boolean>} A promise that resolves to true if the maxFeeds limit is reached, false otherwise.
 * @private
 */
async function processLinksInBatches(
	links: HTMLLinkElement[],
	instance: MetaLinksInstance,
	feeds: Feed[],
	foundUrls: Set<string>,
	batchSize: number = 5
): Promise<boolean> {
	const maxFeeds = instance.options?.maxFeeds || 0;

	for (let i = 0; i < links.length; i += batchSize) {
		if (maxFeeds > 0 && feeds.length >= maxFeeds) {
			return true;
		}

		const batch = links.slice(i, i + batchSize);
		await Promise.allSettled(
			batch.map(async (link) => {
				if (maxFeeds > 0 && feeds.length >= maxFeeds) return;
				await processLink(link, instance, feeds, foundUrls);
			})
		);
	}

	return maxFeeds > 0 && feeds.length >= maxFeeds;
}

/**
 * Processes a link element to check if it's a feed and adds it to the feeds array.
 * @param {HTMLLinkElement} link - The link element to process.
 * @param {MetaLinksInstance} instance - The FeedSeeker instance.
 * @param {Array<Feed>} feeds - The array of found feeds.
 * @param {Set<string>} foundUrls - A set of URLs that have already been added.
 * @returns {Promise<void>} A promise that resolves when the link has been processed.
 * @private
 */
/**
 * Resolves a link element's href to an absolute URL, or returns null on failure.
 */
function resolveHref(link: HTMLLinkElement, instance: MetaLinksInstance): string | null {
	if (!link.href) return null;
	try {
		return new URL(link.href, instance.site).href;
	} catch (error: unknown) {
		if (instance.options?.showErrors) {
			const err = error instanceof Error ? error : new Error(String(error));
			instance.emit('error', {
				module: 'metalinks',
				error: err.message,
				explanation: `Invalid URL found in meta link: ${link.href}. Unable to construct a valid URL.`,
				suggestion: 'Check the meta link href attribute for malformed URLs.'
			});
		}
		return null;
	}
}

/**
 * Records a validated feed and returns true if the maxFeeds limit has been reached.
 */
function recordFeed(
	fullHref: string,
	link: HTMLLinkElement,
	feedResult: { type: 'rss' | 'atom' | 'json'; title: string | null },
	feeds: Feed[],
	foundUrls: Set<string>,
	instance: MetaLinksInstance
): boolean {
	feeds.push({
		url: fullHref,
		title: cleanTitle(link.title),
		type: feedResult.type,
		feedTitle: feedResult.title
	});
	foundUrls.add(fullHref);
	const maxFeeds = instance.options?.maxFeeds || 0;
	if (maxFeeds > 0 && feeds.length >= maxFeeds) {
		instance.emit('log', {
			module: 'metalinks',
			message: `Stopped due to reaching maximum feeds limit: ${feeds.length} feeds found (max ${maxFeeds} allowed).`
		});
		return true;
	}
	return false;
}

async function processLink(
	link: HTMLLinkElement,
	instance: MetaLinksInstance,
	feeds: Feed[],
	foundUrls: Set<string>
): Promise<void> {
	const fullHref = resolveHref(link, instance);
	if (!fullHref || foundUrls.has(fullHref)) return;

	instance.emit('log', { module: 'metalinks', message: `Checking feed: ${fullHref}` });

	try {
		const feedResult = await checkFeed(fullHref, '', instance);
		if (feedResult) {
			recordFeed(fullHref, link, feedResult, feeds, foundUrls, instance);
		}
	} catch (error: unknown) {
		if (instance.options?.showErrors) {
			const err = error instanceof Error ? error : new Error(String(error));
			instance.emit('error', {
				module: 'metalinks',
				error: err.message,
				explanation:
					'An error occurred while trying to fetch and validate a feed URL found in a meta link tag. This could be due to network issues, server problems, or invalid feed content.',
				suggestion:
					'Check if the meta link URL is accessible and returns valid feed content. The search will continue with other meta links.'
			});
		}
	}
}

/**
 * Searches for feeds using meta links in the page head section
 * Analyzes <link> elements with feed-related rel and type attributes
 * @param {MetaLinksInstance} instance - The FeedSeeker instance containing parsed HTML and options
 * @returns {Promise<Array<Feed>>} Array of found feed objects with url, title, and type properties
 * @throws {Error} When feed validation fails or network errors occur
 * @example
 * // MetaLinksInstance extends FeedSeekerInstance with document and site properties
 * const instance = {
 *   document: parsedDocument,
 *   site: 'https://example.com',
 *   emit: (event, data) => console.log(event, data),
 *   options: { maxFeeds: 10 }
 * };
 * const feeds = await metaLinks(instance);
 * console.log(feeds); // [{ url: '...', title: '...', type: 'rss', feedTitle: '...' }]
 */
export default async function metaLinks(instance: MetaLinksInstance): Promise<Feed[]> {
	instance.emit('start', { module: 'metalinks', niceName: 'Meta Links' });
	const feeds: Feed[] = [];
	const foundUrls = new Set<string>();

	try {
		// 1. Check for links with specific feed `type` attributes.
		const typeSelectors = FEED_TYPES.map((type) => `link[type="application/${type}"]`).join(', ');
		const typeLinks = Array.from(
			instance.document.querySelectorAll<HTMLLinkElement>(typeSelectors)
		);

		if (await processLinksInBatches(typeLinks, instance, feeds, foundUrls)) {
			return feeds;
		}

		// 2. Check for `rel="alternate"` links with feed-related `type` attributes.
		const alternateTypeSelectors =
			'link[rel="alternate"][type*="rss"], link[rel="alternate"][type*="xml"], link[rel="alternate"][type*="atom"], link[rel="alternate"][type*="json"]';
		const alternateTypeLinks = Array.from(
			instance.document.querySelectorAll<HTMLLinkElement>(alternateTypeSelectors)
		);

		if (await processLinksInBatches(alternateTypeLinks, instance, feeds, foundUrls)) {
			return feeds;
		}

		// 3. Check for `rel="alternate"` links with `href` patterns that suggest a feed.
		const alternateLinks = Array.from(
			instance.document.querySelectorAll<HTMLLinkElement>('link[rel="alternate"]')
		);
		const patternLinks = alternateLinks.filter(
			(link) =>
				link.href && FEED_PATTERNS.some((pattern) => link.href.toLowerCase().includes(pattern))
		);

		if (await processLinksInBatches(patternLinks, instance, feeds, foundUrls)) {
			return feeds;
		}

		return feeds;
	} finally {
		// Always emit 'end' event, even if maxFeeds limit is reached or an error occurs
		instance.emit('end', { module: 'metalinks', feeds });
	}
}

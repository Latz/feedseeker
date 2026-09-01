import checkFeed from '../checkFeed/index.ts';
import { type MetaLinksInstance, type Feed } from '../metaLinks.ts';
import { validateSearchMode, validateConcurrency, validateRequestDelay, getEndpointsByMode } from './validation.ts';
import { generateEndpointUrls } from './urlGeneration.ts';

const DEFAULT_MAX_FEEDS = 0; // 0 means no limit

/**
 * Interface for blind search feed results
 * Note: BlindSearchFeed is now just an alias for Feed for backward compatibility.
 * The feedType property was redundant with the type property and has been removed.
 * @deprecated Use Feed instead. This alias will be removed in a future version.
 */
export type BlindSearchFeed = Feed;

/**
 * Adds a found feed to the feeds array and updates the feed type flags
 * @param {object} feedResult - The result from checkFeed
 * @param {string} url - The URL of the found feed
 * @param {Feed[]} feeds - The array to add the feed to
 * @param {boolean} rssFound - Whether an RSS feed has already been found
 * @param {boolean} atomFound - Whether an Atom feed has already been found
 * @returns {{rssFound: boolean, atomFound: boolean}} Updated flags
 */
function addFeed(
	feedResult: { type: 'rss' | 'atom' | 'json'; title: string | null },
	url: string,
	feeds: Feed[],
	rssFound: boolean,
	atomFound: boolean
): { rssFound: boolean; atomFound: boolean } {
	if (feedResult.type === 'rss') {
		rssFound = true;
	} else if (feedResult.type === 'atom') {
		atomFound = true;
	}

	feeds.push({
		url,
		title: null, // No link element title in blind search (unlike metaLinks)
		type: feedResult.type,
		feedTitle: feedResult.title // Actual feed title from parsing the feed
	});

	return { rssFound, atomFound };
}

/**
 * Determines if the search should continue based on options and found feeds
 * Implements early termination logic: stop when both RSS and Atom feeds are found (unless checking all)
 * @param {number} currentIndex - Current index in the URL array
 * @param {number} totalUrls - Total number of URLs to check
 * @param {boolean} rssFound - Whether an RSS feed has been found
 * @param {boolean} atomFound - Whether an Atom feed has already been found
 * @param {boolean} shouldCheckAll - Whether to check all URLs regardless of what's found
 * @returns {boolean} Whether to continue searching
 */
function shouldContinueSearch(
	currentIndex: number,
	totalUrls: number,
	rssFound: boolean,
	atomFound: boolean,
	shouldCheckAll: boolean
): boolean {
	// Stop if we've processed all URLs
	if (currentIndex >= totalUrls) {
		return false;
	}

	// Continue checking all URLs if shouldCheckAll is enabled
	if (shouldCheckAll) {
		return true;
	}

	// Otherwise, stop when both RSS and Atom feeds are found
	return !(rssFound && atomFound);
}

/**
 * Performs a "blind search" for RSS/Atom feeds by trying a list of common feed endpoint paths.
 * It traverses up the URL path from the instance's site URL to its origin,
 * appending various known feed endpoints at each level.
 *
 * @param {MetaLinksInstance} instance - The instance object containing site information and an event emitter.
 * @param {AbortSignal} [signal] - Optional AbortSignal to cancel the search operation
 * @returns {Promise<Feed[]>} A promise that resolves to an array of found feed objects.
 *   Each object contains the `url` of the feed, its `type` ('rss', 'atom', or 'json'), and its `title` if available.
 * @throws {Error} When the operation is aborted via AbortSignal
 */
export default async function blindSearch(
	instance: MetaLinksInstance,
	signal?: AbortSignal
): Promise<Feed[]> {
	// Security: Validate and sanitize search mode
	const searchMode = validateSearchMode(instance.options?.searchMode);
	const endpoints = getEndpointsByMode(searchMode);

	// Generate all possible endpoint URLs with prioritized endpoints
	const endpointUrls = generateEndpointUrls(
		instance.site,
		instance.options?.keepQueryParams || false,
		endpoints
	);

	// Emit the total count so the CLI can display it
	instance.emit('start', {
		module: 'blindsearch',
		niceName: 'Blind Search',
		endpointUrls: endpointUrls.length
	});

	const shouldCheckAll = instance.options?.all || false;
	const maxFeeds = instance.options?.maxFeeds ?? DEFAULT_MAX_FEEDS; // Maximum number of feeds to find

	// Security: Validate and clamp concurrency to safe limits
	const concurrency = validateConcurrency(instance.options?.concurrency);

	// Process each URL to find feeds with concurrent batching
	const results = await processFeeds(
		endpointUrls,
		shouldCheckAll,
		maxFeeds,
		concurrency,
		instance,
		signal
	);

	instance.emit('end', { module: 'blindsearch', feeds: results.feeds });
	return results.feeds;
}

/**
 * Processes a list of URLs to find feeds with concurrent batching
 * @param {string[]} endpointUrls - Array of URLs to check for feeds
 * @param {boolean} shouldCheckAll - Whether to check all URLs regardless of what's found
 * @param {number} maxFeeds - Maximum number of feeds to find (0 = no limit)
 * @param {number} concurrency - Number of concurrent requests to make
 * @param {MetaLinksInstance} instance - The FeedSeeker instance
 * @param {AbortSignal} [signal] - Optional AbortSignal to cancel the operation
 * @returns {Promise<{feeds: Feed[], rssFound: boolean, atomFound: boolean}>} A promise that resolves to an object containing feeds, rssFound, and atomFound status
 * @throws {Error} When the operation is aborted
 */
async function processFeeds(
	endpointUrls: string[],
	shouldCheckAll: boolean,
	maxFeeds: number,
	concurrency: number,
	instance: MetaLinksInstance,
	signal?: AbortSignal
): Promise<{ feeds: Feed[]; rssFound: boolean; atomFound: boolean }> {
	const feeds: Feed[] = [];
	const foundUrls = new Set<string>();
	let rssFound = false;
	let atomFound = false;
	let i = 0;
	const requestDelay = validateRequestDelay(instance.options?.requestDelay);

	while (shouldContinueSearch(i, endpointUrls.length, rssFound, atomFound, shouldCheckAll)) {
		if (signal?.aborted) {
			throw new Error('Blind search operation was aborted');
		}

		if (maxFeeds > 0 && feeds.length >= maxFeeds) {
			await handleMaxFeedsReached(instance, feeds, maxFeeds);
			break;
		}

		const batchSize = Math.min(concurrency, endpointUrls.length - i);
		const batch = endpointUrls.slice(i, i + batchSize);

		const batchResults = await Promise.allSettled(
			batch.map((url) => processSingleFeedUrl(url, instance, foundUrls, feeds, rssFound, atomFound))
		);

		({ rssFound, atomFound, i } = await applyBatchResults(
			batchResults,
			feeds,
			rssFound,
			atomFound,
			{ maxFeeds, totalUrls: endpointUrls.length, i },
			instance
		));

		i += batchSize;
		instance.emit('log', {
			module: 'blindsearch',
			totalEndpoints: endpointUrls.length,
			totalCount: i,
			feedsFound: feeds.length
		});

		if (requestDelay > 0 && i < endpointUrls.length) {
			await new Promise((resolve) => setTimeout(resolve, requestDelay));
		}
	}

	return { feeds, rssFound, atomFound };
}

/**
 * Applies results from a settled batch, updating feed-type flags and enforcing maxFeeds.
 * Returns updated state: rssFound, atomFound, and i (may be advanced to end to stop loop).
 */
async function applyBatchResults(
	batchResults: PromiseSettledResult<{ found: boolean; rssFound: boolean; atomFound: boolean }>[],
	feeds: Feed[],
	rssFound: boolean,
	atomFound: boolean,
	ctx: { maxFeeds: number; totalUrls: number; i: number },
	instance: MetaLinksInstance
): Promise<{ rssFound: boolean; atomFound: boolean; i: number }> {
	let { i } = ctx;
	const { maxFeeds, totalUrls } = ctx;
	for (const result of batchResults) {
		if (result.status === 'fulfilled' && result.value.found) {
			rssFound = result.value.rssFound;
			atomFound = result.value.atomFound;
			if (maxFeeds > 0 && feeds.length >= maxFeeds) {
				await handleMaxFeedsReached(instance, feeds, maxFeeds);
				i = totalUrls; // force outer loop to end
				break;
			}
		}
	}
	return { rssFound, atomFound, i };
}

/**
 * Processes a single feed URL
 * @param {string} url - The URL to process
 * @param {MetaLinksInstance} instance - The FeedSeeker instance
 * @param {Set<string>} foundUrls - Set of already checked URLs to prevent duplicate requests
 * @param {Feed[]} feeds - Array of found feeds
 * @param {boolean} rssFound - Whether an RSS feed has been found
 * @param {boolean} atomFound - Whether an Atom feed has been found
 * @returns {Promise<{found: boolean, rssFound: boolean, atomFound: boolean}>} A promise that resolves to an object containing found status and updated flags
 */
async function processSingleFeedUrl(
	url: string,
	instance: MetaLinksInstance,
	foundUrls: Set<string>,
	feeds: Feed[],
	rssFound: boolean,
	atomFound: boolean
): Promise<{ found: boolean; rssFound: boolean; atomFound: boolean }> {
	// Skip if this URL has already been checked (prevents duplicate requests)
	if (foundUrls.has(url)) {
		return { found: false, rssFound, atomFound };
	}

	// Mark URL as checked before making the request
	foundUrls.add(url);

	try {
		const onReject = instance.options?.verbose
			? (reason: string) => {
					instance.emit('log', { module: 'blindsearch', url, reason });
				}
			: undefined;
		const feedResult = await checkFeed(url, '', instance, onReject);

		// Add feed if it was successfully validated
		if (feedResult) {
			// Add feed and update tracking flags
			const updatedFlags = addFeed(feedResult, url, feeds, rssFound, atomFound);
			rssFound = updatedFlags.rssFound;
			atomFound = updatedFlags.atomFound;

			return { found: true, rssFound, atomFound };
		}
	} catch (error: unknown) {
		const err = error instanceof Error ? error : new Error(String(error));
		await handleFeedError(instance, url, err);
	}

	return { found: false, rssFound, atomFound };
}

/**
 * Handles the case when maximum feeds limit is reached
 * @param {MetaLinksInstance} instance - The FeedSeeker instance
 * @param {Feed[]} feeds - Array of found feeds
 * @param {number} maxFeeds - Maximum number of feeds allowed
 * @returns {Promise<void>}
 */
async function handleMaxFeedsReached(
	instance: MetaLinksInstance,
	feeds: Feed[],
	maxFeeds: number
): Promise<void> {
	instance.emit('log', {
		module: 'blindsearch',
		message: `Stopped due to reaching maximum feeds limit: ${feeds.length} feeds found (max ${maxFeeds} allowed).`
	});
}

/**
 * Handles errors that occur during feed checking
 * @param {MetaLinksInstance} instance - The FeedSeeker instance
 * @param {string} url - The URL that caused the error
 * @param {Error} error - The error that occurred
 * @returns {Promise<void>}
 */
async function handleFeedError(
	instance: MetaLinksInstance,
	url: string,
	error: Error
): Promise<void> {
	// Only show errors if the undocumented --show-errors flag is set
	if (instance.options?.showErrors) {
		instance.emit('error', {
			module: 'blindsearch',
			error: `Error fetching ${url}: ${error.message}`,
			explanation:
				'An error occurred while trying to fetch a potential feed URL during blind search. This could be due to network timeouts, server errors, 404 not found, or invalid content.',
			suggestion:
				'This is normal during blind search as many URLs are tested. The search will continue with other potential feed endpoints.'
		});
	}
}

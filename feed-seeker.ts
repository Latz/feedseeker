#!/usr/bin/env node

/**
 * @fileoverview FeedSeeker - A comprehensive RSS, Atom, and JSON feed discovery tool
 *
 * This module provides the main FeedSeeker class for discovering feeds on websites
 * through multiple search strategies including meta links, anchor analysis,
 * blind search, and deep crawling.
 *
 * @module FeedSeeker
 * @version 1.0.0
 * @author latz
 * @since 1.0.0
 */

import { parseHTML } from 'linkedom';
import metaLinks, { type Feed, type MetaLinksInstance } from './modules/metaLinks.ts';
import checkAllAnchors from './modules/anchors.ts';
import blindSearch from './modules/blindsearch.ts';
import deepSearch, { type DeepSearchOptions } from './modules/deepSearch.ts';
import EventEmitter from './modules/eventEmitter.ts';
import fetchWithTimeout from './modules/fetchWithTimeout.ts';

/**
 * FeedSeeker options interface
 */
export interface FeedSeekerOptions extends DeepSearchOptions {
	maxFeeds?: number;
	timeout?: number;
	all?: boolean;
	keepQueryParams?: boolean;
	showErrors?: boolean;
	followMetaRefresh?: boolean;
	deepsearchOnly?: boolean;
	metasearch?: boolean;
	blindsearch?: boolean;
	anchorsonly?: boolean;
	deepsearch?: boolean;
	searchMode?: 'fast' | 'standard' | 'exhaustive';
	insecure?: boolean;
}

/**
 * Main FeedSeeker class for discovering RSS, Atom, and JSON feeds on websites
 *
 * @class FeedSeeker
 * @extends EventEmitter
 * @fires FeedSeeker#initialized - Emitted when the instance has finished initializing
 * @fires FeedSeeker#error - Emitted when an error occurs during initialization or search
 * @fires FeedSeeker#end - Emitted when a search completes with results
 * @example
 * const seeker = new FeedSeeker('https://example.com', { maxFeeds: 10 });
 * seeker.on('initialized', () => console.log('Initialization complete'));
 * seeker.on('error', (data) => console.error('Error:', data.error));
 * seeker.on('end', (data) => console.log('Found feeds:', data.feeds));
 *
 * const feeds = await seeker.metaLinks();
 * console.log('Meta link feeds:', feeds);
 */
/**
 * Initialization status for FeedSeeker instance
 */
export type InitStatus = 'pending' | 'success' | 'error';

export default class FeedSeeker extends EventEmitter implements MetaLinksInstance {
	site: string;
	options: FeedSeekerOptions;
	initPromise: Promise<void> | null;
	content?: string;
	document!: Document;
	private readonly rawSite: string; // Store the raw input for validation during initialization
	private initStatus: InitStatus = 'pending';

	/**
	 * Creates a new FeedSeeker instance
	 * @param {string} site - The website URL to search for feeds (protocol optional, defaults to https://)
	 * @param {FeedSeekerOptions} [options={}] - Configuration options for the search
	 * @example
	 * // Basic usage
	 * const seeker = new FeedSeeker('example.com');
	 * seeker.on('error', (error) => console.error(error));
	 *
	 * // With options
	 * const seeker = new FeedSeeker('https://blog.example.com', {
	 *   maxFeeds: 5,
	 *   timeout: 10,
	 *   all: true
	 * });
	 * seeker.on('error', (error) => console.error(error));
	 */
	constructor(site: string, options: FeedSeekerOptions = {}) {
		super();

		// Store the raw site for potential deferred error handling
		this.rawSite = site;

		// Normalize site URL (add https:// if no protocol, remove trailing slash)
		// This is done synchronously to maintain backward compatibility with tests
		// Any validation errors will be emitted during initialize()
		let normalizedSite = site;
		if (!normalizedSite.includes('://')) {
			normalizedSite = `https://${normalizedSite}`;
		}

		// Try to parse URL to normalize it, but don't throw errors here
		try {
			const urlObj = new URL(normalizedSite);
			// Normalize site link but remove trailing slash for root paths to prevent duplicate checks in path traversal
			// For example: https://example.com/ should become https://example.com to avoid checking endpoints twice
			this.site = urlObj.pathname === '/' ? urlObj.origin : urlObj.href;
		} catch {
			// If URL is invalid, store the normalized attempt
			// The actual error will be emitted during initialize()
			this.site = normalizedSite;
		}

		this.options = {
			timeout: 5, // Default timeout of 5 seconds
			...options
		};
		this.initPromise = null; // Store the initialization promise
	}

	/**
	 * Gets the current initialization status
	 * @returns {InitStatus} The current status: 'pending', 'success', or 'error'
	 * @example
	 * const seeker = new FeedSeeker('https://example.com');
	 * await seeker.initialize();
	 * if (seeker.getInitStatus() === 'error') {
	 *   console.error('Failed to initialize');
	 * }
	 */
	getInitStatus(): InitStatus {
		return this.initStatus;
	}

	/**
	 * Checks if initialization was successful
	 * @returns {boolean} True if initialization succeeded, false otherwise
	 * @example
	 * const seeker = new FeedSeeker('https://example.com');
	 * await seeker.initialize();
	 * if (seeker.isInitialized()) {
	 *   const feeds = await seeker.metaLinks();
	 * }
	 */
	isInitialized(): boolean {
		return this.initStatus === 'success';
	}

	/**
	 * Creates an empty document for error states
	 * This ensures all Document methods are available even when initialization fails
	 * @returns {Document} An empty but valid Document object
	 * @private
	 */
	private createEmptyDocument(): Document {
		const { document } = parseHTML('<!DOCTYPE html><html><head></head><body></body></html>');
		return document;
	}

	/**
	 * Sets the instance to an empty state (used when initialization fails)
	 * @private
	 */
	private setEmptyState(): void {
		this.content = '';
		this.document = this.createEmptyDocument();
	}

	/**
	 * Handles initialization failure by setting error state and emitting events
	 * @param {string} errorMessage - The error message to emit
	 * @param {unknown} [cause] - Optional error cause
	 * @private
	 */
	private handleInitError(errorMessage: string, cause?: unknown): void {
		this.initStatus = 'error';
		this.emit('error', {
			module: 'FeedSeeker',
			error: errorMessage,
			...(cause !== undefined && { cause })
		});
		this.setEmptyState();
		this.emit('initialized');
	}

	/**
	 * Initializes the FeedSeeker instance by validating the URL and fetching the site content and parsing the HTML
	 * This method is called automatically by other methods and caches the result
	 * Emits 'error' events if validation or fetching fails
	 * Sets initStatus to 'success' or 'error' based on the outcome
	 * @returns {Promise<void>} A promise that resolves when the initialization is complete
	 * @private
	 * @example
	 * await seeker.initialize(); // Usually called automatically
	 * if (seeker.getInitStatus() === 'error') {
	 *   console.error('Initialization failed');
	 * }
	 */
	async initialize(): Promise<void> {
		this.initPromise ??= (async () => {
			try {
				// Validate site parameter is not empty
				if (!this.rawSite || typeof this.rawSite !== 'string') {
					this.handleInitError('Site parameter must be a non-empty string');
					return;
				}

				// Validate URL format (site should already be normalized in constructor)
				try {
					new URL(this.site);
				} catch {
					this.handleInitError(`Invalid URL: ${this.site}`);
					return;
				}

				const timeout = (this.options.timeout ?? 5) * 1000;
				const response = await fetchWithTimeout(this.site, { timeout, insecure: this.options.insecure });

				if (!response.ok) {
					// For 403/401/other non-OK responses, continue with empty content
					// so blind search can still find feeds at common paths
					this.content = '';
					this.document = this.createEmptyDocument();
					this.initStatus = 'success';
					this.emit('initialized');
					return;
				}

				this.content = await response.text();
				const { document } = parseHTML(this.content);
				this.document = document;

				this.initStatus = 'success';
				this.emit('initialized');
			} catch (error: unknown) {
				const err = error instanceof Error ? error : new Error(String(error));
				const errorMessage = this.buildErrorMessage(err);
				const cause = (err as Error & { cause?: unknown }).cause;
				this.handleInitError(errorMessage, cause);
			}
		})();

		return this.initPromise;
	}

	/**
	 * Builds an error message from an error object
	 * @param {Error} err - The error to build a message from
	 * @returns {string} The formatted error message
	 * @private
	 */
	private buildErrorMessage(err: Error): string {
		let message = `Failed to fetch ${this.site}`;

		if (err.name === 'AbortError') {
			return message + ': Request timed out';
		}

		message += `: ${err.message}`;
		const cause = (err as Error & { cause?: { code?: string; message?: string } }).cause;
		if (cause) {
			message += ` (cause: ${cause.code || cause.message})`;
		}

		return message;
	}

	/**
	 * Searches for feeds using meta links in the page (link tags in head)
	 * This method looks for <link> elements with feed-related type attributes
	 * @returns {Promise<Feed[]>} A promise that resolves to an array of found feed objects
	 * @throws {Error} When initialization fails or network errors occur
	 * @example
	 * const feeds = await seeker.metaLinks();
	 * console.log(feeds); // [{ url: '...', title: '...', type: 'rss' }]
	 */
	async metaLinks(): Promise<Feed[]> {
		await this.initialize();
		return metaLinks(this);
	}

	/**
	 * Searches for feeds by checking all anchor links on the page
	 * This method analyzes all <a> elements for potential feed URLs
	 * @returns {Promise<Feed[]>} A promise that resolves to an array of found feed objects
	 * @throws {Error} When initialization fails or network errors occur
	 * @example
	 * const feeds = await seeker.checkAllAnchors();
	 * console.log(feeds); // [{ url: '...', title: '...', type: 'atom' }]
	 */
	async checkAllAnchors(): Promise<Feed[]> {
		await this.initialize();
		return checkAllAnchors(this);
	}

	/**
	 * Performs a blind search for common feed endpoints
	 * This method tries common feed paths like /feed, /rss, /atom.xml, etc.
	 * @returns {Promise<Feed[]>} A promise that resolves to an array of found feed objects
	 * @throws {Error} When network errors occur during endpoint testing
	 * @example
	 * const feeds = await seeker.blindSearch();
	 * console.log(feeds); // [{ url: '...', type: 'rss', title: '...' }]
	 */
	async blindSearch(): Promise<Feed[]> {
		await this.initialize();
		return blindSearch(this);
	}

	/**
	 * Performs a deep search by crawling the website
	 * This method recursively crawls pages to find feeds, respecting depth and link limits
	 * @returns {Promise<Feed[]>} A promise that resolves to an array of found feed objects
	 * @throws {Error} When network errors occur during crawling
	 * @example
	 * const feeds = await seeker.deepSearch();
	 * console.log(feeds); // [{ url: '...', type: 'json', title: '...' }]
	 */
	async deepSearch(): Promise<Feed[]> {
		await this.initialize();
		return deepSearch(this.site, this.options, this);
	}

	/**
	 * Starts a comprehensive feed search using multiple strategies
	 * Automatically deduplicates feeds found by multiple strategies
	 * @returns {Promise<Feed[]>} A promise that resolves to an array of unique found feed objects
	 * @example
	 * const seeker = new FeedSeeker('https://example.com', { maxFeeds: 10 });
	 * const feeds = await seeker.startSearch();
	 * console.log('All feeds:', feeds);
	 */
	async startSearch(): Promise<Feed[]> {
		// Handle single strategy modes
		const singleStrategyResult = await this.handleSingleStrategyMode();
		if (singleStrategyResult) {
			return singleStrategyResult;
		}

		// Collect feeds from multiple strategies
		const feedMap = new Map<string, Feed>();
		await this.collectFeedsFromStrategies(feedMap);
		await this.handleDeepSearch(feedMap);

		// Convert map to array and apply maxFeeds limit
		const totalFeeds = this.getFeedsWithLimit(feedMap);

		this.emit('end', { module: 'all', feeds: totalFeeds });
		return totalFeeds;
	}

	/**
	 * Handles single strategy search modes (deepsearchOnly, metasearch, blindsearch, anchorsonly)
	 * @returns {Promise<Feed[] | null>} Results if a single strategy mode is active, null otherwise
	 * @private
	 */
	private async handleSingleStrategyMode(): Promise<Feed[] | null> {
		const { deepsearchOnly, metasearch, blindsearch, anchorsonly } = this.options;

		if (deepsearchOnly) {
			return this.deepSearch();
		}

		if (metasearch) {
			return this.metaLinks();
		}

		if (blindsearch) {
			return this.blindSearch();
		}

		if (anchorsonly) {
			return this.checkAllAnchors();
		}

		return null;
	}

	/**
	 * Collects feeds from multiple search strategies
	 * @param {Map<string, Feed>} feedMap - Map to store deduplicated feeds
	 * @returns {Promise<void>}
	 * @private
	 */
	private async collectFeedsFromStrategies(feedMap: Map<string, Feed>): Promise<void> {
		const searchStrategies = [this.metaLinks, this.checkAllAnchors, this.blindSearch];

		for (const strategy of searchStrategies) {
			const feeds = await strategy.call(this);
			this.addFeedsToMap(feedMap, feeds);

			if (this.hasReachedLimit(feedMap)) {
				break;
			}
		}
	}

	/**
	 * Adds feeds to the feed map, deduplicating by URL
	 * @param {Map<string, Feed>} feedMap - Map to store feeds
	 * @param {Feed[]} feeds - Feeds to add
	 * @private
	 */
	private addFeedsToMap(feedMap: Map<string, Feed>, feeds: Feed[]): void {
		for (const feed of feeds ?? []) {
			if (!feedMap.has(feed.url)) {
				feedMap.set(feed.url, feed);
			}
		}
	}

	/**
	 * Checks if the feed limit has been reached
	 * @param {Map<string, Feed>} feedMap - Current feed map
	 * @returns {boolean} True if limit is reached, false otherwise
	 * @private
	 */
	private hasReachedLimit(feedMap: Map<string, Feed>): boolean {
		const { all, maxFeeds } = this.options;
		return !all && maxFeeds !== undefined && maxFeeds > 0 && feedMap.size >= maxFeeds;
	}

	/**
	 * Handles deep search if enabled
	 * @param {Map<string, Feed>} feedMap - Map to store feeds
	 * @private
	 */
	private async handleDeepSearch(feedMap: Map<string, Feed>): Promise<void> {
		const { deepsearch, maxFeeds } = this.options;

		if (!deepsearch || (maxFeeds && feedMap.size >= maxFeeds)) {
			return;
		}

		const deepFeeds = await this.deepSearch();

		for (const feed of deepFeeds ?? []) {
			if (!feedMap.has(feed.url)) {
				feedMap.set(feed.url, feed);
			}
			if (this.hasReachedLimit(feedMap)) {
				break;
			}
		}
	}

	/**
	 * Gets feeds from the map with limit applied
	 * @param {Map<string, Feed>} feedMap - Map containing feeds
	 * @returns {Feed[]} Feeds with limit applied
	 * @private
	 */
	private getFeedsWithLimit(feedMap: Map<string, Feed>): Feed[] {
		const feeds = Array.from(feedMap.values());
		const { maxFeeds } = this.options;

		return maxFeeds !== undefined && maxFeeds > 0 && feeds.length > maxFeeds
			? feeds.slice(0, maxFeeds)
			: feeds;
	}
}

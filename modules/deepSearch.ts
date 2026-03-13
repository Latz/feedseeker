// Deep Search - Website crawling for feed discovery

import checkFeed from './checkFeed.ts';
import { parseHTML } from 'linkedom';
import tldts from 'tldts';
import EventEmitter from './eventEmitter.ts';
import async from 'async';
import type { QueueObject } from 'async';
const { queue } = async;
import fetchWithTimeout from './fetchWithTimeout.ts';
import { type FeedSeekerInstance } from './checkFeed.ts';
import { type Feed } from './metaLinks.ts';

export const EXCLUDED_EXTENSIONS = new Set([
	'.zip',
	'.rar',
	'.7z',
	'.tar.gz',
	'.tar.bz2',
	'.tar.xz',
	'.tar',
	'.gz',
	'.bz2',
	'.xz',
	'.tgz',
	'.epub',
	'.mobi',
	'.azw',
	'.pdf',
	'.doc',
	'.docx',
	'.xls',
	'.xlsx',
	'.ppt',
	'.pptx',
	'.jpg',
	'.jpeg',
	'.png',
	'.gif',
	'.bmp',
	'.tiff',
	'.svg',
	'.mp3',
	'.mp4',
	'.avi',
	'.mov',
	'.wmv',
	'.mpg',
	'.mpeg',
	'.flv',
	'.mkv',
	'.webm',
	'.ogg',
	'.ogv',
	'.ogx',
]);

/**
 * Checks if a URL points to a file with an excluded extension.
 * Used to avoid downloading large binary files during link crawling.
 *
 * @param {string} url - The URL to check
 * @returns {boolean} True if the URL ends with an excluded extension, false otherwise
 */
function excludedFile(url: string): boolean {
	const lastDot = url.lastIndexOf('.');
	return lastDot !== -1 && EXCLUDED_EXTENSIONS.has(url.slice(lastDot).toLowerCase());
}

/**
 * Task object for the crawler queue
 */
interface CrawlTask {
	url: string;
	depth: number;
}

/**
 * Deep search options
 */
export interface DeepSearchOptions {
	depth?: number;
	maxLinks?: number;
	checkForeignFeeds?: boolean;
	maxErrors?: number;
	maxFeeds?: number;
	timeout?: number;
	insecure?: boolean;
}

/**
 * Constructor options for Crawler (consolidates the 8 parameters to stay within S107 limit)
 */
interface CrawlerOptions {
	maxDepth?: number;
	concurrency?: number;
	maxLinks?: number;
	checkForeignFeeds?: boolean;
	maxErrors?: number;
	maxFeeds?: number;
	instance?: FeedSeekerInstance | null;
	insecure?: boolean;
}

/**
 * Crawler class for deep website crawling
 */
class Crawler extends EventEmitter {
	startUrl: string;
	maxDepth: number;
	concurrency: number;
	maxLinks: number;
	mainDomain: string | null;
	checkForeignFeeds: boolean;
	maxErrors: number;
	maxFeeds: number;
	errorCount: number;
	instance: FeedSeekerInstance | null;
	queue: QueueObject<CrawlTask>;
	visitedUrls: Set<string>;
	timeout: number;
	insecure: boolean;
	maxLinksReachedMessageEmitted: boolean;
	feeds: Feed[];

	constructor(startUrl: string, options: CrawlerOptions = {}) {
		const {
			maxDepth = 3,
			concurrency = 5,
			maxLinks = 1000,
			checkForeignFeeds = false,
			maxErrors = 5,
			maxFeeds = 0,
			instance = null,
			insecure = false,
		} = options;
		super();
		try {
			const absoluteStartUrl = new URL(startUrl);
			this.startUrl = absoluteStartUrl.href;
		} catch {
			throw new Error(`Invalid start URL: ${startUrl}`);
		}
		this.maxDepth = maxDepth;
		this.concurrency = concurrency;
		this.maxLinks = maxLinks; // Maximum number of links to process
		this.mainDomain = tldts.getDomain(this.startUrl);
		this.checkForeignFeeds = checkForeignFeeds; // Whether to check external domains for feeds
		this.maxErrors = maxErrors; // Maximum number of errors before stopping
		this.maxFeeds = maxFeeds; // Maximum number of feeds to find before stopping
		this.errorCount = 0; // Current error count
		this.instance = instance; // Store the FeedSeeker instance
		// Initialize async queue with concurrency control
		// The queue processes crawlPage tasks with limited concurrency to prevent overwhelming the target server
		// bind(this) ensures 'this' context is preserved when crawlPage is called by the queue
		this.queue = queue(this.crawlPage.bind(this), this.concurrency);
		this.visitedUrls = new Set(); // Track visited URLs to prevent infinite loops
		this.timeout = 5000; // Default timeout value for HTTP requests
		this.insecure = insecure;
		this.maxLinksReachedMessageEmitted = false; // Flag to track if message was emitted

		this.feeds = []; // Array to store discovered feeds

		// Error handling strategy: Implement circuit breaker pattern
		// Stop crawling after maxErrors to prevent endless error loops on problematic sites
		this.queue.error((err: Error) => {
			this.emit('error', {
				module: 'deepSearch',
				error: `Async error: ${err}`,
				explanation:
					'An error occurred in the async queue while processing a crawling task. This could be due to network issues, invalid URLs, or server problems.',
				suggestion:
					'Check network connectivity and ensure the target website is accessible. The crawler will continue with other URLs.',
			});
			this.incrementError();
		});
	}

	/**
	 * Increments the error counter and kills the queue if the limit is reached.
	 * @returns {boolean} True if the error limit has been reached, false otherwise.
	 * @private
	 */
	private incrementError(): boolean {
		if (this.errorCount >= this.maxErrors) return true;
		this.errorCount++;
		if (this.errorCount >= this.maxErrors) {
			this.queue.kill();
			this.emit('log', {
				module: 'deepSearch',
				message: `Stopped due to ${this.errorCount} errors (max ${this.maxErrors} allowed).`,
			});
			return true;
		}
		return false;
	}

	/**
	 * Starts the crawling process
	 */
	start(): void {
		this.queue.push({ url: this.startUrl, depth: 0 });
		this.emit('start', { module: 'deepSearch', niceName: 'Deep Search' });
	}

	/**
	 * Checks if a URL is valid (same domain, not excluded file type)
	 * @param {string} url - The URL to validate
	 * @returns {boolean} True if the URL is valid, false otherwise
	 */
	isValidUrl(url: string): boolean {
		try {
			// Domain comparison using tldts.getDomain() to extract the registrable domain
			// Example: both "blog.example.com" and "www.example.com" return "example.com"
			// This allows crawling subdomains of the same site while blocking external domains
			const sameDomain = tldts.getDomain(url) === this.mainDomain;

			// File type filtering prevents downloading large binary files (images, videos, archives)
			// See excludedFile() function for the complete list of blocked extensions
			const notExcludedFile = !excludedFile(url);

			return sameDomain && notExcludedFile;
		} catch {
			// URL parsing can fail for malformed URLs - handle gracefully
			this.emit('error', {
				module: 'deepSearch',
				error: `Invalid URL: ${url}`,
				explanation:
					'A URL encountered during crawling could not be parsed or validated. This may be due to malformed URL syntax or unsupported URL schemes.',
				suggestion:
					'This is usually caused by broken links on the website. The crawler will skip this URL and continue with others.',
			});
			this.incrementError();
			return false;
		}
	}

	/**
	 * Emits the max links reached message and sets the flag to avoid duplicate messages.
	 * @private
	 */
	private emitMaxLinksReached(): void {
		if (!this.maxLinksReachedMessageEmitted) {
			this.emit('log', {
				module: 'deepSearch',
				message: `Max links limit of ${this.maxLinks} reached. Stopping deep search.`,
			});
			this.maxLinksReachedMessageEmitted = true;
		}
	}

	/**
	 * Handles pre-crawl checks and validations for a given URL.
	 * @param {string} url - The URL to check.
	 * @param {number} depth - The current crawl depth.
	 * @returns {boolean} True if the crawl should continue, false otherwise.
	 * @private
	 */
	shouldCrawl(url: string, depth: number): boolean {
		if (depth > this.maxDepth) return false;
		if (this.visitedUrls.has(url)) return false;

		if (this.visitedUrls.size >= this.maxLinks) {
			this.emitMaxLinksReached();
			return false;
		}

		return this.isValidUrl(url);
	}

	/**
	 * Handles fetch errors and increments the error counter.
	 * @param {string} url - The URL that failed to fetch.
	 * @param {number} depth - The crawl depth at which the error occurred.
	 * @param {string} error - The error message.
	 * @returns {boolean} True if the crawl should stop, false otherwise.
	 * @private
	 */
	handleFetchError(url: string, depth: number, error: string): boolean {
		this.emit('log', { module: 'deepSearch', url, depth, error });
		return this.incrementError();
	}

	/**
	 * Processes a single link found on a page, checking if it's a feed.
	 * @param {string} url - The absolute URL of the link to process.
	 * @param {number} depth - The current crawl depth.
	 * @returns {Promise<boolean>} True if the crawl should stop, false otherwise.
	 * @private
	 */
	/**
	 * Records a found feed and returns true if the max feeds limit has been reached.
	 */
	private recordFeed(url: string, depth: number, feedResult: { type: 'rss' | 'atom' | 'json'; title: string | null }): boolean {
		if (this.feeds.some(feed => feed.url === url)) return false;
		this.feeds.push({ url, type: feedResult.type, title: feedResult.title, feedTitle: feedResult.title });
		this.emit('log', { module: 'deepSearch', url, depth: depth + 1, feedCheck: { isFeed: true, type: feedResult.type } });
		if (this.maxFeeds > 0 && this.feeds.length >= this.maxFeeds) {
			this.queue.kill();
			this.emit('log', {
				module: 'deepSearch',
				message: `Stopped due to reaching maximum feeds limit: ${this.feeds.length} feeds found (max ${this.maxFeeds} allowed).`,
			});
			return true;
		}
		return false;
	}

	async processLink(url: string, depth: number): Promise<boolean> {
		if (this.visitedUrls.has(url)) return false;

		if (this.visitedUrls.size >= this.maxLinks) {
			this.emitMaxLinksReached();
			return true;
		}

		const validUrl = this.isValidUrl(url);
		if (!validUrl && !this.checkForeignFeeds) return false;

		this.emit('log', {
			module: 'deepSearch',
			url,
			depth,
			progress: { processed: this.visitedUrls.size, remaining: this.queue.length() },
		});

		try {
			const feedResult = await checkFeed(url, '', this.instance || undefined);
			if (feedResult) {
				if (this.recordFeed(url, depth, feedResult)) return true;
			} else {
				this.emit('log', { module: 'deepSearch', url, depth: depth + 1, feedCheck: { isFeed: false } });
			}
		} catch (error: unknown) {
			const err = error instanceof Error ? error : new Error(String(error));
			return this.handleFetchError(url, depth + 1, `Error checking feed: ${err.message}`);
		}

		if (depth + 1 <= this.maxDepth && validUrl) {
			this.queue.push({ url, depth: depth + 1 });
		}
		return false;
	}

	/**
	 * Crawls a single page, extracting links and checking for feeds
	 * @param {CrawlTask} task - The task object containing the URL and depth
	 * @returns {Promise<void>} A promise that resolves when the page has been crawled
	 */
	async crawlPage(task: CrawlTask): Promise<void> {
		let { url, depth } = task;

		if (!this.shouldCrawl(url, depth)) return;

		this.visitedUrls.add(url);

		const response = await fetchWithTimeout(url, { timeout: this.timeout, insecure: this.insecure });
		if (!response) {
			this.handleFetchError(url, depth, 'Failed to fetch URL - timeout or network error');
			return;
		}
		if (!response.ok) {
			this.handleFetchError(url, depth, `HTTP ${response.status} ${response.statusText}`);
			return;
		}

		const html = await response.text();
		const { document } = parseHTML(html);

		const links: string[] = [];
		for (const link of document.querySelectorAll('a')) {
			try {
				links.push(new URL(link.href, this.startUrl).href);
			} catch {
				// Skip malformed URLs
			}
		}

		await Promise.allSettled(links.map(url => this.processLink(url, depth)));
	}
}

/**
 * Performs a deep search for feeds by crawling a website
 * @param {string} url - The starting URL to crawl
 * @param {DeepSearchOptions} options - Search options
 * @param {FeedSeekerInstance | null} instance - The FeedSeeker instance
 * @returns {Promise<Feed[]>} Array of found feeds
 */
export default async function deepSearch(
	url: string,
	options: DeepSearchOptions = {},
	instance: FeedSeekerInstance | null = null
): Promise<Feed[]> {
	const crawler = new Crawler(url, {
		maxDepth: options.depth || 3,
		maxLinks: options.maxLinks || 1000,
		checkForeignFeeds: !!options.checkForeignFeeds,
		maxErrors: options.maxErrors || 5,
		maxFeeds: options.maxFeeds || 0,
		instance,
		insecure: !!options.insecure,
	});
	crawler.timeout = (options.timeout || 5) * 1000; // Convert seconds to milliseconds

	// If we have an instance, forward crawler events to the instance
	if (instance?.emit) {
		crawler.on('start', data => instance.emit!('start', data));
		crawler.on('log', data => instance.emit!('log', data));
		crawler.on('error', data => instance.emit!('error', data));
		crawler.on('end', data => instance.emit!('end', data));
	}

	crawler.start();
	// Create a promise that resolves when the queue is drained
	await new Promise<void>(resolve => {
		crawler.queue.drain(() => {
			crawler.emit('end', { module: 'deepSearch', feeds: crawler.feeds, visitedUrls: crawler.visitedUrls.size });
			resolve();
		});
	});
	return crawler.feeds;
}

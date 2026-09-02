/**
 * Type definitions for feed check results
 */
export interface FeedResult {
	type: 'rss' | 'atom' | 'json';
	title: string | null;
	/**
	 * The URL the response actually resolved to after following redirects.
	 * Only set when checkFeed performed the fetch itself (content wasn't
	 * pre-supplied by the caller) — lets callers that probe many candidate
	 * URLs (e.g. blind search) recognize that two different candidates
	 * redirected to, and found, the same underlying feed.
	 */
	resolvedUrl?: string;
}

interface FeedSeekerOptions {
	timeout?: number;
	maxFeeds?: number;
	showErrors?: boolean;
	verbose?: boolean;
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
	site?: string;
	content?: string;
}

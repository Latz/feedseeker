# Feed Seeker API - Technical Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Core API](#core-api)
4. [Search Modules](#search-modules)
5. [Event System](#event-system)
6. [Feed Detection](#feed-detection)
7. [Options Configuration](#options-configuration)
8. [Error Handling](#error-handling)
9. [Performance Considerations](#performance-considerations)
10. [Integration Examples](#integration-examples)

## Overview

Feed Seeker is a comprehensive Node.js library for discovering RSS, Atom, and JSON feeds on websites. It employs multiple search strategies and provides a robust event-driven API for real-time feedback during the discovery process.

### Key Features

- **Multi-Strategy Discovery**: Meta links, anchor analysis, blind search, and deep crawling
- **Feed Format Support**: RSS 2.0, Atom 1.0, JSON Feed 1.0/1.1
- **Event-Driven Architecture**: Real-time progress updates and error handling
- **Configurable Options**: Timeout, concurrency, depth limits, and more
- **Domain Filtering**: Security controls for external domain access
- **Performance Optimized**: Concurrent processing and circuit breaker patterns

## Architecture

### Core Components

```
FeedSeeker (Main Class)
├── EventEmitter (Base Class)
├── Search Modules
│   ├── metaLinks.js      - HTML meta tag analysis
│   ├── anchors.js        - Anchor link analysis
│   ├── blindsearch.js    - Common endpoint testing
│   └── deepSearch.js     - Website crawling
├── Utilities
│   ├── checkFeed.js      - Feed validation
│   ├── fetchWithTimeout.js - HTTP client
│   └── eventEmitter.js   - Event system
└── CLI Interface
    └── feed-seeker-cli.js - Command-line tool
```

### Data Flow

1. **Initialization**: Fetch and parse target website HTML
2. **Strategy Execution**: Run selected search strategies
3. **Feed Validation**: Verify discovered URLs are actual feeds
4. **Event Emission**: Provide real-time progress updates
5. **Result Aggregation**: Collect and deduplicate findings

## Core API

### FeedSeeker Class

The main class that orchestrates feed discovery operations.

#### Constructor

```javascript
new FeedSeeker(site, options);
```

**Parameters:**

- `site` (string): Target website URL
- `options` (object, optional): Configuration options

**URL Normalization:**

- Automatically adds `https://` if no protocol specified
- Normalizes URL using native URL constructor
- Validates URL format and accessibility

#### Properties

- `site` (string): Normalized target URL
- `options` (object): Configuration options
- `content` (string): Fetched HTML content
- `document` (object): Parsed DOM document
- `initPromise` (Promise): Initialization state tracker

#### Methods

##### `initialize()`

Fetches and parses the target website content.

```javascript
await feedScout.initialize();
```

**Returns:** `Promise<void>`

**Behavior:**

- Implements singleton pattern (only initializes once)
- Fetches HTML content with timeout
- Parses HTML using linkedom
- Emits `initialized` event on completion
- Handles errors gracefully with fallback empty document

##### `metaLinks()`

Searches for feeds in HTML meta tags.

```javascript
const feeds = await feedScout.metaLinks();
```

**Returns:** `Promise<Array<FeedObject>>`

**Process:**

1. Scans `<link>` tags with feed-related `type` attributes
2. Checks `rel="alternate"` links with feed patterns
3. Validates discovered URLs using `checkFeed()`
4. Respects `maxFeeds` limit if configured

##### `checkAllAnchors()`

Analyzes anchor links for potential feeds.

```javascript
const feeds = await feedScout.checkAllAnchors();
```

**Returns:** `Promise<Array<FeedObject>>`

**Process:**

1. Handles meta refresh redirects
2. Filters anchors by domain allowlist
3. Tests anchor URLs for feed content
4. Processes same-domain and whitelisted external domains

##### `blindSearch()`

Tests common feed endpoint patterns.

```javascript
const feeds = await feedScout.blindSearch();
```

**Returns:** `Promise<Array<FeedObject>>`

**Process:**

1. Generates 320+ potential feed URLs
2. Tests endpoints from specific to general paths
3. Implements early termination when feeds found
4. Supports query parameter preservation

##### `deepSearch()`

Performs website crawling to discover feeds.

```javascript
const feeds = await feedScout.deepSearch();
```

**Returns:** `Promise<Array<FeedObject>>`

**Process:**

1. Crawls website following internal links
2. Implements circuit breaker for error handling
3. Uses async queue for concurrency control
4. Respects depth and link limits

## Search Modules

### Meta Links Module (`metaLinks.js`)

Analyzes HTML `<link>` tags for feed references.

#### Supported Feed Types

```javascript
const feedTypes = [
	'feed+json', // JSON Feed
	'rss+xml', // RSS feeds
	'atom+xml', // Atom feeds
	'xml', // Generic XML feeds
	'rdf+xml' // RDF feeds
];
```

#### Link Patterns

1. **Explicit Type Links**: `<link type="application/rss+xml" href="/feed">`
2. **Alternate Links**: `<link rel="alternate" type="application/atom+xml">`
3. **Pattern-Based**: Links with `/rss`, `/feed`, `.xml` in href

#### Events Emitted

- `start`: Module initialization
- `log`: Progress updates with feed type being checked
- `error`: Feed validation failures
- `end`: Module completion with results

### Anchors Module (`anchors.js`)

Examines anchor tags for feed links.

#### Domain Filtering

```javascript
const allowedDomains = [
	// Major news organizations
	'feeds.feedburner.com',
	'rss.cnn.com',
	'feeds.bbci.co.uk',
	// Podcast platforms
	'feeds.spotify.com',
	'podcasts.apple.com',
	// Social platforms
	'rss.twitter.com',
	'www.youtube.com'
	// ... 70+ more domains
];
```

#### Meta Refresh Handling

Automatically follows HTML meta refresh redirects:

```html
<meta http-equiv="refresh" content="0;url=https://newsite.com" />
```

#### URL Processing

1. **Relative URL Resolution**: Converts relative paths to absolute URLs
2. **Domain Validation**: Checks against allowlist
3. **Feed Verification**: Validates content before inclusion

### Blind Search Module (`blindsearch.js`)

Tests common feed endpoint patterns systematically.

#### Endpoint Categories

1. **Standard Paths** (28 endpoints)
   - `feed`, `rss`, `atom`, `feeds/`, etc.

2. **Platform-Specific** (45 endpoints)
   - WordPress: `?feed=rss2`, `wp-rss.php`
   - Blog platforms: `blog/feed`, `weblog/rss`

3. **Content-Specific** (67 endpoints)
   - News: `news/rss`, `articles/feed`
   - Podcasts: `podcast/rss`, `episodes.rss`
   - E-commerce: `products/rss`, `deals.xml`

4. **Modern Platforms** (89 endpoints)
   - Static sites: `_site/feed.xml`, `public/feed.xml`
   - CMS: `strapi/feed`, `contentful/feed`
   - Multi-language: `en/feed`, `es/feed`

5. **Query Parameters** (19 endpoints)
   - `?rss=1`, `?format=feed`, `?type=atom`

#### Path Traversal Algorithm

```javascript
// Example: https://example.com/blog/posts/article
// Tests in order:
// 1. https://example.com/blog/posts/article/feed
// 2. https://example.com/blog/posts/feed
// 3. https://example.com/blog/feed
// 4. https://example.com/feed
```

#### Early Termination Logic

- **Default**: Stops when both RSS and Atom feeds found
- **All Mode**: Continues until all endpoints tested
- **Max Feeds**: Stops when limit reached

### Deep Search Module (`deepSearch.js`)

Implements website crawling with advanced patterns.

#### Crawler Architecture

```javascript
class Crawler extends EventEmitter {
  constructor(startUrl, maxDepth, concurrency, maxLinks,
              checkForeignFeeds, maxErrors, maxFeeds)
}
```

#### Concurrency Control

Uses `async.queue` for controlled parallel processing:

```javascript
this.queue = async.queue(this.processUrl.bind(this), concurrency);
```

#### Circuit Breaker Pattern

Implements error threshold to prevent infinite failures:

```javascript
if (this.errorCount >= this.maxErrors) {
	this.queue.kill(); // Stop processing
	this.emit('log', { message: 'Stopped due to errors' });
}
```

#### URL Validation

```javascript
isValidUrl(url) {
  // 1. Same domain check using tldts
  // 2. File extension filtering
  // 3. Error counting and circuit breaking
}
```

## Event System

### EventEmitter Implementation

Custom EventEmitter with enhanced error handling:

```javascript
class EventEmitter {
	#events = new Map(); // Private field for performance

	on(event, listener) {
		/* Add listener */
	}
	once(event, listener) {
		/* One-time listener */
	}
	emit(event, ...args) {
		/* Emit with error handling */
	}
	off(event, listener) {
		/* Remove listener */
	}
	removeAllListeners(event) {
		/* Cleanup */
	}
}
```

### Event Types

#### Core Events

- **`initialized`**: Website content fetched and parsed
- **`start`**: Search module begins execution
- **`log`**: Progress updates and status information
- **`end`**: Search module completes with results
- **`error`**: Error occurred with detailed context

#### Event Data Structures

```javascript
// Start Event
{
  module: 'blindsearch',
  niceName: 'Blind search'
}

// Log Event
{
  module: 'blindsearch',
  totalCount: 320,
  foundFeedsCount: 2,
  message: 'Custom status message'
}

// End Event
{
  module: 'blindsearch',
  feeds: [/* FeedObject array */]
}

// Error Event
{
  module: 'anchors',
  error: 'HTTP 403 Forbidden',
  explanation: 'Server refusing access...',
  suggestion: 'Try accessing URL in browser...'
}
```

## Feed Detection

### Feed Validation (`checkFeed.js`)

Comprehensive feed format detection and validation.

#### Supported Formats

##### RSS 2.0 Detection

```javascript
function checkRss(content) {
	// 1. Check for <rss version="2.0"> root element
	// 2. Verify <channel> container exists
	// 3. Ensure <description> element present
	// 4. Validate structure with <item> elements
	// 5. Extract and clean feed title
}
```

##### Atom 1.0 Detection

```javascript
function checkAtom(content) {
	// 1. Check for <feed> root with Atom namespace
	// 2. Verify namespace declarations
	// 3. Ensure <entry> elements exist
	// 4. Validate <title> element present
	// 5. Extract and clean feed title
}
```

##### JSON Feed Detection

```javascript
function checkJson(content) {
	// 1. Parse JSON content safely
	// 2. Check for version with 'jsonfeed' identifier
	// 3. Verify 'items' array exists
	// 4. Filter out oEmbed responses
	// 5. Extract title from multiple possible fields
}
```

#### oEmbed Filtering

Prevents false positives from oEmbed endpoints:

```javascript
// URL pattern filtering
if (url.includes('/wp-json/oembed/') || url.includes('/oembed')) {
	return null;
}

// Content-based filtering
if (json.type && ['rich', 'video', 'photo', 'link'].includes(json.type)) {
	return null;
}
```

### Feed Object Structure

```javascript
{
  url: 'https://example.com/feed.xml',     // Feed URL
  title: 'Site Title',                     // Link title attribute
  type: 'rss',                            // Feed format: 'rss', 'atom', 'json'
  feedTitle: 'Actual Feed Title'          // Title from feed content
}
```

## Options Configuration

### Complete Options Object

```javascript
const options = {
	// Timeouts and limits
	timeout: 5, // Request timeout in seconds (default: 5)
	maxFeeds: 0, // Maximum feeds to find (0 = unlimited)
	maxLinks: 1000, // Max links for deep search (default: 1000)
	maxErrors: 5, // Error threshold for circuit breaker (default: 5)

	// Deep search configuration
	depth: 3, // Crawling depth (default: 3)
	deepsearch: false, // Enable deep search (default: false)
	checkForeignFeeds: false, // Check external domains (default: false)

	// URL handling
	keepQueryParams: false, // Preserve query parameters (default: false)

	// Search strategy selection
	metasearch: false, // Meta search only
	blindsearch: false, // Blind search only
	anchorsonly: false, // Anchors search only
	all: false, // Find all feeds (no early termination)

	// Debug and development
	showErrors: false, // Show blind search errors (default: false)
	verbose: 0 // Verbosity level (CLI only)
};
```

### Option Interactions

#### Search Strategy Priority

1. **Exclusive modes**: `metasearch`, `blindsearch`, `anchorsonly`
2. **Standard mode**: Meta → Anchors → Blind → Deep (if enabled)
3. **All mode**: Continues all strategies regardless of findings

#### Performance Tuning

```javascript
// High performance (fast but less thorough)
const fastOptions = {
	timeout: 3,
	maxFeeds: 1,
	depth: 1,
	maxLinks: 100
};

// Comprehensive (slower but thorough)
const thoroughOptions = {
	timeout: 10,
	maxFeeds: 0,
	depth: 5,
	maxLinks: 5000,
	deepsearch: true,
	checkForeignFeeds: true
};
```

## Error Handling

### Error Categories

#### Network Errors

- **Timeout**: Request exceeds configured timeout
- **Connection**: Network connectivity issues
- **HTTP Status**: 4xx/5xx response codes
- **DNS**: Domain resolution failures

#### Content Errors

- **Parse Errors**: Invalid HTML/XML/JSON content
- **Encoding**: Character encoding issues
- **Malformed**: Incomplete or corrupted feeds

#### Configuration Errors

- **Invalid URL**: Malformed target URLs
- **Option Conflicts**: Incompatible option combinations
- **Resource Limits**: Exceeded system constraints

### Error Event Structure

```javascript
{
  module: 'deepSearch',
  error: 'HTTP 403 Forbidden',
  explanation: 'The server is refusing access to the requested resource...',
  suggestion: 'Try accessing the URL in a browser to verify it works...'
}
```

### Error Recovery Strategies

#### Circuit Breaker Pattern

```javascript
if (this.errorCount >= this.maxErrors) {
	this.queue.kill();
	this.emit('log', {
		message: `Stopped due to ${this.errorCount} errors`
	});
}
```

#### Graceful Degradation

- Continue processing other URLs when individual requests fail
- Provide empty fallbacks for failed initializations
- Maintain partial results when errors occur

## Performance Considerations

### Concurrency Management

#### Async Queue Implementation

```javascript
// Deep search uses controlled concurrency
this.queue = async.queue(this.processUrl.bind(this), 5);

// Error handling prevents queue overflow
this.queue.error((err, task) => {
	this.errorCount++;
	if (this.errorCount >= this.maxErrors) {
		this.queue.kill();
	}
});
```

#### Request Batching

Blind search processes endpoints sequentially to avoid overwhelming servers:

```javascript
for (let i = 0; i < endpointUrls.length; i++) {
	const result = await processSingleFeedUrl(endpointUrls[i]);
	// Process one at a time with early termination
}
```

### Memory Optimization

#### Single-Pass Processing

```javascript
// Efficient anchor filtering (single pass)
const filteredAnchors = allAnchors.filter((anchor) => {
	const urlToCheck = getUrlFromAnchor(anchor, baseUrl, instance);
	return urlToCheck && isAllowedDomain(urlToCheck, baseUrl);
});
```

#### Duplicate Prevention

```javascript
// Use Set for O(1) duplicate checking
const foundUrls = new Set();
if (!foundUrls.has(url)) {
	foundUrls.add(url);
	// Process new URL
}
```

### Timeout Configuration

#### Adaptive Timeouts

```javascript
// Default timeout with fallback
const timeout = options.timeout ? options.timeout * 1000 : 5000;

// Per-request timeout with abort controller
const controller = new AbortController();
setTimeout(() => controller.abort(), timeout);
```

## Integration Examples

### Basic Usage

```javascript
import FeedSeeker from 'feed-seeker';

const feedScout = new FeedSeeker('https://example.com');

// Event listeners
feedScout.on('initialized', () => {
	console.log('Website loaded and parsed');
});

feedScout.on('start', (data) => {
	console.log(`Starting ${data.niceName}`);
});

feedScout.on('log', (data) => {
	if (data.totalCount) {
		console.log(`Checking ${data.totalCount} items`);
	}
});

feedScout.on('end', (data) => {
	console.log(`Found ${data.feeds.length} feeds`);
	data.feeds.forEach((feed) => {
		console.log(`- ${feed.url} (${feed.type})`);
	});
});

feedScout.on('error', (data) => {
	console.error(`Error in ${data.module}: ${data.error}`);
	if (data.explanation) {
		console.error(`Explanation: ${data.explanation}`);
	}
});

// Execute search
const feeds = await feedScout.metaLinks();
```

### Advanced Configuration

```javascript
const options = {
	timeout: 10,
	maxFeeds: 5,
	deepsearch: true,
	depth: 3,
	maxLinks: 500,
	checkForeignFeeds: true,
	keepQueryParams: true
};

const feedScout = new FeedSeeker('https://news-site.com', options);

// Comprehensive search
const allFeeds = [];

// Meta search
allFeeds.push(...(await feedScout.metaLinks()));

// Anchor search
allFeeds.push(...(await feedScout.checkAllAnchors()));

// Blind search
allFeeds.push(...(await feedScout.blindSearch()));

// Deep search (if enabled)
if (options.deepsearch) {
	allFeeds.push(...(await feedScout.deepSearch()));
}

// Deduplicate results
const uniqueFeeds = allFeeds.filter(
	(feed, index, self) => index === self.findIndex((f) => f.url === feed.url)
);

console.log(`Total unique feeds found: ${uniqueFeeds.length}`);
```

### Error Handling Integration

```javascript
const feedScout = new FeedSeeker('https://problematic-site.com');

let errorCount = 0;
const maxErrors = 3;

feedScout.on('error', (data) => {
	errorCount++;

	console.error(`Error ${errorCount}/${maxErrors}: ${data.error}`);

	if (data.explanation) {
		console.error(`Cause: ${data.explanation}`);
	}

	if (data.suggestion) {
		console.error(`Solution: ${data.suggestion}`);
	}

	if (errorCount >= maxErrors) {
		console.error('Too many errors, stopping search');
		process.exit(1);
	}
});

try {
	const feeds = await feedScout.blindSearch();
	console.log(`Successfully found ${feeds.length} feeds despite errors`);
} catch (error) {
	console.error('Fatal error:', error.message);
}
```

### Custom Module Usage

```javascript
// Import individual modules
import metaLinks from 'feed-seeker/metaLinks';
import checkFeed from 'feed-seeker/checkFeed';

// Create minimal instance
const instance = {
  site: 'https://example.com',
  document: /* parsed HTML document */,
  options: { maxFeeds: 3 },
  emit: (event, data) => console.log(event, data)
};

// Use module directly
const feeds = await metaLinks(instance);

// Validate individual URLs
const isValidFeed = await checkFeed('https://example.com/feed.xml');
if (isValidFeed) {
  console.log(`Valid ${isValidFeed.type} feed: ${isValidFeed.title}`);
}
```

## HTTP Client Implementation

### fetchWithTimeout Module

Custom HTTP client with timeout and error handling:

```javascript
async function fetchWithTimeout(url, timeout = 5000) {
	const controller = new AbortController();
	const signal = controller.signal;

	// Set timeout
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	// Custom headers for better compatibility
	const headers = {
		'User-Agent': 'Feed-Scout/1.0 (+https://github.com/user/feed-seeker)',
		Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
		'Accept-Language': 'en-US,en;q=0.5',
		'Accept-Encoding': 'gzip, deflate',
		'Cache-Control': 'no-cache',
		Pragma: 'no-cache'
	};

	try {
		const response = await fetch(url, { signal, headers });
		clearTimeout(timeoutId);
		return response;
	} catch (error) {
		clearTimeout(timeoutId);
		return null; // Graceful failure
	}
}
```

### Request Headers Strategy

- **User-Agent**: Identifies as Feed Seeker to avoid bot blocking
- **Accept**: Prioritizes HTML/XML content types
- **Cache-Control**: Ensures fresh content retrieval
- **Accept-Encoding**: Supports compression for efficiency

## URL Processing and Validation

### URL Normalization Pipeline

```javascript
// 1. Protocol Addition
if (!site.includes('://')) {
	site = `https://${site}`;
}

// 2. URL Constructor Normalization
this.site = new URL(site).href;

// 3. Relative URL Resolution
const fullHref = new URL(link.href, instance.site).href;

// 4. Domain Extraction
const domain = tldts.getDomain(url);
```

### Domain Security Model

#### Same-Domain Policy

```javascript
function isAllowedDomain(url, baseUrl) {
	const urlDomain = tldts.getDomain(url);
	const baseDomain = tldts.getDomain(baseUrl.href);

	// Allow same domain
	if (urlDomain === baseDomain) return true;

	// Check whitelist
	return allowedDomains.includes(urlDomain);
}
```

#### External Domain Whitelist

Curated list of 70+ trusted feed hosting domains:

```javascript
const allowedDomains = [
	// News Organizations
	'feeds.feedburner.com',
	'rss.cnn.com',
	'feeds.bbci.co.uk',
	'rss.nytimes.com',
	'feeds.reuters.com',
	'feeds.washingtonpost.com',

	// Podcast Platforms
	'feeds.spotify.com',
	'podcasts.apple.com',
	'feeds.soundcloud.com',
	'anchor.fm',
	'feeds.buzzsprout.com',
	'feeds.libsyn.com',

	// Social Media
	'rss.twitter.com',
	'www.youtube.com',
	'feeds.feedburner.com',

	// Blog Platforms
	'feeds.wordpress.com',
	'medium.com',
	'substack.com',

	// Technology
	'feeds.github.com',
	'stackoverflow.com',
	'dev.to'
];
```

## Feed Content Analysis

### Content Type Detection

```javascript
// MIME type analysis
const contentType = response.headers.get('content-type');
if (contentType) {
	if (contentType.includes('application/rss+xml')) return 'rss';
	if (contentType.includes('application/atom+xml')) return 'atom';
	if (contentType.includes('application/json')) return 'json';
}

// Content-based detection (fallback)
const result = checkRss(content) || checkAtom(content) || checkJson(content);
```

### RSS Feed Validation

```javascript
function checkRss(content) {
	// 1. Root element validation
	const rssVersionRegex = /<rss[^>]*\s+version\s*=\s*["'][\d.]+["'][^>]*>/i;
	if (!rssVersionRegex.test(content)) return null;

	// 2. Required structure validation
	const hasChannel = /<channel[^>]*>/i.test(content);
	const hasDescription = /<description[^>]*>/i.test(content);
	const hasItem = /<item[^>]*>/i.test(content);

	// 3. Structural integrity check
	if (hasChannel && hasDescription && (hasItem || /<\/channel>/i.test(content))) {
		return { type: 'rss', title: extractRssTitle(content) };
	}

	return null;
}
```

### Atom Feed Validation

```javascript
function checkAtom(content) {
	// 1. Root element with namespace
	const feedStartRegex = /<feed(?:\s+[^>]*)?>/i;
	const hasAtomNamespace =
		/<feed[^>]*xmlns[^=]*[^>]*atom/i.test(content) || /<feed[^>]*xmlns:atom/i.test(content);

	if (!feedStartRegex.test(content) || !hasAtomNamespace) return null;

	// 2. Required elements
	const hasEntry = /<entry[^>]*>/i.test(content);
	const hasTitle = /<title[^>]*>/i.test(content);

	if (hasEntry && hasTitle) {
		const titleMatch = /<title>([\s\S]*?)<\/title>/i.exec(content);
		const title = titleMatch ? cleanTitle(removeCDATA(titleMatch[1])) : null;
		return { type: 'atom', title };
	}

	return null;
}
```

### JSON Feed Validation

```javascript
function checkJson(content) {
	try {
		const json = JSON.parse(content);

		// 1. oEmbed exclusion
		if (json.type && ['rich', 'video', 'photo', 'link'].includes(json.type)) {
			return null;
		}

		// 2. JSON Feed identification
		const isJsonFeed =
			(json.version && json.version.includes('jsonfeed')) ||
			(json.items && Array.isArray(json.items)) ||
			json.feed_url;

		if (isJsonFeed) {
			return {
				type: 'json',
				title: cleanTitle(json.title || json.name)
			};
		}
	} catch (e) {
		return null;
	}

	return null;
}
```

## Advanced Search Algorithms

### Path Traversal Strategy

The blind search implements intelligent path traversal:

```javascript
function generateEndpointUrls(siteUrl, keepQueryParams) {
	const url = new URL(siteUrl);
	const endpointUrls = [];

	// Extract and preserve query parameters if requested
	const queryParams = keepQueryParams ? url.search : '';

	// Start from current path and traverse upward
	let path = url.pathname;

	while (path !== '/') {
		// Normalize path (remove trailing slash)
		const basePath = path.endsWith('/') ? path.slice(0, -1) : path;

		// Test all endpoints at this level
		FEED_ENDPOINTS.forEach((endpoint) => {
			const urlWithParams = queryParams
				? `${basePath}/${endpoint}${queryParams}`
				: `${basePath}/${endpoint}`;
			endpointUrls.push(urlWithParams);
		});

		// Move up one directory level
		path = path.slice(0, path.lastIndexOf('/'));
	}

	return endpointUrls;
}
```

### Early Termination Logic

```javascript
function shouldContinueSearch(currentIndex, totalUrls, rssFound, atomFound, shouldCheckAll) {
	// Always continue if we haven't processed all URLs
	if (currentIndex >= totalUrls) return false;

	// If checking all feeds, never terminate early
	if (shouldCheckAll) return true;

	// Stop when both RSS and Atom feeds are found
	return !(rssFound && atomFound);
}
```

### Deep Search Queue Management

```javascript
class Crawler extends EventEmitter {
	constructor(startUrl, maxDepth, concurrency, maxLinks, checkForeignFeeds, maxErrors, maxFeeds) {
		super();

		// Initialize async queue with concurrency control
		this.queue = async.queue(this.processUrl.bind(this), concurrency);

		// Error handling with circuit breaker
		this.queue.error((err, task) => {
			if (this.errorCount < this.maxErrors) {
				this.errorCount++;
				this.emit('error', {
					module: 'deepSearch',
					error: `Async error: ${err}`,
					explanation: 'Error in async queue processing...',
					suggestion: 'Check network connectivity...'
				});

				if (this.errorCount >= this.maxErrors) {
					this.queue.kill();
				}
			}
		});
	}
}
```

## Performance Optimization Techniques

### Memory Management

#### Efficient Data Structures

```javascript
// Use Set for O(1) duplicate checking
const foundUrls = new Set();
const visitedUrls = new Set();

// Use Map for O(1) lookups
const feedCache = new Map();

// Single-pass array processing
const validAnchors = allAnchors.filter(
	(anchor) => isValidAnchor(anchor) && !processedUrls.has(anchor.href)
);
```

#### Garbage Collection Optimization

```javascript
// Clear large objects after processing
processUrl(url, depth) {
  try {
    const content = await this.fetchContent(url);
    const links = this.extractLinks(content);

    // Process links immediately, don't store content
    this.processLinks(links, depth);

    // Content is automatically garbage collected
  } catch (error) {
    this.handleError(error);
  }
}
```

### Network Optimization

#### Request Batching Strategy

```javascript
// Sequential processing to avoid overwhelming servers
async function processEndpoints(endpoints) {
	for (let i = 0; i < endpoints.length; i++) {
		const result = await processSingleEndpoint(endpoints[i]);

		// Early termination saves network requests
		if (shouldStop(result)) {
			break;
		}

		// Small delay to be respectful to servers
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
}
```

#### Connection Reuse

```javascript
// Reuse connections for same domain
const agent = new https.Agent({
	keepAlive: true,
	maxSockets: 5,
	maxFreeSockets: 2
});

const response = await fetch(url, { agent });
```

## Testing and Quality Assurance

### Test Coverage

The library includes comprehensive test suites:

```javascript
// Unit tests for individual modules
describe('checkFeed Module', () => {
	it('should detect RSS feeds correctly', async () => {
		const rssContent = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Test Feed</title>
          <description>Test Description</description>
          <item><title>Item</title></item>
        </channel>
      </rss>`;

		const result = await checkFeed('test-url', rssContent);
		assert.strictEqual(result.type, 'rss');
		assert.strictEqual(result.title, 'Test Feed');
	});
});

// Integration tests for full workflows
describe('FeedSeeker Integration', () => {
	it('should handle complete discovery workflow', async () => {
		const feedScout = new FeedSeeker('https://example.com');
		const feeds = await feedScout.metaLinks();
		assert.ok(Array.isArray(feeds));
	});
});
```

### Error Simulation

```javascript
// Network error simulation
it('should handle network timeouts gracefully', async () => {
	const feedScout = new FeedSeeker('https://timeout-test.com', { timeout: 1 });

	let errorEmitted = false;
	feedScout.on('error', () => {
		errorEmitted = true;
	});

	const feeds = await feedScout.blindSearch();
	assert.ok(errorEmitted);
	assert.ok(Array.isArray(feeds)); // Should still return array
});
```

## Deployment Considerations

### Environment Configuration

```javascript
// Production configuration
const productionOptions = {
	timeout: 10, // Longer timeout for production
	maxErrors: 10, // Higher error threshold
	maxLinks: 2000, // More thorough search
	showErrors: false // Hide debug errors
};

// Development configuration
const developmentOptions = {
	timeout: 30, // Very long timeout for debugging
	maxErrors: 1, // Fail fast for debugging
	maxLinks: 100, // Faster iteration
	showErrors: true // Show all errors
};
```

### Resource Limits

```javascript
// Memory usage monitoring
process.on('memoryUsage', () => {
	const usage = process.memoryUsage();
	if (usage.heapUsed > 500 * 1024 * 1024) {
		// 500MB
		console.warn('High memory usage detected');
	}
});

// CPU usage limits
const cluster = require('cluster');
if (cluster.isMaster) {
	// Limit worker processes based on CPU cores
	const numWorkers = Math.min(require('os').cpus().length, 4);
	for (let i = 0; i < numWorkers; i++) {
		cluster.fork();
	}
}
```

### Security Considerations

#### Input Validation

```javascript
function validateUrl(url) {
	try {
		const parsed = new URL(url);

		// Protocol whitelist
		if (!['http:', 'https:'].includes(parsed.protocol)) {
			throw new Error('Invalid protocol');
		}

		// Prevent local network access
		const hostname = parsed.hostname;
		if (
			hostname === 'localhost' ||
			hostname.startsWith('127.') ||
			hostname.startsWith('192.168.') ||
			hostname.startsWith('10.')
		) {
			throw new Error('Local network access denied');
		}

		return true;
	} catch (error) {
		return false;
	}
}
```

#### Rate Limiting

```javascript
class RateLimiter {
	constructor(maxRequests = 100, windowMs = 60000) {
		this.requests = new Map();
		this.maxRequests = maxRequests;
		this.windowMs = windowMs;
	}

	isAllowed(domain) {
		const now = Date.now();
		const windowStart = now - this.windowMs;

		if (!this.requests.has(domain)) {
			this.requests.set(domain, []);
		}

		const domainRequests = this.requests.get(domain);

		// Remove old requests
		while (domainRequests.length > 0 && domainRequests[0] < windowStart) {
			domainRequests.shift();
		}

		// Check if under limit
		if (domainRequests.length < this.maxRequests) {
			domainRequests.push(now);
			return true;
		}

		return false;
	}
}
```

This comprehensive technical documentation covers all aspects of the Feed Seeker API, from basic usage to advanced integration patterns, performance optimization, testing strategies, and deployment considerations. The library provides a robust, event-driven approach to feed discovery with extensive configuration options and error handling capabilities.

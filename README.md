# FeedSeeker

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Latz_feedseeker&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Latz_feedseeker)

A comprehensive RSS, Atom, and JSON feed discovery tool for Node.js and the browser. FeedSeeker finds feeds on any website using multiple intelligent search strategies.

## Features

- **Multiple Search Strategies**: Meta links, anchor analysis, blind search, and deep crawling
- **Query Parameter Preservation**: Maintains URL query parameters in discovered feeds
- **Multi-Format Support**: Finds RSS 2.0, Atom 1.0, and JSON Feed formats
- **Event-Driven API**: Real-time progress updates during search
- **TypeScript Support**: Full TypeScript definitions included
- **CLI & Library**: Use as a command-line tool or import as a library
- **Smart URL Handling**: Automatic protocol detection and normalization
- **Configurable Timeouts**: Control request timeout and concurrency

## Installation

```bash
npm install feedseeker
```

Or use globally as a CLI tool:

```bash
npm install -g feedseeker
```

## CLI Usage

### Basic Usage

```bash
# Find feeds on a website
feed-seeker https://example.com

# Search without protocol (defaults to https://)
feed-seeker example.com

# Limit number of feeds
feed-seeker example.com --max-feeds 5
```

### Search Modes

```bash
# Fast mode - meta links and anchors only
feed-seeker example.com --search-mode fast

# Standard mode - meta links, anchors, and blind search (default)
feed-seeker example.com --search-mode standard

# Exhaustive mode - all strategies including deep crawling
feed-seeker example.com --search-mode exhaustive
```

### Specific Strategies

```bash
# Meta links only (fastest)
feed-seeker example.com --metasearch

# Blind search only
feed-seeker example.com --blindsearch

# Anchors only
feed-seeker example.com --anchorsonly

# Deep search only
feed-seeker example.com --deepsearch

# Run all strategies and show results from each
feed-seeker example.com --all
```

### Advanced Options

```bash
# Set timeout (seconds)
feed-seeker example.com --timeout 30

# Keep query parameters in feed URLs
feed-seeker example.com --keep-query-params

# Follow meta refresh redirects
feed-seeker example.com --follow-meta-refresh

# Show error messages
feed-seeker example.com --display-errors
```

## Library API

### Basic Example

```javascript
import FeedSeeker from "feedseeker";

// Create instance
const seeker = new FeedSeeker("https://example.com");

// Listen for events
seeker.on("initialized", () => {
  console.log("FeedSeeker initialized");
});

seeker.on("error", (data) => {
  console.error("Error:", data.error);
});

// Search for feeds using meta links
const feeds = await seeker.metaLinks();
console.log("Found feeds:", feeds);
```

### With Options

```javascript
import FeedSeeker from "feedseeker";

const seeker = new FeedSeeker("https://blog.example.com", {
  maxFeeds: 10,
  timeout: 15,
  keepQueryParams: true,
  followMetaRefresh: true,
});

// Initialize and search
await seeker.initialize();
const feeds = await seeker.metaLinks();
```

### Using Different Search Strategies

```javascript
const seeker = new FeedSeeker("https://example.com");
await seeker.initialize();

// Meta links (fastest, checks HTML <link> tags)
const metaFeeds = await seeker.metaLinks();

// Anchor search (checks <a> tags for feed-like URLs)
const anchorFeeds = await seeker.checkAllAnchors();

// Blind search (tries common feed endpoint patterns)
const blindFeeds = await seeker.blindSearch();

// Deep search (crawls website for feeds)
const deepFeeds = await seeker.deepSearch({
  maxDepth: 2,
  maxLinks: 50,
});
```

### Event Handling

```javascript
const seeker = new FeedSeeker("https://example.com");

// Initialization complete
seeker.on("initialized", () => {
  console.log("Ready to search");
});

// Strategy started
seeker.on("start", (data) => {
  console.log(`Starting ${data.niceName}`);
});

// Progress updates
seeker.on("log", (data) => {
  console.log(`Progress: ${data.module}`);
});

// Strategy completed
seeker.on("end", (data) => {
  console.log(`Found ${data.feeds.length} feeds`);
});

// Error occurred
seeker.on("error", (data) => {
  console.error(`Error: ${data.error}`);
});
```

## Search Strategies

### 1. Meta Links

Fastest method. Searches for `<link>` tags with `rel="alternate"` and feed MIME types:

- `application/rss+xml`
- `application/atom+xml`
- `application/json`

### 2. Anchor Analysis

Searches anchor (`<a>`) tags for URLs that look like feeds based on:

- Common feed paths (`/feed`, `/rss`, `/atom`, etc.)
- Feed-like file extensions (`.xml`, `.rss`, `.atom`)
- Feed keywords in URLs

### 3. Blind Search

Tests hundreds of common feed endpoint patterns:

- `/feed`, `/rss`, `/atom`, `/feeds`
- WordPress patterns (`/feed/`, `/comments/feed`)
- Category/tag feeds (`/category/*/feed`)
- Dated paths (`/2024/feed`)
- And many more variations

### 4. Deep Search (Crawling)

Recursively crawls the website to discover feeds:

- Follows internal links up to specified depth
- Checks each page for feeds
- Configurable depth and link limits
- Respects same-domain constraint

## Options Reference

| Option              | Type    | Default      | Description                                      |
| ------------------- | ------- | ------------ | ------------------------------------------------ |
| `maxFeeds`          | number  | `Infinity`   | Maximum feeds to return                          |
| `timeout`           | number  | `10`         | Request timeout in seconds                       |
| `all`               | boolean | `false`      | Run all strategies sequentially                  |
| `keepQueryParams`   | boolean | `false`      | Preserve query parameters in feed URLs           |
| `showErrors`        | boolean | `false`      | Display error messages                           |
| `followMetaRefresh` | boolean | `false`      | Follow meta refresh redirects                    |
| `metasearch`        | boolean | `false`      | Run meta links search only                       |
| `blindsearch`       | boolean | `false`      | Run blind search only                            |
| `anchorsonly`       | boolean | `false`      | Run anchor search only                           |
| `deepsearch`        | boolean | `false`      | Run deep search only                             |
| `searchMode`        | string  | `'standard'` | Search mode: `fast`, `standard`, or `exhaustive` |

### Deep Search Options

| Option        | Type   | Default | Description                   |
| ------------- | ------ | ------- | ----------------------------- |
| `maxDepth`    | number | `3`     | Maximum crawl depth           |
| `maxLinks`    | number | `100`   | Maximum links to process      |
| `concurrency` | number | `5`     | Number of concurrent requests |

## Feed Object

Each discovered feed has the following structure:

```typescript
interface Feed {
  url: string; // Feed URL
  title?: string; // Feed title (if available)
  type: "rss" | "atom" | "json"; // Feed format
  source?: string; // Source URL where feed was found
}
```

## TypeScript

FeedSeeker is written in TypeScript and includes full type definitions:

```typescript
import FeedSeeker, { type FeedSeekerOptions, type Feed } from "feedseeker";

const options: FeedSeekerOptions = {
  maxFeeds: 5,
  timeout: 10,
};

const seeker = new FeedSeeker("https://example.com", options);
const feeds: Feed[] = await seeker.metaLinks();
```

## Examples

### Find All Feeds on a Site

```javascript
import FeedSeeker from "feedseeker";

async function findAllFeeds(url) {
  // The `startSearch()` method is the easiest way to find all feeds.
  // It runs all strategies and returns a single, deduplicated list.
  const seeker = new FeedSeeker(url);
  const feeds = await seeker.startSearch();
  return feeds;

  /*
  // Alternatively, you can run strategies manually:
  const manualSeeker = new FeedSeeker(url);
  await manualSeeker.initialize();

  const results = await Promise.all([
    manualSeeker.metaLinks(),
    manualSeeker.checkAllAnchors(),
    manualSeeker.blindSearch(),
  ]);

  const allFeeds = results.flat();

  // Then you must deduplicate the results yourself
  const uniqueFeeds = [...new Map(allFeeds.map((f) => [f.url, f])).values()];
  return uniqueFeeds;
  */
}

const feeds = await findAllFeeds("https://techcrunch.com");
console.log(`Found ${feeds.length} unique feeds:`, feeds);
```

### CLI Batch Processing

```bash
# Process multiple sites
for site in example.com blog.example.org news.example.net; do
  echo "Searching $site..."
  feed-seeker $site --max-feeds 3
done
```

## Requirements

- Node.js >= 22.0.0

## License

MIT

## Author

Latz <latz@elektroelch.de>

## Repository

https://github.com/Latz/feedseeker

## Issues

Report bugs at https://github.com/Latz/feedseeker/issues

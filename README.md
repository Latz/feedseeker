# FeedSeeker

[![Quality Gate Status](https://sonarcloud.io/api/project_badges/measure?project=Latz_feedseeker&metric=alert_status)](https://sonarcloud.io/summary/new_code?id=Latz_feedseeker)

A comprehensive RSS, Atom, and JSON feed discovery tool for Node.js. FeedSeeker finds feeds on any website using multiple intelligent search strategies.

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

### Output Formats

```bash
# JSON output
feed-seeker example.com --format json

# OPML export (importable into any feed reader)
feed-seeker example.com --format opml > feeds.opml

# Quiet mode — one URL per line, no banner or progress (pipe-friendly)
feed-seeker example.com --quiet
feed-seeker example.com -q

# Pipe URLs directly into another tool
feed-seeker example.com -q | xargs -I{} curl -s {}
```

### Batch Mode

```bash
# Read URLs from a file (one per line, # comments and blank lines ignored)
feed-seeker --file sites.txt
feed-seeker -f sites.txt

# Combine with output formats
feed-seeker --file sites.txt --format opml > all-feeds.opml
feed-seeker --file sites.txt -q
```

sites.txt format:
```
# My sites
https://example.com
https://blog.example.org
# https://skip-this.com
```

### Freshness Filter

```bash
# Only show feeds with a post in the last 30 days (default)
feed-seeker example.com --check
feed-seeker example.com -c

# Custom window
feed-seeker example.com --check 7
feed-seeker example.com -c 90
```

### Search Strategies

```bash
# Meta links only (fastest)
feed-seeker example.com --metasearch

# Blind search only
feed-seeker example.com --blindsearch

# Anchors only
feed-seeker example.com --anchorsonly

# Enable deep search (crawls the site)
feed-seeker example.com --deepsearch

# Deep search only
feed-seeker example.com --deepsearch-only

# Run all strategies and show results from each
feed-seeker example.com --all
```

### Advanced Options

```bash
# Set timeout (seconds)
feed-seeker example.com --timeout 30

# Keep query parameters in feed URLs
feed-seeker example.com --keep-query-params

# Show error messages
feed-seeker example.com --display-errors

# Disable TLS certificate verification (like curl -k)
feed-seeker example.com --insecure
```

## Library API

### Basic Example

```javascript
import FeedSeeker from "feedseeker";

const seeker = new FeedSeeker("https://example.com");
const feeds = await seeker.startSearch();
console.log("Found feeds:", feeds);
```

### Multi-Site Search

```javascript
import { findAll } from "feedseeker";

// Search multiple sites in parallel
const results = await findAll([
  "https://example.com",
  "https://blog.example.org",
  "https://news.example.net",
]);

for (const [url, feeds] of results) {
  console.log(`${url}: ${feeds.length} feeds`);
}
```

`findAll` returns `Promise<Map<string, Feed[]>>` where each key is the input URL.

### With Options

```javascript
import FeedSeeker from "feedseeker";

const seeker = new FeedSeeker("https://blog.example.com", {
  maxFeeds: 10,
  timeout: 15,
  keepQueryParams: true,
});

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
const deepFeeds = await seeker.deepSearch();
```

### Event Handling

```javascript
const seeker = new FeedSeeker("https://example.com");

seeker.on("start", (data) => {
  console.log(`Starting ${data.niceName}`);
});

seeker.on("log", (data) => {
  console.log(`Progress: ${data.module}`);
});

seeker.on("end", (data) => {
  console.log(`Found ${data.feeds.length} feeds`);
});

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

- Seeds from `sitemap.xml` / `robots.txt` before crawling
- Follows internal links up to specified depth
- Checks each page for feeds
- Configurable depth and link limits
- Respects same-domain constraint

## Options Reference

| Option              | Type    | Default      | Description                                      |
| ------------------- | ------- | ------------ | ------------------------------------------------ |
| `maxFeeds`          | number  | `0`          | Maximum feeds to return (0 = unlimited)          |
| `timeout`           | number  | `15`         | Request timeout in seconds                       |
| `keepQueryParams`   | boolean | `false`      | Preserve query parameters in feed URLs           |
| `checkForeignFeeds` | boolean | `false`      | Check if foreign domain URLs are feeds           |
| `maxErrors`         | number  | `5`          | Stop after a certain number of errors            |
| `insecure`          | boolean | `false`      | Disable TLS certificate verification             |

### Deep Search Options

| Option        | Type   | Default | Description                   |
| ------------- | ------ | ------- | ----------------------------- |
| `maxDepth`    | number | `3`     | Maximum crawl depth           |
| `maxLinks`    | number | `1000`  | Maximum links to process      |
| `concurrency` | number | `5`     | Number of concurrent requests |

## Feed Object

Each discovered feed has the following structure:

```typescript
interface Feed {
  url: string;            // Feed URL
  title: string | null;   // Page title (null if not found)
  type: "rss" | "atom" | "json";  // Feed format
  feedTitle: string | null;       // Title from feed content
}
```

## TypeScript

FeedSeeker is written in TypeScript and includes full type definitions:

```typescript
import FeedSeeker, { findAll, type FeedSeekerOptions, type Feed } from "feedseeker";

const options: FeedSeekerOptions = {
  maxFeeds: 5,
  timeout: 10,
};

const seeker = new FeedSeeker("https://example.com", options);
const feeds: Feed[] = await seeker.metaLinks();

// Multi-site
const results: Map<string, Feed[]> = await findAll(["https://example.com"], options);
```

## Changelog

### [1.0.4] — 2026-06-13
- **feat**: `--file <path>` / `-f` batch mode — read URLs from a file and search each site
- **feat**: `findAll(urls, options)` library API — parallel multi-site search returning `Map<url, Feed[]>`
- **feat**: `--format opml` — export discovered feeds as OPML 2.0
- **feat**: `--quiet` / `-q` — pipe-friendly output (one URL per line)
- **feat**: `-c` short alias for `--check`
- **chore**: updated dependencies (vite 8, undici 8, typescript 6)

### [1.0.3] — 2026-06-13
- **feat**: deepSearch now seeds URLs from `sitemap.xml` before crawling
- **fix**: www/non-www URL variants deduplicated correctly
- **fix**: relative links resolved against current page URL

### [1.0.2] — 2026-06-04
- **fix**: deepSearch no longer hangs when crawl stops early
- **fix**: concurrent crawlers no longer fetch the same URL multiple times
- **fix**: CLI `--all` mode shows human-readable output and final summary
- **perf**: eliminated double-fetch per crawled link; O(1) feed deduplication

### [1.0.1] — 2026-03-15
- Fixed `checkFeed` minimum timeout; aligned default to 15s across all callers
- Switched to pnpm; renamed dist files to `feedseeker.*`

### [1.0.0] — 2026-01-09
- Initial stable release

→ [Full changelog](https://github.com/Latz/feedseeker/blob/main/CHANGELOG.md)

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

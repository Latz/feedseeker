# Feed Seeker API Reference

A simple, powerful library for discovering RSS, Atom, and JSON feeds on any website.

## Quick Start

```bash
npm install feed-seeker
```

```javascript
import FeedSeeker from 'feed-seeker';

const feedScout = new FeedSeeker('https://example.com');
const feeds = await feedScout.metaLinks();

console.log(`Found ${feeds.length} feeds:`);
feeds.forEach((feed) => {
	console.log(`- ${feed.url} (${feed.type})`);
});
```

## API Overview

### Constructor

```javascript
new FeedSeeker(url, options);
```

**Parameters:**

- `url` (string): Website URL to search
- `options` (object, optional): Configuration options

**Example:**

```javascript
const feedScout = new FeedSeeker('https://news-site.com', {
	timeout: 10,
	maxFeeds: 5
});
```

### Search Methods

#### `metaLinks()` - Fast Meta Tag Search

Searches HTML `<link>` tags for feed references.

```javascript
const feeds = await feedScout.metaLinks();
```

**Best for:** Quick discovery, most reliable results

#### `checkAllAnchors()` - Anchor Link Analysis

Analyzes all anchor tags on the page for feed links.

```javascript
const feeds = await feedScout.checkAllAnchors();
```

**Best for:** Finding feeds linked in content

#### `blindSearch()` - Common Endpoint Testing

Tests 320+ common feed URLs like `/feed`, `/rss`, etc.

```javascript
const feeds = await feedScout.blindSearch();
```

**Best for:** Sites without proper meta tags

#### `deepSearch()` - Website Crawling

Crawls the website following links to find feeds.

```javascript
const feeds = await feedScout.deepSearch();
```

**Best for:** Comprehensive discovery (slower)

## Configuration Options

```javascript
const options = {
	// Request timeout in seconds (default: 5)
	timeout: 10,

	// Maximum feeds to find (0 = unlimited)
	maxFeeds: 3,

	// Deep search options
	depth: 3, // Crawling depth (default: 3)
	maxLinks: 1000, // Max links to process (default: 1000)
	checkForeignFeeds: false, // Check external domains

	// URL handling
	keepQueryParams: true, // Preserve query parameters

	// Search mode (use only one)
	metasearch: false, // Meta search only
	blindsearch: false, // Blind search only
	anchorsonly: false, // Anchors only
	deepsearch: false, // Enable deep search
	all: false // Find all feeds (no early stop)
};
```

## Event Handling

Feed Seeker emits events for real-time progress updates:

```javascript
const feedScout = new FeedSeeker('https://example.com');

// Website loaded and parsed
feedScout.on('initialized', () => {
	console.log('Ready to search');
});

// Search module started
feedScout.on('start', (data) => {
	console.log(`Starting ${data.niceName}`);
});

// Progress updates
feedScout.on('log', (data) => {
	if (data.totalCount) {
		console.log(`Checking ${data.totalCount} items`);
	}
	if (data.foundFeedsCount) {
		console.log(`Found ${data.foundFeedsCount} feeds so far`);
	}
});

// Search completed
feedScout.on('end', (data) => {
	console.log(`${data.module} found ${data.feeds.length} feeds`);
});

// Error occurred
feedScout.on('error', (data) => {
	console.error(`Error: ${data.error}`);
	if (data.explanation) {
		console.error(`Cause: ${data.explanation}`);
	}
});
```

## Feed Object Structure

Each discovered feed returns an object with:

```javascript
{
  url: 'https://example.com/feed.xml',    // Feed URL
  title: 'Site RSS Feed',                 // Link title (from HTML)
  type: 'rss',                           // Feed type: 'rss', 'atom', 'json'
  feedTitle: 'My Blog Posts'             // Actual feed title (from feed content)
}
```

## Common Usage Patterns

### Basic Feed Discovery

```javascript
import FeedSeeker from 'feed-seeker';

async function findFeeds(url) {
	const feedScout = new FeedSeeker(url);

	// Try meta search first (fastest)
	let feeds = await feedScout.metaLinks();

	// If no feeds found, try blind search
	if (feeds.length === 0) {
		feeds = await feedScout.blindSearch();
	}

	return feeds;
}

const feeds = await findFeeds('https://blog.example.com');
```

### Comprehensive Search

```javascript
async function findAllFeeds(url) {
	const feedScout = new FeedSeeker(url, {
		maxFeeds: 0, // No limit
		all: true // Don't stop early
	});

	const allFeeds = [];

	// Run all search strategies
	allFeeds.push(...(await feedScout.metaLinks()));
	allFeeds.push(...(await feedScout.checkAllAnchors()));
	allFeeds.push(...(await feedScout.blindSearch()));

	// Remove duplicates
	const uniqueFeeds = allFeeds.filter(
		(feed, index, self) => index === self.findIndex((f) => f.url === feed.url)
	);

	return uniqueFeeds;
}
```

### With Progress Tracking

```javascript
async function findFeedsWithProgress(url) {
	const feedScout = new FeedSeeker(url);

	let totalFound = 0;

	feedScout.on('end', (data) => {
		totalFound += data.feeds.length;
		console.log(`${data.module}: +${data.feeds.length} feeds (total: ${totalFound})`);
	});

	feedScout.on('error', (data) => {
		console.warn(`Warning: ${data.error}`);
	});

	// Run searches sequentially
	await feedScout.metaLinks();
	await feedScout.blindSearch();

	console.log(`Discovery complete: ${totalFound} feeds found`);
}
```

### Error Handling

```javascript
async function robustFeedSearch(url) {
	const feedScout = new FeedSeeker(url, { timeout: 10 });

	const errors = [];
	feedScout.on('error', (data) => {
		errors.push(data);
	});

	try {
		const feeds = await feedScout.metaLinks();

		return {
			success: true,
			feeds,
			errors: errors.length > 0 ? errors : null
		};
	} catch (error) {
		return {
			success: false,
			feeds: [],
			errors: [{ error: error.message }]
		};
	}
}

const result = await robustFeedSearch('https://problematic-site.com');
if (result.success) {
	console.log(`Found ${result.feeds.length} feeds`);
} else {
	console.error('Search failed:', result.errors);
}
```

### Performance Optimized

```javascript
// Fast search (good for real-time applications)
const fastOptions = {
	timeout: 3,
	maxFeeds: 1,
	metasearch: true // Meta search only
};

// Thorough search (good for comprehensive analysis)
const thoroughOptions = {
	timeout: 15,
	maxFeeds: 0,
	deepsearch: true,
	depth: 4,
	maxLinks: 2000
};

const feedScout = new FeedSeeker(url, fastOptions);
const feeds = await feedScout.metaLinks();
```

### Batch Processing

```javascript
async function processSites(urls) {
	const results = [];

	for (const url of urls) {
		try {
			const feedScout = new FeedSeeker(url, { timeout: 5 });
			const feeds = await feedScout.metaLinks();

			results.push({
				url,
				success: true,
				feeds: feeds.length,
				feedUrls: feeds.map((f) => f.url)
			});
		} catch (error) {
			results.push({
				url,
				success: false,
				error: error.message
			});
		}

		// Be respectful - small delay between requests
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	return results;
}

const sites = [
	'https://techcrunch.com',
	'https://arstechnica.com',
	'https://hacker-news.firebaseio.com'
];

const results = await processSites(sites);
```

## Feed Types Supported

- **RSS 2.0**: Most common feed format
- **Atom 1.0**: Modern XML feed format
- **JSON Feed**: JSON-based feed format

## Domain Security

Feed Seeker includes a whitelist of 70+ trusted domains for external feed discovery:

- News: CNN, BBC, Reuters, NY Times
- Podcasts: Spotify, Apple Podcasts, SoundCloud
- Platforms: WordPress, Medium, Substack
- Tech: GitHub, Stack Overflow, Dev.to

## Error Types

Common errors you might encounter:

- **Network errors**: Timeouts, connection failures
- **HTTP errors**: 403 Forbidden, 404 Not Found, 500 Server Error
- **Content errors**: Invalid HTML, malformed feeds
- **Configuration errors**: Invalid URLs, conflicting options

All errors include helpful explanations and suggestions for resolution.

## Tips & Best Practices

1. **Start with `metaLinks()`** - fastest and most reliable
2. **Use `timeout` option** for slow or unreliable sites
3. **Set `maxFeeds`** to limit results and improve performance
4. **Handle errors gracefully** - some sites block automated requests
5. **Be respectful** - add delays when processing multiple sites
6. **Use events** for progress feedback in long-running operations
7. **Cache results** - feed discovery can be expensive

## TypeScript Support

Feed Seeker includes TypeScript definitions:

```typescript
import FeedSeeker, { FeedObject, FeedSeekerOptions } from 'feed-seeker';

interface FeedObject {
	url: string;
	title: string | null;
	type: 'rss' | 'atom' | 'json';
	feedTitle: string | null;
}

const options: FeedSeekerOptions = {
	timeout: 10,
	maxFeeds: 5
};

const feedScout = new FeedSeeker('https://example.com', options);
const feeds: FeedObject[] = await feedScout.metaLinks();
```

## Real-World Examples

### News Aggregator

```javascript
import FeedSeeker from 'feed-seeker';

class NewsAggregator {
	constructor() {
		this.sources = [];
	}

	async addSource(url) {
		const feedScout = new FeedSeeker(url);

		try {
			// Try multiple strategies
			let feeds = await feedScout.metaLinks();
			if (feeds.length === 0) {
				feeds = await feedScout.blindSearch();
			}

			if (feeds.length > 0) {
				this.sources.push({
					site: url,
					feeds: feeds.map((f) => ({
						url: f.url,
						type: f.type,
						title: f.feedTitle || f.title
					}))
				});

				console.log(`✓ Added ${feeds.length} feeds from ${url}`);
			} else {
				console.log(`✗ No feeds found for ${url}`);
			}
		} catch (error) {
			console.error(`✗ Failed to process ${url}: ${error.message}`);
		}
	}

	async discoverFeeds(urls) {
		console.log(`Discovering feeds for ${urls.length} sites...`);

		for (const url of urls) {
			await this.addSource(url);
			// Respectful delay
			await new Promise((resolve) => setTimeout(resolve, 2000));
		}

		return this.sources;
	}
}

// Usage
const aggregator = new NewsAggregator();
const newsSites = ['https://techcrunch.com', 'https://arstechnica.com', 'https://theverge.com'];

const sources = await aggregator.discoverFeeds(newsSites);
console.log(`Total sources: ${sources.length}`);
```

### Podcast Directory Builder

```javascript
async function buildPodcastDirectory(podcastSites) {
	const directory = [];

	for (const site of podcastSites) {
		const feedScout = new FeedSeeker(site, {
			timeout: 15, // Podcasts can be slow
			maxFeeds: 10 // Many podcasts per site
		});

		let podcastFeeds = [];

		// Comprehensive search for podcasts
		podcastFeeds.push(...(await feedScout.metaLinks()));
		podcastFeeds.push(...(await feedScout.checkAllAnchors()));

		// Filter for likely podcast feeds
		const audioFeeds = podcastFeeds.filter(
			(feed) =>
				feed.url.includes('podcast') ||
				feed.url.includes('audio') ||
				feed.feedTitle?.toLowerCase().includes('podcast')
		);

		if (audioFeeds.length > 0) {
			directory.push({
				site,
				podcasts: audioFeeds
			});
		}
	}

	return directory;
}

const podcastSites = [
	'https://gimletmedia.com',
	'https://www.npr.org/podcasts',
	'https://podcasts.apple.com'
];

const directory = await buildPodcastDirectory(podcastSites);
```

### Blog Feed Monitor

```javascript
class BlogMonitor {
	constructor() {
		this.blogs = new Map();
	}

	async addBlog(url) {
		const feedScout = new FeedSeeker(url);

		// Progress tracking
		feedScout.on('start', (data) => {
			console.log(`🔍 ${data.niceName} for ${url}`);
		});

		feedScout.on('log', (data) => {
			if (data.foundFeedsCount) {
				console.log(`   Found ${data.foundFeedsCount} feeds`);
			}
		});

		try {
			const feeds = await feedScout.metaLinks();

			if (feeds.length > 0) {
				this.blogs.set(url, {
					discovered: new Date(),
					feeds: feeds,
					status: 'active'
				});

				return feeds;
			} else {
				console.log(`⚠️  No feeds found for ${url}`);
				return [];
			}
		} catch (error) {
			console.error(`❌ Error processing ${url}: ${error.message}`);
			this.blogs.set(url, {
				discovered: new Date(),
				feeds: [],
				status: 'error',
				error: error.message
			});
			return [];
		}
	}

	getStats() {
		const total = this.blogs.size;
		const active = Array.from(this.blogs.values()).filter(
			(blog) => blog.status === 'active'
		).length;
		const totalFeeds = Array.from(this.blogs.values()).reduce(
			(sum, blog) => sum + blog.feeds.length,
			0
		);

		return { total, active, totalFeeds };
	}
}

// Usage
const monitor = new BlogMonitor();
await monitor.addBlog('https://blog.example.com');
console.log(monitor.getStats());
```

### Feed Validation Service

```javascript
async function validateFeedUrls(urls) {
	const results = [];

	for (const url of urls) {
		try {
			// Use checkFeed directly for validation
			const feedScout = new FeedSeeker(url);
			await feedScout.initialize();

			// Try to fetch and validate the URL as a feed
			const response = await fetch(url);
			if (!response.ok) {
				results.push({
					url,
					valid: false,
					error: `HTTP ${response.status}`
				});
				continue;
			}

			const content = await response.text();

			// Import checkFeed utility
			const { default: checkFeed } = await import('feed-seeker/checkFeed');
			const feedInfo = await checkFeed(url, content);

			results.push({
				url,
				valid: !!feedInfo,
				type: feedInfo?.type,
				title: feedInfo?.title,
				size: content.length
			});
		} catch (error) {
			results.push({
				url,
				valid: false,
				error: error.message
			});
		}
	}

	return results;
}

const feedUrls = [
	'https://feeds.feedburner.com/TechCrunch',
	'https://rss.cnn.com/rss/edition.rss',
	'https://invalid-feed-url.com/fake.xml'
];

const validation = await validateFeedUrls(feedUrls);
console.log('Validation results:', validation);
```

### Express.js API Integration

```javascript
import express from 'express';
import FeedSeeker from 'feed-seeker';

const app = express();
app.use(express.json());

// Discover feeds endpoint
app.post('/api/discover-feeds', async (req, res) => {
	const { url, options = {} } = req.body;

	if (!url) {
		return res.status(400).json({ error: 'URL is required' });
	}

	try {
		const feedScout = new FeedSeeker(url, {
			timeout: 10,
			maxFeeds: 10,
			...options
		});

		const feeds = await feedScout.metaLinks();

		res.json({
			success: true,
			url,
			feedsFound: feeds.length,
			feeds: feeds.map((feed) => ({
				url: feed.url,
				title: feed.feedTitle || feed.title,
				type: feed.type
			}))
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			error: error.message
		});
	}
});

// Comprehensive search endpoint
app.post('/api/comprehensive-search', async (req, res) => {
	const { url } = req.body;

	try {
		const feedScout = new FeedSeeker(url, { timeout: 15 });
		const allFeeds = [];

		// Run all search strategies
		allFeeds.push(...(await feedScout.metaLinks()));
		allFeeds.push(...(await feedScout.checkAllAnchors()));
		allFeeds.push(...(await feedScout.blindSearch()));

		// Remove duplicates
		const uniqueFeeds = allFeeds.filter(
			(feed, index, self) => index === self.findIndex((f) => f.url === feed.url)
		);

		res.json({
			success: true,
			strategies: {
				meta: (await feedScout.metaLinks()).length,
				anchors: (await feedScout.checkAllAnchors()).length,
				blind: (await feedScout.blindSearch()).length
			},
			totalUnique: uniqueFeeds.length,
			feeds: uniqueFeeds
		});
	} catch (error) {
		res.status(500).json({
			success: false,
			error: error.message
		});
	}
});

app.listen(3000, () => {
	console.log('Feed discovery API running on port 3000');
});
```

## CLI Usage

Feed Seeker also provides a command-line interface:

```bash
# Basic usage
feed-seeker https://example.com

# Meta search only (fastest)
feed-seeker -m https://blog.example.com

# Comprehensive search with deep crawling
feed-seeker -d --depth 4 https://news-site.com

# Limit results and set timeout
feed-seeker --max-feeds 3 --timeout 10 https://slow-site.com

# Keep query parameters
feed-seeker --keep-query-params https://site.com?category=tech

# Verbose output
feed-seeker -v 2 https://example.com
```

## Troubleshooting

### Common Issues

**No feeds found:**

```javascript
// Try multiple strategies
const feeds1 = await feedScout.metaLinks();
if (feeds1.length === 0) {
	const feeds2 = await feedScout.blindSearch();
}
```

**Timeout errors:**

```javascript
// Increase timeout for slow sites
const feedScout = new FeedSeeker(url, { timeout: 30 });
```

**403 Forbidden errors:**

```javascript
// Some sites block automated requests
feedScout.on('error', (data) => {
	if (data.error.includes('403')) {
		console.log('Site blocks automated requests - try manual verification');
	}
});
```

**Memory issues with large sites:**

```javascript
// Limit deep search parameters
const options = {
	maxLinks: 500, // Reduce from default 1000
	depth: 2, // Reduce from default 3
	maxFeeds: 5 // Stop after finding 5 feeds
};
```

## License

MIT License - see LICENSE file for details.

# Feed Seeker

[![npm version](https://badge.fury.io/js/feed-seeker.svg)](https://badge.fury.io/js/feed-seeker)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Feed Seeker** is a powerful tool to discover RSS, Atom, and JSON feeds on any website. It uses multiple search strategies to find feeds that other tools might miss.

## Features

- 🔍 **Multiple Search Strategies**: Uses meta tags, anchor links, blind search, and deep search
- ⚡ **Fast & Efficient**: Concurrent fetching and intelligent search algorithms
- 🌐 **Universal Support**: Finds RSS, Atom, and JSON feeds
- 🖥️ **CLI & Programmatic API**: Use as a command-line tool or integrate into your applications
- 📦 **Lightweight**: Minimal dependencies and fast execution

## Installation

Install Feed Seeker globally to use it as a command-line tool:

```bash
npm install -g feed-seeker
```

Or install it locally in your project:

```bash
npm install feed-seeker
```

## Usage

### Command Line Interface

Find feeds for a website:

```bash
feed-seeker https://example.com
```

#### Options

- `-m, --metasearch`: Search only in meta tags (fastest)
- `-b, --blindsearch`: Use blind search strategy
- `-d, --deepsearch`: Enable deep search (most thorough)
- `--depth <number>`: Set deep search depth (default: 3)
- `--max-links <number>`: Set maximum number of links to process during deep search (default: 1000)
- `--timeout <seconds>`: Set fetch timeout (default: 5)
- `--keep-query-params`: Keep query parameters from the original URL when searching
- `-v, --verbose <level>`: Set verbose output level

#### Examples

```bash
# Basic usage
feed-seeker https://news.ycombinator.com

# Meta search only (fast)
feed-seeker -m https://github.com

# Enable deep search (thorough but slower)
feed-seeker -d https://nytimes.com

# Set deep search depth
feed-seeker -d --depth 5 https://blog.example.com

# Limit deep search to 500 links
feed-seeker -d --max-links 500 https://large-website.com

# Set timeout for requests
feed-seeker --timeout 10 https://slow-website.com

# Keep query parameters when searching
feed-seeker --keep-query-params https://example.com?category=tech
```

### Programmatic Usage

You can also use Feed Seeker programmatically in your Node.js applications:

```javascript
import FeedSeeker from 'feed-seeker';

const feedFinder = new FeedSeeker('https://example.com');

// Listen for events
feedFinder.on('initialized', () => {
	console.log('Page fetched and parsed');
});

feedFinder.on('end', (data) => {
	if (data.feeds.length > 0) {
		console.log(`Found ${data.feeds.length} feeds:`);
		data.feeds.forEach((feed) => {
			console.log(`- ${feed.url} (${feed.type})`);
		});
	} else {
		console.log('No feeds found');
	}
});

// Run the search
await feedFinder.metaLinks();
```

## How It Works

Feed Seeker uses multiple strategies to find feeds:

1. **Meta Search**: Looks for feed references in `<link>` tags in the HTML head
2. **Anchor Search**: Searches for feed links in the page's anchor tags
3. **Blind Search**: Tries common feed URLs like `/feed`, `/rss`, etc.
4. **Deep Search**: Follows links on the page to search for feeds on other pages

## API

### `new FeedSeeker(site, options)`

Creates a new instance of the feed finder.

- `site`: The URL of the website to search
- `options`: Configuration options
  - `timeout`: Request timeout in seconds (default: 5)
  - `depth`: Deep search depth (default: 3)
  - `maxLinks`: Maximum number of links to process during deep search (default: 1000)

### Methods

- `metaLinks()`: Search for feeds in meta tags
- `checkAllAnchors()`: Search for feeds in anchor links
- `blindsearch()`: Try common feed URLs
- `deepSearch()`: Perform deep search on linked pages

### Events

- `initialized`: Emitted when the page is fetched and parsed
- `start`: Emitted when a search strategy starts
- `log`: Emitted for progress updates
- `end`: Emitted when a search strategy completes
- `error`: Emitted when an error occurs

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Author

Your Name <your.email@example.com>

## Support

If you encounter any issues or have questions, please [file an issue](https://github.com/yourusername/feed-seeker/issues) on GitHub.

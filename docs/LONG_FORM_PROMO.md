# Stop Hunting for RSS Feeds. Discover Them Automatically with Feed Seeker.

Ever tried to build a news aggregator, a podcast directory, or a personal dashboard? One of the first, and most frustrating, hurdles is finding the content feeds. You start by looking for a simple `<link rel="alternate" type="application/rss+xml">` tag, but what happens when it's not there? You end up manually guessing URLs like `/feed`, `/rss.xml`, or digging through page source, hoping for a clue. It's tedious, unreliable, and doesn't scale.

This is the exact problem I built **Feed Seeker** to solve. It’s a powerful Node.js library designed to be your secret weapon for discovering RSS, Atom, and JSON feeds from any website, handling all the complexity so you can focus on building your application.

## The Challenge of Feed Discovery

Finding feeds isn't as simple as it seems. Websites hide them in all sorts of places:

- **Non-standard meta tags:** The `<link>` tag is a convention, not a strict rule.
- **Hidden in plain sight:** Links might be buried in anchor `<a>` tags in the footer or on a separate "subscribe" page.
- **No links at all:** Many sites, especially those powered by platforms like WordPress, have feeds available at common endpoints (e.g., `/?feed=rss2`) but don't advertise them anywhere.
- **Modern formats:** The world is moving beyond XML. JSON Feeds are becoming more popular, but many tools don't look for them.

## How Feed Seeker Finds What Others Miss

Feed Seeker doesn't just rely on one method; it employs a powerful, four-stage strategy to maximize its discovery rate.

### 1. Meta & Anchor Search (The Basics)

First, it does the obvious stuff: scanning for `<link>` tags in the HTML head and looking for `<a>` tags that explicitly link to feeds. This catches the low-hanging fruit, but it's just the beginning.

### 2. Blind Search (The Secret Weapon)

This is where Feed Seeker starts to shine. When a site doesn't advertise its feed, we find it anyway. The blind search module intelligently tests over **320 common endpoint patterns** against the target URL and its parent paths.

For a URL like `https://example.com/blog/posts/my-article`, it will check for feeds at:

- `/blog/posts/my-article/...`
- `/blog/posts/...`
- `/blog/...`
- `/...`

This path-traversal logic means it finds feeds for specific categories, forums, or blog sections that would otherwise be completely hidden.

### 3. Deep Search (The Crawler)

For the most stubborn cases, Feed Seeker can crawl the entire website. It follows internal links to discover feeds on pages other than the one you started with. Worried about performance or hitting a bad site? The deep search comes with:

- **Concurrency Control:** Manages how many pages are fetched at once.
- **Depth & Link Limits:** You control how deep and wide the crawl goes.
- **Circuit Breaker:** Automatically stops crawling a site that returns too many errors, protecting your application from getting bogged down.

## Built for Developers

Feed Seeker isn't just powerful; it's designed with a great Developer Experience (DX) in mind.

- **Simple, Programmatic API:** Get started in seconds.

  ```javascript
  import FeedSeeker from 'feed-seeker';

  // Find feeds using all strategies
  const feeds = await new FeedSeeker('https://example.com').discover();
  console.log(feeds);
  ```

- **Powerful CLI:** Need to find a feed from your terminal? No problem.

  ```bash
  # Run a full deep search from the command line
  npx feed-seeker https://example.com --deepsearch
  ```

- **Event-Driven Progress:** Building a UI? Feed Seeker emits events for `start`, `log`, `end`, and `error` for each search strategy, so you can give your users real-time feedback.

- **Robust and Production-Ready:** With built-in timeout management and intelligent error handling, you can trust it in your production applications.

## What Can You Build with It?

- A **news aggregator** that pulls from thousands of sources.
- A **podcast directory** that finds even the most obscure podcast feeds.
- A **content monitoring tool** that watches for updates across a list of websites.
- A **SaaS product** that needs to be "feed-aware" for user-provided URLs.

## Get Started

Ready to stop hunting and start finding? Install Feed Seeker today and see what you can uncover.

**Installation:**

```bash
npm install feed-seeker
```

We're open-source and would love your feedback, contributions, or a star on GitHub!

- **NPM:** https://www.npmjs.com/package/feed-seeker
- **GitHub:** https://github.com/your-username/feed-seeker

Let me know what you build with it!

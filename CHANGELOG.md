# Changelog

All notable changes to feedseeker are documented here.

## [1.0.3] — 2026-06-13

### Features

- **deepSearch — sitemap seeding** (`68b9a68`): Before crawling, the crawler now fetches `robots.txt` to find a `Sitemap:` directive, falling back to `<origin>/sitemap.xml`. All same-domain URLs from the sitemap are seeded into the queue at depth 1, enabling discovery of pages that are only reachable via JavaScript rendering and would otherwise be missed by static link crawling.

### Bug Fixes

- **deepSearch — www/non-www variants crawled as separate pages** (`68b9a68`): `darioamodei.com/essay/foo` and `www.darioamodei.com/essay/foo` were treated as distinct URLs by the deduplication set, causing both to be fetched even though they resolve to the same content. Added `normalizeUrl()` which strips the `www.` prefix, URL fragments (`#section`), and trailing path slashes before storing in `enqueuedUrls` and `visitedUrls`, so all variants of the same page are deduplicated correctly.

- **deepSearch — relative links resolved against start URL instead of current page** (`68b9a68`): `enqueueLinks` used `this.startUrl` as the base for resolving relative hrefs. On pages under a different subdomain (e.g. `www.`), relative links were resolved against the wrong origin. The current page URL is now passed as the base.

- **deepSearch — race condition: queue could drain before `drain()` handler was registered** (`68b9a68`): With fast-resolving mocks (or a very fast network), the async queue could finish processing all tasks during `await crawler.start()`, before `crawler.queue.drain(finish)` was registered in the calling code. The promise would then never resolve. Fixed by pausing the queue in the constructor and resuming it at the end of `start()` after all initial URLs are pushed, ensuring the drain handler is always in place before any work begins.

---

## [1.0.2] — 2026-06-04

### Bug Fixes

- **deepSearch — feeds lost when crawl stops early** (`cf80606`): When the error limit or feed limit was reached, `queue.kill()` was called to halt the crawl. However, `kill()` does not trigger the queue's `drain` callback, so the promise wrapping the entire crawl never resolved. The process would hang indefinitely and all feeds discovered up to that point were discarded. Fixed by storing a `resolve` callback on the crawler instance and calling it from both kill sites, with a `settled` guard to prevent the `end` event from firing twice if `drain` also fires naturally.

- **deepSearch — duplicate URL fetches under concurrent crawling** (`739eea0`): URLs were only added to `visitedUrls` when a worker *began* processing them. With multiple workers running concurrently, several workers could each dequeue the same URL before any of them marked it as visited, resulting in duplicate HTTP requests and redundant feed checks. Fixed by introducing a separate `enqueuedUrls` set that is marked at push time; `visitedUrls` is now fetch-only and used for stats and reporting.

- **deepSearch — redundant fetch of start URL** (`cefc39a`): When `deepSearch` runs after `metaLinks`, `anchors`, or `blindSearch`, the `FeedSeeker` instance already holds the fetched and parsed HTML for the start URL. Previously `crawlPage` would issue a fresh HTTP request for the start URL anyway. Fixed by passing the cached `site` URL and `content` through `FeedSeekerInstance` so `crawlPage` can skip the network call for the page it already has.

- **CLI `--all` mode — per-strategy output was raw JSON** (`7b41be1`): When running with `--all`, each strategy's results were printed via `JSON.stringify()` mid-interactive output, producing a raw JSON dump inconsistent with the rest of the terminal UI. Replaced with `printFeeds()` for consistent human-readable formatting (title in cyan above URL, blank line between entries).

- **CLI `--all` mode — final summary never printed** (`7b41be1`): The `run()` function checked `opts.all` to decide whether to print the `=== All Strategies Complete ===` summary, but `CLIOptions` did not include an `all` property, causing the check to always evaluate as falsy. The summary block now executes correctly, printing the total unique feed count and the deduplicated list after all strategies complete.

- **Build — `feedseeker-cli.js` not marked executable** (`e270618`): The Vite build plugin only `chmod 0o755`'d the `.cjs` output. On systems using Snap's Node.js, relative entry-point paths are resolved from `/var/lib/snapd/void` rather than `$PWD`, causing `node feedseeker-cli.js` to fail unless the file has the executable bit set (so the shebang path is used instead). Both `.js` and `.cjs` CLI outputs are now made executable.

### Features

- **CLI — deepSearch completion summary** (`84867b7`): After the deep search crawler's async queue drains naturally, the CLI now prints `Done. Crawled N URLs.` so it is clear the crawl finished completely rather than stopping early due to an error or limit.

- **CLI — deepSearch stop-reason messages surfaced** (`84867b7`): Log messages emitted by the crawler when it stops early — `Stopped due to N errors (max M allowed).` and `Stopped due to reaching maximum feeds limit: N feeds found (max M allowed).` — were previously silently dropped by the CLI event handler. They are now printed to stdout so the user knows why the crawl ended.

- **CLI `--all` — final deduplicated summary** (`7b41be1`): After all four strategies complete, the CLI prints a summary section (`=== All Strategies Complete ===`, `Total unique feeds found: N`) followed by the full deduplicated feed list. Feeds that appear in multiple strategies are shown only once.

### Performance

- **deepSearch — eliminated double-fetch per crawled link** (`cefc39a`): `crawlPage` previously fetched each page once to extract links, then `checkFeed` fetched the same URL again to determine whether the response was a feed. Content is now passed directly from `crawlPage` to `checkFeed`, cutting HTTP requests roughly in half for pages that are checked as potential feeds.

- **deepSearch — replaced unbounded concurrency fan-out** (prior): Link processing previously used `Promise.allSettled` to fan out all links simultaneously with no concurrency cap. All link tasks are now pushed into the existing `async.queue` instance which enforces the configured concurrency limit, preventing request storms on large sites.

- **deepSearch — O(1) feed deduplication** (prior): Checking for duplicate feeds used an `Array.some()` linear scan. Replaced with a `Set`-based lookup so deduplication is O(1) regardless of how many feeds have been discovered.

- **deepSearch — option defaults respect `0` values** (prior): Option defaults were applied with `||` fallbacks, meaning explicitly passing `0` for `timeout`, `maxDepth`, `maxLinks`, `maxErrors`, or `maxFeeds` was silently overridden by the default. Switched to nullish coalescing (`??`) so `0` is treated as a valid value.

- **fetchWithTimeout — insecure TLS agent is now a singleton** (`a7f9f1b`): When `--insecure` is used, a new `undici.Agent` instance was created on every `fetchWithTimeout` call, defeating connection pooling and adding allocation overhead. The agent is now created once and cached in a module-level variable using `??=`.

### Tests

- Added 4 new tests for `--all` mode in `tests/feed-seeker-cli.test.ts`:
  - Per-strategy output uses `printFeeds` format (URL visible, no raw JSON)
  - Final summary header and total count are printed after all strategies complete
  - Feeds with the same URL found by multiple strategies are deduplicated in the final count
  - When no feeds are found across all strategies, exit code 2 is set

### Internal

- **deepSearch — `checkForeignFeeds` uses dedicated queue task type**: Foreign domain links are now pushed as `foreignOnly` tasks. Workers handle them by checking the URL as a potential feed without recursing into the page's links, preventing foreign domains from being crawled as if they were part of the target site.

- **deepSearch — option defaults use `??`**: `maxDepth`, `maxLinks`, `maxErrors`, `maxFeeds`, and `timeout` now use nullish coalescing in the `Crawler` constructor so that passing `0` explicitly is respected rather than silently replaced with the built-in default.

---

## [1.0.1] — 2026-03-15

### Fixed
- `checkFeed`: Removed arbitrary 15-second minimum timeout floor; any positive value is now accepted
- Default timeout aligned to 15 seconds across all callers
- README Library API section corrected to match actual behavior
- CLI options documentation updated

### CI
- SonarCloud analysis pipeline fixed
- SonarCloud project key corrected to `Latz_feedseeker`

### Chore
- Switched from npm to pnpm; removed `package-lock.json`
- Renamed dist output files from `feed-seeker.*` to `feedseeker.*`
- Removed stale tracked dist files
- Applied Prettier formatting

---

## [1.0.0] — 2026-01-09

Initial stable release of feedseeker (formerly FeedScout).

### Features
- **Meta link discovery** — detects feeds via `<link rel="alternate">` elements
- **Anchor-based discovery** — scans `<a>` tags for feed-like URLs
- **Blind search** — probes common feed path patterns in fast / standard / exhaustive modes
- **Deep search** — configurable BFS crawler with concurrency control, depth limit, and circuit breaker
- **Feed type detection** — RSS, Atom, and JSON Feed support with title extraction
- **CLI** — `feedseeker <url>` with `--deep`, `--depth`, `--max-feeds`, `--timeout`, `--insecure`, `--format`, and exit codes
- **Library API** — full TypeScript types, EventEmitter progress events, promise-based interface
- Node.js ≥ 22 required

### Internal
- Converted to TypeScript throughout
- Vitest test suite; 317 tests, 88%+ line coverage
- SonarCloud quality gate integration
- pnpm workspace with hoisted linker for coverage tooling

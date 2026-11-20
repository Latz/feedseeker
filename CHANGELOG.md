# Changelog

All notable changes to feedseeker are documented here.

## [1.1.0] — 2026-11-20

Version 1.0.4 was prepared but never published to npm. Its changes are part of this release (see "Prepared as 1.0.4" below).

### CLI command renamed

- **The CLI command is now `feedseeker`** (`957eec3`). The old name `feed-seeker` is kept as an alias, so existing scripts and global installs keep working.

### Features

- **Apple Podcasts support** (`aa66957`): `podcasts.apple.com/.../id<number>` URLs are resolved to the podcast's RSS feed via the public iTunes lookup API. Apple pages carry no feed link, so this previously found nothing.
- **`--verbose`** (`ca0d7a3`): Shows every candidate URL that was checked and why it was rejected (e.g. "200 OK but not a recognized feed", "content is an HTML page, not a feed"). Implies `--display-errors`.
- **Bot-protection detection** (`f11677f`, `ae93b09`, `ead5791`): Recognizes challenge pages (Cloudflare, Vercel and others) and tells you that a "no feeds found" result may be caused by bot protection rather than a missing feed. Blind search stops after repeated challenges instead of hanging.
- **TLS-fingerprint fallback** (`d8e41b5`): When a site still answers 403 after retries, one more attempt is made through the optional `node-wreq` dependency, which gets past fingerprint-only blocks. Disable with the hidden `--no-tls-spoof` flag.
- **Empty feeds are explained** (`8013b44`): A valid feed with no items yet is reported as such instead of "not a feed".
- **Site URL that is itself a feed** is returned directly, and the full search skips the remaining strategies in that case (`aa66957`).

### Performance

- **Downloads are bounded** (`ac1aee3`): The request timeout now also covers reading the response body; before, a slow or endless response (e.g. a linked MP3) could hang the search indefinitely. Responses announcing more than 10 MB are rejected without downloading.
- **Anchor search does less work** (`ac1aee3`): Each URL is checked once (repeated links and `#fragment` variants were fetched again and again; about half of all requests on typical news sites), and links to binary files (`.mp3`, `.pdf`, `.zip`, …) are skipped.
- **Worker pools instead of batches** (`2d5ff7d`): Blind search and anchor search no longer wait for the slowest request of a batch. Measured on netzpolitik.org: blind search 8.3s → ~2.3s, anchor search 7.1s → ~3.7s.
- **HTML pages are rejected early** (`2d5ff7d`): `checkFeed` recognizes an HTML document from its first 2 KB and no longer buffers and scans the whole page.
- **`--file` runs sites in parallel** for machine-readable output (`-q`, `--json`, `--format json/opml`): up to 5 at a time, results stay in file order (`394b6a8`). Interactive text output stays sequential.
- **`--check` no longer downloads each feed twice** (`6640215`).
- **Per-host request limits** (`3552427`, `73db494`, `1e486c0`): At most 2 concurrent requests per host, `x-ratelimit-*` headers are respected, and 403/429 responses are retried, so feedseeker no longer rate-limits itself out of finding feeds.

### Bug Fixes

- **The installed CLI did nothing** (`f162083`): when started through npm's bin symlink (every `npm install`, also `-g`), the ESM build exited silently without running. Found while testing the packed 1.1.0 tarball.
- **`--format json` and `--format opml` produced invalid output** (`394b6a8`): progress lines were printed to stdout before the document.
- **`findAll()` started every site at once** (`80d944c`): now at most 5 sites run concurrently.
- **RSS 1.0 / RDF feeds were not recognized** (`12c38c7`).
- **`--display-errors` / `--verbose` had no effect** on per-module errors (`495e1a7`).
- **The CommonJS CLI build silently did nothing** (`eeb5a82`).
- **Explicit `http://` sites** fall back to `https://` when plain HTTP fails (`723be66`), and redirects are followed for all later strategies (`ae93b09`).
- **Duplicate feeds** from candidate paths that redirect to the same feed are merged (`e776818`).
- Query strings on root URLs are preserved (`bebff72`); non-HTML responses no longer break anchor search (`cd00554`); a dead Shopify endpoint was corrected (`d3f6907`).

### Internal

- Package manager switched from pnpm to npm (`b726c2a`); TypeScript target/lib bumped to ESNext (`60402c1`).
- Large modules split into folders (`checkFeed/`, `blindsearch/`, `anchors/`, `cli/`); project files renamed from `feed-seeker` to `feedseeker`.
- Removed the unused `truncate-url` dependency and dead `modules/common.ts` (`bed13ea`).

### Prepared as 1.0.4 (never published)

#### Features

- **CLI `--file <path>` — batch mode for auditing multiple sites** (`fdd9428`): Reads a list of URLs from a plain-text file (one URL per line; blank lines and `#` comment lines are ignored) and searches each site (in parallel for machine-readable output since 1.1.0), aggregating all discovered feeds into a single result set. Combines with all output formats — `--format json`, `--format opml`, `--quiet` — so a full site audit can be piped or exported in one command.

- **Library `findAll(urls, options)` — parallel multi-site search** (`dd83bd2`): New named export that accepts an array of URLs, runs a `FeedSeeker` search for each concurrently (at most 5 at a time since 1.1.0), and returns `Promise<Map<string, Feed[]>>` where each key is the original input URL. Useful for programmatic audits without managing parallel instances manually.

- **CLI `-q` / `-f` short flags** (`940edd6`): Added `-q` as a short alias for `--quiet` and `-c` as a short alias for `--check`, consistent with common Unix CLI conventions.

- **CLI `--quiet` / `-q` — pipe-friendly output** (`25f408a`): Suppresses the banner, progress indicators, and decorative output; prints only feed URLs, one per line. Designed for use in shell pipelines (`feedseeker example.com -q | xargs ...`).

- **CLI `--format opml` — OPML export** (`c7582ba`): Outputs discovered feeds as a valid OPML 2.0 document, directly importable into any feed reader. Feed type (`rss`, `atom`, `json`) is preserved in the `type` attribute of each `<outline>` element.

#### Chore

- **Knip dead-code analysis added to `bin/check`** (`86c9177`): `bin/check` now runs ESLint, TypeScript type-checking, and Knip in sequence. All Knip findings in the codebase have been resolved — unused exports, unused re-exports, and transitive type-only imports are now clean.

- **Removed unused dependencies** (`86c9177`): `lint-staged` removed from `devDependencies`; replaced by direct `knip` and explicit `@eslint/js` version pin.

- **TypeScript target bumped to ES2022** (`86c9177`): Required for `Error.cause` support. Safe given `engines: { node: ">=22.0.0" }`.

---

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

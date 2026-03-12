# Feed-Seeker Performance Bottlenecks

**Analysed**: 2026-03-13
**Modules reviewed**: `deepSearch.ts`, `blindsearch.ts`, `anchors.ts`, `checkFeed.ts`, `metaLinks.ts`

---

## B1 — DONE: deepSearch `isValidUrl()` called twice per link ✅

**File**: `modules/deepSearch.ts`
**Status**: Fixed in commit cf79837

`processLink` previously called `this.isValidUrl(url)` twice for the same URL and same result. Fixed by caching in `const validUrl`. The duplicate `emitMaxLinksReached` log block was also extracted into a helper.

---

## B2 — DONE: `excludedFile()` rebuilds its extension array on every call ✅

**File**: `modules/deepSearch.ts`, lines 21–66
**Severity**: Medium
**Impact**: Called once per link via `isValidUrl()` → `excludedFile()`. With up to 1000 links per crawl, the 36-element `excludedExtensions` array is allocated 1000+ times per crawl, creating GC pressure.

**Root cause**: The `excludedExtensions` array is declared *inside* the function body, so a new array is allocated on every invocation.

```ts
function excludedFile(url: string): boolean {
    const excludedExtensions = [   // ← new array every call
        '.zip', '.rar', ...36 items...
    ];
    return excludedExtensions.some(extension => url.endsWith(extension));
}
```

**Fix**: Hoist `excludedExtensions` to module-level `const`, or replace with a `Set` for O(1) lookups. A `Set` also eliminates the `.some()` linear scan:

```ts
const EXCLUDED_EXTENSIONS = new Set(['.zip', '.rar', ...]);

function excludedFile(url: string): boolean {
    const lastDot = url.lastIndexOf('.');
    return lastDot !== -1 && EXCLUDED_EXTENSIONS.has(url.slice(lastDot).toLowerCase());
}
```

Note: current `.endsWith()` approach scans all 36 extensions each time; a `Set` lookup is O(1).

---

## B3 — `isValidUrl()` calls `tldts.getDomain(this.startUrl)` on every invocation

**File**: `modules/deepSearch.ts`, line 209
**Severity**: Medium
**Impact**: `this.startUrl` never changes during a crawl. `tldts.getDomain()` involves string parsing on every call. With 1000 links, this runs 1000 unnecessary parses.

```ts
isValidUrl(url: string): boolean {
    const sameDomain = tldts.getDomain(url) === tldts.getDomain(this.startUrl); // ← re-parsed every time
```

**Fix**: Cache `tldts.getDomain(this.startUrl)` in `this.mainDomain` (the field already exists at line 109 and is set in the constructor at line 141). Replace the inline call with the cached value:

```ts
const sameDomain = tldts.getDomain(url) === this.mainDomain;
```

`this.mainDomain` is already computed and stored — it just isn't being used in `isValidUrl()`.

---

## B4 — `processLink` in `crawlPage` runs serially (one link at a time)

**File**: `modules/deepSearch.ts`, lines 363–372
**Severity**: Medium–High
**Impact**: Each `<a>` tag on a page is processed one-at-a-time in a `for...of` loop with `await`. A page with 200 links takes 200 × (network round-trip for `checkFeed`) in series. The outer queue has concurrency=5 for pages, but within each page all link-checks are serial.

```ts
for (const link of document.querySelectorAll('a')) {
    const absoluteUrl = new URL(link.href, this.startUrl).href;
    const shouldStop = await this.processLink(absoluteUrl, depth);  // serial await
    if (shouldStop) break;
}
```

**Fix**: Batch the link-checks with `Promise.allSettled` (similar to how `blindSearch` and `anchors` do it), breaking when any result returns `shouldStop = true`. This trades exact ordering for throughput.

**Caveat**: The early-exit (`shouldStop`) needs care — a `Promise.allSettled` batch must still honour the stop signal after the batch completes.

---

## B5 — `blindsearch` validates `requestDelay` on every batch iteration

**File**: `modules/blindsearch.ts`, line 382
**Severity**: Low
**Impact**: `validateRequestDelay(instance.options?.requestDelay)` is called inside the `while` loop on every iteration. The options object never changes during a search. This is a minor inefficiency — validation logic runs repeatedly for a value that cannot change.

```ts
while (shouldContinueSearch(...)) {
    ...
    const requestDelay = validateRequestDelay(instance.options?.requestDelay);  // ← every iteration
```

**Fix**: Hoist `requestDelay` above the loop, computing it once before iteration begins.

---

## B6 — `anchors.ts`: `isAllowedDomain` rebuilds `allowedDomains` array on every call

**File**: `modules/anchors.ts`, lines 81–91
**Severity**: Low–Medium
**Impact**: The `allowedDomains` array (4 FeedBurner domains) is declared inside the function body. It is allocated on every anchor checked. For a page with 500 anchors, that's 500 fresh arrays and 500 `.includes()` + `.some()` scans.

```ts
function isAllowedDomain(url: string, baseUrl: URL): boolean {
    const allowedDomains = [   // ← new array every call
        'feedburner.com',
        'feeds.feedburner.com',
        'feedproxy.google.com',
        'feeds2.feedburner.com',
    ];
    return allowedDomains.includes(parsedUrl.hostname) || ...
}
```

**Fix**: Hoist to a module-level `const Set`. Same pattern as B2.

---

## B7 — `anchors.ts`: `parseUrlSafely` called 2–3 times per anchor

**File**: `modules/anchors.ts`
**Severity**: Low
**Impact**: For each anchor in `checkAnchors`, the URL goes through:
1. `getUrlFromAnchor` → calls `isValidHttpUrl` → calls `parseUrlSafely` (line 37)
2. `getUrlFromAnchor` → calls `isRelativePath` → calls `parseUrlSafely` (line 52)
3. `getUrlFromAnchor` → calls `parseUrlSafely` again for resolution if relative (line 137)
4. Then `isAllowedDomain` → calls `parseUrlSafely` again (line 68)

That's up to 4 `new URL(...)` constructions per anchor to determine a single resolved URL.

**Fix**: `getUrlFromAnchor` already returns the resolved URL string. Pass the parsed `URL` object through rather than re-parsing. Or restructure `getUrlFromAnchor` to parse once and return both the string and parsed object.

---

## B8 — `metaLinks.ts`: `typeSelectors` CSS selector string rebuilt on every `metaLinks()` call

**File**: `modules/metaLinks.ts`, line 206
**Severity**: Low
**Impact**: `FEED_TYPES.map((type) => \`link[type="application/${type}"]\`).join(', ')` constructs the selector string every time `metaLinks()` is called. Since `FEED_TYPES` is a module-level `const`, this string never changes.

```ts
const typeSelectors = FEED_TYPES.map((type) => `link[type="application/${type}"]`).join(', ');
```

**Fix**: Hoist to a module-level `const`:

```ts
const TYPE_SELECTORS = FEED_TYPES.map(t => `link[type="application/${t}"]`).join(', ');
```

---

## Summary Table

| ID | Module | Description | Severity | Fix Complexity |
|----|--------|-------------|----------|----------------|
| B1 | deepSearch | `isValidUrl()` double call | Medium | ✅ Done |
| B2 | deepSearch | `excludedFile()` array rebuilt per call | Medium | ✅ Done |
| B3 | deepSearch | `tldts.getDomain(startUrl)` re-parsed per call | Medium | Trivial |
| B4 | deepSearch | `processLink` serial within page | Medium–High | Medium |
| B5 | blindsearch | `validateRequestDelay` called per batch | Low | Trivial |
| B6 | anchors | `allowedDomains` array rebuilt per call | Low–Medium | Low |
| B7 | anchors | URL parsed 2–4× per anchor | Low | Low |
| B8 | metaLinks | CSS selector string rebuilt per call | Low | Trivial |

**Highest impact in order**: B4 > B3 > B2 > B6 > B7 > B5 > B8

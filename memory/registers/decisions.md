# Decisions Register

> Load when: past choices are being questioned, revisited, or built upon.
> Contains: architectural and workflow decisions with rationale and outcomes.

<!-- Add entries when decisions are made. Format:
## [Decision Title] — [Date]
- **Decision**: ...
- **Rationale**: ...
- **Alternatives Considered**: ...
- **Outcome**: ...
- **Status**: active | superseded | reversed
-->

## querySelectorAll generic over NodeListOf cast — 2026-03-08 ^tr5f1a8e3c9d

- **Decision**: Use `querySelectorAll<HTMLLinkElement>(selector)` instead of `querySelectorAll(selector) as NodeListOf<HTMLLinkElement>`
- **Rationale**: Type-safe — satisfies both TypeScript strict mode and SonarCloud S4325 (unnecessary assertion); the generic form carries type info without a cast
- **Alternatives Considered**: Post-hoc `as` cast (causes S4325), plain removal (causes TS2345)
- **Outcome**: Applied in `modules/metaLinks.ts` and `modules/anchors.ts`
- **Status**: active

## eventEmitter S1444 (#defaultMaxListeners) is permanently unresolvable — 2026-03-08 ^tr2e7b0d4f1c

- **Decision**: Do NOT add `readonly` to `static #defaultMaxListeners` in `modules/eventEmitter.ts`
- **Rationale**: TypeScript TS2540 — the field is mutated by `setDefaultMaxListeners()`; adding `readonly` would break the public API
- **Alternatives Considered**: Adding `readonly` (compile error), suppressing with `// @ts-ignore` (not acceptable)
- **Outcome**: S1444 left unresolved; documented as a known, permanent SonarCloud finding
- **Status**: active

## TypeScript test files supersede JS equivalents — 2026-03-10 ^trf6e60a2d5f

- **Decision**: When a `.test.ts` file exists, the corresponding `.test.js` file must be deleted — do not maintain both
- **Rationale**: Empty .js files caused "No test suite found" errors in Vitest; .ts versions are the canonical source of truth
- **Alternatives Considered**: Excluding .js files via vitest config (adds fragile config), keeping both (causes failures)
- **Outcome**: 4 .js test files removed, 301 tests passing
- **Status**: active

## deepSearch crawlPage parallelises link processing — 2026-03-13 ^tra3c7f9e2b1

- **Decision**: Replace serial `for...of/await` loop in `crawlPage` with `Promise.allSettled` over all links on a page
- **Rationale**: A page with 200 links previously took 200× checkFeed latency in series; now takes ~1×. The outer async queue already has concurrency=5 for pages; this fix adds concurrency within each page too.
- **Alternatives Considered**: Serial loop (original); keeping queue.kill() after allSettled (caused drain deadlock)
- **Outcome**: 304 tests pass; maxInFlight test confirms concurrent execution
- **Status**: active

## --insecure flag via undici Agent — 2026-03-13 ^trb1f3a9e07c

- **Decision**: Implement `--insecure` (like `curl -k`) by passing `undici.Agent({ connect: { rejectUnauthorized: false } })` as dispatcher through `fetchWithTimeout`; also removed dead `FeedFinder.options = options` line that clobbered constructor's `timeout: 5` default
- **Rationale**: Enables feed discovery on sites with self-signed or expired TLS certs; dead code removal fixes latent bug where explicit `timeout` option would be overwritten (see plan #161)
- **Alternatives Considered**: Node `https.Agent` (not compatible with native `fetch`), `NODE_TLS_REJECT_UNAUTHORIZED=0` env var (global, unsafe)
- **Outcome**: Committed `5993f33`; 308 tests pass, tsc clean
- **Status**: active

## checkFeed timeout: removed minimum, any positive value accepted — 2026-03-15 ^trc4e7a1f082

- **Decision**: Remove `MIN_TIMEOUT: 15` from `checkFeed.ts`; any positive timeout passes through as-is; zero/invalid falls back to `DEFAULT_TIMEOUT` (15s)
- **Rationale**: The 15s minimum was arbitrary and caused spurious warnings whenever the default 5s was passed; callers should control their own timeout
- **Alternatives Considered**: Keeping minimum (causes warnings), raising all defaults to match minimum (done as intermediate step, then reverted)
- **Outcome**: Committed `2f15583`; 308 tests pass; no more timeout warnings in normal use
- **Status**: active

## GitHub repo renamed feed-seeker → feedseeker — 2026-03-15 ^tr9b3d6e5f1a

- **Decision**: Rename GitHub repository from `feed-seeker` to `feedseeker` (no hyphen)
- **Rationale**: Consistent with npm package name `feedseeker`; SonarCloud project key `Latz_feedseeker` already used underscore
- **Alternatives Considered**: Keeping hyphenated name (inconsistent with package name)
- **Outcome**: Remote URL updated to `https://github.com/Latz/feedseeker.git`; GitHub auto-redirects old URLs
- **Status**: active

## Dropped integration tests were fake — no restoration needed — 2026-03-23 ^tre2a7f3c1b9

- **Decision**: Do not restore the 14 integration tests dropped during the JS→TS migration
- **Rationale**: All 14 were fake — they tested JS builtins (`new URL()`, array spread, object merge), contained vacuous assertions (`expect(x.includes(y))` without `.toBeTruthy()`), or simulated their own mini event emitter unconnected to FeedSeeker. The 6 remaining `.ts` tests are substantively better.
- **Alternatives Considered**: Restoring the tests (adds noise, masks real gaps); rewriting the original tests (done instead — 9 real coverage-gap tests added)
- **Outcome**: 9 new tests added targeting actual uncovered lines; 317 tests passing; feed-seeker.ts at 100% line coverage
- **Status**: active

## Concurrent anchor checking with Promise.allSettled — 2026-03-08 ^tr4a9f2c1e8b

- **Decision**: Replace serial `for...of` loops in `modules/anchors.ts` (Phase 1: anchor tags, Phase 2: plain-text URLs) with batched `Promise.allSettled` pattern
- **Rationale**: Performance improvement — parallel requests instead of sequential; consistent with concurrency pattern used elsewhere in codebase
- **Alternatives Considered**: Serial for...of loops (original implementation)
- **Outcome**: All 8 tests pass; concurrency default `instance.options?.concurrency ?? 3`
- **Status**: active

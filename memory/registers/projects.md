# Projects Register

> Load when: a specific project is being discussed or worked on.
> Contains: project state, goals, key decisions, blockers, next steps.

## feed-seeker ^trb8d4e2f0c6
- **Status**: active
- **Goal**: TypeScript RSS/Atom/JSON feed discovery library with CLI
- **Current State** (2026-03-13): 306 tests passing across 13 test files; `tsc --noEmit` clean; `pnpm run build` succeeds; SonarCloud remediation complete; performance bottlenecks B3–B7 fixed
- **Key Decisions**: Lazy-load STANDARD/COMPREHENSIVE endpoint arrays in blindsearch.ts; Vitest as test runner; ES2021 target for `replaceAll()` support; concurrent anchor checking with `Promise.allSettled`; TypeScript test files are canonical (delete .js equivalents); exit codes 0/1/2; crawlPage parallelises link processing with Promise.allSettled
- **Blockers**: S1444 on `eventEmitter.ts` is permanently unresolvable (see decisions.md)
- **Recent Changes** (2026-03-13):
  - B3: cache `tldts.getDomain(startUrl)` → `this.mainDomain` in `isValidUrl()` (deepSearch)
  - B4: parallelize `processLink` calls in `crawlPage` with `Promise.allSettled` (deepSearch)
  - B5: hoist `validateRequestDelay` above while loop (blindsearch)
  - B6: hoist `allowedDomains` to module-level `ALLOWED_DOMAINS` Set (anchors)
  - B7: eliminate redundant `getUrlFromAnchor` call per anchor — pass resolved URL through (anchors)
- **Next Steps**: Consider OPML output format, multi-site input, `--type` filtering; fix B8 (metaLinks CSS selector)

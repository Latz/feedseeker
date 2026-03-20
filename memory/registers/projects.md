# Projects Register

> Load when: a specific project is being discussed or worked on.
> Contains: project state, goals, key decisions, blockers, next steps.

## feed-seeker ^trb8d4e2f0c6

- **Status**: active
- **Goal**: TypeScript RSS/Atom/JSON feed discovery library with CLI
- **Current State** (2026-03-15): 308 tests passing across 13 test files; `tsc --noEmit` clean; `pnpm run build` succeeds; SonarCloud remediation complete; performance bottlenecks B3–B7 fixed; v1.0.1 released
- **Key Decisions**: Lazy-load STANDARD/COMPREHENSIVE endpoint arrays in blindsearch.ts; Vitest as test runner; ES2021 target for `replaceAll()` support; concurrent anchor checking with `Promise.allSettled`; TypeScript test files are canonical (delete .js equivalents); exit codes 0/1/2; crawlPage parallelises link processing with Promise.allSettled; checkFeed has no minimum timeout
- **Blockers**: S1444 on `eventEmitter.ts` is permanently unresolvable (see decisions.md)
- **Recent Changes** (2026-03-15):
  - GitHub repo renamed `feed-seeker` → `feedseeker`; remote URL updated
  - Default timeout raised to 15s; `MIN_TIMEOUT` removed from `checkFeed.ts` — any positive value accepted
  - SonarCloud S6551 fixed in `eventEmitter.ts` (`String(error)` → `'[unserializable object]'`)
  - README synced: `deepSearch()` takes no args, `Feed` interface corrected, all options documented
  - v1.0.1 released on GitHub
- **Next Steps**: Consider OPML output format, multi-site input, `--type` filtering; fix B8 (metaLinks CSS selector)

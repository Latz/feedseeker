# Open Loops Register

> Load when: every session (auto-load).
> Contains: active follow-ups, open commitments, deadlines, things to revisit.

## Active
- [ ] Integration test coverage reduction — 14 of 20 original tests dropped when migrating to .ts; review whether feed structure / error handling tests should be restored
- [ ] Consider implementing: OPML output (`--format opml`), multi-site file input (`--file sites.txt`), `--type` filtering — identified as highest-value CLI features

## Completed
- [x] SonarCloud issue remediation across all 7 modules — completed 2026-03-08
- [x] Migrate .js test files to .ts — completed 2026-03-10
- [x] Fix build: SearchMode type, CLIOptions typing, rimraf install — completed 2026-03-10
- [x] Normalise niceName casing to title-case across all modules — completed 2026-03-10

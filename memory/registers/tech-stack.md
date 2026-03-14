# Tech Stack Register

> Load when: technical choices, languages, frameworks, or tooling come up.
> Contains: confirmed tech choices, constraints, version requirements, tool preferences.

<!-- Add entries when technical choices are confirmed. Format:
## [Category]
- **Choice**: ...
- **Version**: ...
- **Rationale**: ...
- **Constraints**: ...
-->

## CLI niceName convention — 2026-03-10 ^tr4c859fa74e
- **Choice**: All four search module `niceName` values use title-case
- **Values**: `'Meta Links'`, `'Blind Search'`, `'Deep Search'`, `'Check All Anchors'`
- **Rationale**: Displayed verbatim in CLI progress output (`Starting <niceName>`); consistent casing looks professional
- **Constraints**: Must update if new search modules are added
- **Status**: active

## CLI exit codes — 2026-03-10 ^trd4e4e791d6
- **Choice**: `0` = feeds found, `2` = search succeeded but no feeds found, `1` = error/unhandled exception
- **Rationale**: Allows scripts to distinguish "empty result" from "failure" without parsing stdout
- **Constraints**: `process.exit(2)` called in `run()` after JSON/human output is written; `--json` mode still prints `[]` before exiting 2
- **Status**: active

## Test Runner — 2026-03-08 ^tr7c3e9f1d2a
- **Choice**: Vitest (`vitest run`)
- **Rationale**: Replaced Node built-in test runner; better DX, native ESM support, compatible with existing test files
- **Constraints**: `package.json` `"test"` script must remain `"vitest run"`
- **Status**: active

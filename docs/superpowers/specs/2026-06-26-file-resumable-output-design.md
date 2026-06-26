# Design: Crash-resumable `--file` processing with incremental output

**Date:** 2026-06-26  
**Status:** Approved

## Overview

When `--file <path>` is used to process a list of URLs, the CLI writes results incrementally to a derived output file after each URL completes. If the process crashes, re-running with the same `--file` resumes from where it left off — already-processed URLs are skipped.

## Output File Path

Derived automatically from the input file path. The extension is replaced with `.results.json`. If there is no extension, `.results.json` is appended.

Examples:
- `sites.txt` → `sites.results.json`
- `urls` → `urls.results.json`
- `data/feeds.list` → `data/feeds.results.json`

No `--output` flag is added. The path is always derived.

## Output File Format

A JSON array where each element represents one processed input URL:

```json
[
  {
    "sourceUrl": "https://example.com",
    "feeds": [
      { "url": "https://example.com/feed.xml", "type": "rss", "title": null, "feedTitle": null }
    ]
  },
  {
    "sourceUrl": "https://other.com",
    "feeds": []
  }
]
```

- One entry per input URL, regardless of whether feeds were found.
- Zero-feed entries are recorded so they are not re-processed on resume.
- `sourceUrl` is the URL as read from the input file (before `https://` is prepended).

## Resume Logic

On startup with `--file`:

1. Derive the output file path from the input file path.
2. If the output file exists, read and parse it. Collect the set of `sourceUrl` values already present.
3. Read all URLs from the input file.
4. Skip any URL whose value (as read from the file) is already in the processed set.
5. Process remaining URLs in order.

After each URL completes:

1. Append the new result object `{ sourceUrl, feeds }` to the in-memory results array.
2. Write the full array to a temporary file (`<outputPath>.tmp`).
3. Rename the temporary file to the output file (atomic on POSIX systems).

This ensures the output file always contains a valid, complete JSON array.

## New Module: `modules/fileOutput.ts`

Encapsulates all output-file logic, keeping the CLI action handler clean.

### Exports

```ts
export interface UrlResult {
  sourceUrl: string;
  feeds: Feed[];
}

// Read existing output file; returns [] if file does not exist or is invalid JSON.
export async function readOutputFile(outputPath: string): Promise<UrlResult[]>;

// Write results array atomically (tmp + rename).
export async function writeOutputFile(outputPath: string, results: UrlResult[]): Promise<void>;

// Derive output path from input file path.
export function deriveOutputPath(inputPath: string): string;
```

### Error handling

- `readOutputFile`: if the file exists but cannot be parsed, log a warning to stderr and return `[]` (start fresh rather than crash).
- `writeOutputFile`: propagate errors — a failed write is fatal (the caller should surface it).

## Changes to `feed-seeker-cli.ts`

The `--file` branch in the action handler is updated:

```ts
if (options.file) {
  const urls = await readUrlsFromFile(options.file);
  const outputPath = deriveOutputPath(options.file);
  const existingResults = await readOutputFile(outputPath);
  const processedUrls = new Set(existingResults.map(r => r.sourceUrl));

  const allResults: UrlResult[] = [...existingResults];

  for (const url of urls) {
    if (processedUrls.has(url)) continue;
    const feeds = await getFeeds(url, options, ctx);
    allResults.push({ sourceUrl: url, feeds });
    await writeOutputFile(outputPath, allResults);
  }

  program.feeds = allResults.flatMap(r => r.feeds);
  program.site = options.file;
}
```

The final `program.feeds` is the flat list of all feeds across all URLs (same shape as before for downstream formatting).

## Progress Messaging

When not in `--quiet` mode, print to stdout before processing begins:

- If resuming: `Resuming from <outputPath> (N URLs already processed, M remaining)`
- If starting fresh: `Writing results to <outputPath>`

## Tests

New tests in `feed-seeker-cli.test.ts` (and unit tests in a new `fileOutput.test.ts`):

| Test | What it verifies |
|------|-----------------|
| Output file created on first run | `sites.txt` → `sites.results.json` exists after run |
| Zero-feed URL recorded | Entry with `feeds: []` is written |
| Resume skips processed URLs | Second run with same file skips already-done URLs |
| Corrupt output file handled | Warning logged, run starts fresh |
| Atomic write | `.tmp` file is renamed, not left behind |
| `deriveOutputPath` | Extension replacement and no-extension cases |

## Out of Scope

- `--output <path>` flag (not needed; path is always derived)
- OPML or text output format for the incremental file (always JSON array)
- Parallelising URL processing (sequential order preserved for resumability)

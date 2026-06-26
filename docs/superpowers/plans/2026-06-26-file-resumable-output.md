# File-Resumable Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When `--file <path>` is used, write results incrementally to a derived output file after each URL completes so a crashed run can resume without reprocessing completed URLs.

**Architecture:** A new `modules/fileOutput.ts` module handles all file I/O: deriving the output path, reading existing results, and atomically writing the updated array (write to `.tmp`, rename). The CLI `--file` branch reads this file on startup to skip already-processed URLs and calls `writeOutputFile` after each URL finishes.

**Tech Stack:** TypeScript, Node.js `node:fs/promises` (`readFile`, `writeFile`, `rename`), Vitest for tests.

## Global Constraints

- Test runner: `pnpm run test` (`vitest run`) — never `npm run`
- TypeScript strict mode — `tsc --noEmit` must pass
- No new runtime dependencies
- `querySelectorAll<T>()` generic form only — never `as NodeListOf<T>`
- Node.js ≥ 22

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `modules/fileOutput.ts` | **Create** | `deriveOutputPath`, `readOutputFile`, `writeOutputFile`, `UrlResult` interface |
| `tests/fileOutput.test.ts` | **Create** | Unit tests for all three exports |
| `feed-seeker-cli.ts` | **Modify** | Import `fileOutput`, update `--file` branch, add progress messages |
| `tests/feed-seeker-cli.test.ts` | **Modify** | Add tests for incremental write, resume, corrupt file, zero-feed recording |

---

## Task 1: `modules/fileOutput.ts` — new module with full unit tests

**Files:**
- Create: `modules/fileOutput.ts`
- Create: `tests/fileOutput.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface UrlResult {
    sourceUrl: string;
    feeds: Feed[];
  }
  export function deriveOutputPath(inputPath: string): string;
  export async function readOutputFile(outputPath: string): Promise<UrlResult[]>;
  export async function writeOutputFile(outputPath: string, results: UrlResult[]): Promise<void>;
  ```

- [ ] **Step 1: Write failing tests for `deriveOutputPath`**

Create `tests/fileOutput.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { deriveOutputPath, readOutputFile, writeOutputFile } from '../modules/fileOutput.ts';
import type { UrlResult } from '../modules/fileOutput.ts';

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
}));

import { readFile, writeFile, rename } from 'node:fs/promises';
import type { Mock } from 'vitest';

describe('deriveOutputPath', () => {
  it('replaces extension with .results.json', () => {
    expect(deriveOutputPath('sites.txt')).toBe('sites.results.json');
  });

  it('replaces multi-part extension', () => {
    expect(deriveOutputPath('data/feeds.list')).toBe('data/feeds.results.json');
  });

  it('appends .results.json when no extension', () => {
    expect(deriveOutputPath('urls')).toBe('urls.results.json');
  });

  it('handles path with directory', () => {
    expect(deriveOutputPath('/home/user/sites.txt')).toBe('/home/user/sites.results.json');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm run test tests/fileOutput.test.ts
```

Expected: FAIL — `Cannot find module '../modules/fileOutput.ts'`

- [ ] **Step 3: Create `modules/fileOutput.ts` with `deriveOutputPath`**

```ts
import { readFile, writeFile, rename } from 'node:fs/promises';
import { type Feed } from './metaLinks.ts';
import path from 'node:path';

export interface UrlResult {
  sourceUrl: string;
  feeds: Feed[];
}

export function deriveOutputPath(inputPath: string): string {
  const ext = path.extname(inputPath);
  const base = ext ? inputPath.slice(0, -ext.length) : inputPath;
  return `${base}.results.json`;
}

export async function readOutputFile(outputPath: string): Promise<UrlResult[]> {
  try {
    const content = await readFile(outputPath, 'utf-8');
    return JSON.parse(content) as UrlResult[];
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    console.error(`Warning: could not parse ${outputPath}, starting fresh.`);
    return [];
  }
}

export async function writeOutputFile(outputPath: string, results: UrlResult[]): Promise<void> {
  const tmpPath = `${outputPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(results, null, 2), 'utf-8');
  await rename(tmpPath, outputPath);
}
```

- [ ] **Step 4: Run `deriveOutputPath` tests to verify they pass**

```bash
pnpm run test tests/fileOutput.test.ts
```

Expected: 4 passing tests in the `deriveOutputPath` suite.

- [ ] **Step 5: Write failing tests for `readOutputFile`**

Append to `tests/fileOutput.test.ts`:

```ts
describe('readOutputFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns [] when file does not exist', async () => {
    (readFile as unknown as Mock).mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    );
    const result = await readOutputFile('missing.json');
    expect(result).toEqual([]);
  });

  it('returns parsed array when file exists', async () => {
    const data: UrlResult[] = [{ sourceUrl: 'https://example.com', feeds: [] }];
    (readFile as unknown as Mock).mockResolvedValue(JSON.stringify(data));
    const result = await readOutputFile('output.json');
    expect(result).toEqual(data);
  });

  it('returns [] and warns when file contains invalid JSON', async () => {
    const warnSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (readFile as unknown as Mock).mockResolvedValue('not json {{{');
    const result = await readOutputFile('corrupt.json');
    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('corrupt.json'));
    warnSpy.mockRestore();
  });
});
```

- [ ] **Step 6: Run to verify `readOutputFile` tests fail**

```bash
pnpm run test tests/fileOutput.test.ts
```

Expected: 3 new failures in `readOutputFile` suite.

- [ ] **Step 7: Run all `fileOutput` tests to verify they now pass**

```bash
pnpm run test tests/fileOutput.test.ts
```

Expected: All 7 tests passing (`deriveOutputPath` × 4, `readOutputFile` × 3).

- [ ] **Step 8: Write failing tests for `writeOutputFile`**

Append to `tests/fileOutput.test.ts`:

```ts
describe('writeOutputFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (writeFile as unknown as Mock).mockResolvedValue(undefined);
    (rename as unknown as Mock).mockResolvedValue(undefined);
  });

  it('writes to a .tmp file then renames to final path', async () => {
    const results: UrlResult[] = [{ sourceUrl: 'https://example.com', feeds: [] }];
    await writeOutputFile('output.json', results);

    expect(writeFile).toHaveBeenCalledWith(
      'output.json.tmp',
      JSON.stringify(results, null, 2),
      'utf-8'
    );
    expect(rename).toHaveBeenCalledWith('output.json.tmp', 'output.json');
  });

  it('propagates errors from writeFile', async () => {
    (writeFile as unknown as Mock).mockRejectedValue(new Error('disk full'));
    await expect(writeOutputFile('output.json', [])).rejects.toThrow('disk full');
  });
});
```

- [ ] **Step 9: Run to verify `writeOutputFile` tests fail**

```bash
pnpm run test tests/fileOutput.test.ts
```

Expected: 2 new failures in `writeOutputFile` suite.

- [ ] **Step 10: Run all `fileOutput` tests to verify they pass**

```bash
pnpm run test tests/fileOutput.test.ts
```

Expected: All 9 tests passing.

- [ ] **Step 11: Typecheck**

```bash
pnpm run typecheck
```

Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add modules/fileOutput.ts tests/fileOutput.test.ts
git commit -m "feat: add fileOutput module for crash-resumable --file processing"
```

---

## Task 2: Update CLI `--file` branch with incremental writes and resume

**Files:**
- Modify: `feed-seeker-cli.ts` (lines 367–379 — the `if (options.file)` block)
- Modify: `tests/feed-seeker-cli.test.ts` (add to `--file flag` describe block)

**Interfaces:**
- Consumes from Task 1:
  ```ts
  import { deriveOutputPath, readOutputFile, writeOutputFile, type UrlResult } from './modules/fileOutput.ts';
  ```
- The existing `--file` tests mock `node:fs/promises` via `vi.mock('node:fs/promises', ...)`. The new `fileOutput` module also uses `node:fs/promises`, so the CLI tests must additionally mock `../modules/fileOutput.ts` directly to isolate CLI logic from file I/O.

- [ ] **Step 1: Write failing CLI tests for incremental output**

In `tests/feed-seeker-cli.test.ts`, add a mock for `fileOutput` at the top (alongside the other `vi.mock` calls):

```ts
vi.mock('../modules/fileOutput.ts', () => ({
  deriveOutputPath: vi.fn(),
  readOutputFile: vi.fn(),
  writeOutputFile: vi.fn(),
}));
```

Add the import near the other module imports:

```ts
import { deriveOutputPath, readOutputFile, writeOutputFile } from '../modules/fileOutput.ts';
```

Then add tests inside the existing `describe('--file flag', ...)` block, after the existing tests:

```ts
it('writes results to derived output file after each URL', async () => {
  const fileFeed1: Feed = { url: 'https://site1.com/feed.xml', type: 'rss', title: null, feedTitle: null };

  (readFile as unknown as Mock).mockResolvedValue('https://site1.com\n');
  (metaLinksMod as Mock).mockResolvedValue([fileFeed1]);
  (deriveOutputPath as unknown as Mock).mockReturnValue('/tmp/sites.results.json');
  (readOutputFile as unknown as Mock).mockResolvedValue([]);
  (writeOutputFile as unknown as Mock).mockResolvedValue(undefined);

  const argv = ['node', 'feed-seeker-cli.ts', '--file', '/tmp/sites.txt', '--metasearch', '--json'];
  await run(argv);

  expect(writeOutputFile).toHaveBeenCalledWith(
    '/tmp/sites.results.json',
    [{ sourceUrl: 'https://site1.com', feeds: [fileFeed1] }]
  );
});

it('skips URLs already present in the output file on resume', async () => {
  const fileFeed1: Feed = { url: 'https://site1.com/feed.xml', type: 'rss', title: null, feedTitle: null };
  const fileFeed2: Feed = { url: 'https://site2.com/atom.xml', type: 'atom', title: null, feedTitle: null };

  (readFile as unknown as Mock).mockResolvedValue('https://site1.com\nhttps://site2.com\n');
  (deriveOutputPath as unknown as Mock).mockReturnValue('/tmp/sites.results.json');
  (readOutputFile as unknown as Mock).mockResolvedValue([
    { sourceUrl: 'https://site1.com', feeds: [fileFeed1] }
  ]);
  (writeOutputFile as unknown as Mock).mockResolvedValue(undefined);
  (metaLinksMod as Mock).mockResolvedValue([fileFeed2]);

  const argv = ['node', 'feed-seeker-cli.ts', '--file', '/tmp/sites.txt', '--metasearch', '--json'];
  await run(argv);

  // metaLinks should only be called once (for site2, not site1)
  expect(metaLinksMod).toHaveBeenCalledTimes(1);

  // writeOutputFile called with both results combined
  expect(writeOutputFile).toHaveBeenCalledWith(
    '/tmp/sites.results.json',
    [
      { sourceUrl: 'https://site1.com', feeds: [fileFeed1] },
      { sourceUrl: 'https://site2.com', feeds: [fileFeed2] },
    ]
  );
});

it('records zero-feed URLs so they are not reprocessed on resume', async () => {
  (readFile as unknown as Mock).mockResolvedValue('https://site1.com\n');
  (metaLinksMod as Mock).mockResolvedValue([]);
  (deriveOutputPath as unknown as Mock).mockReturnValue('/tmp/sites.results.json');
  (readOutputFile as unknown as Mock).mockResolvedValue([]);
  (writeOutputFile as unknown as Mock).mockResolvedValue(undefined);

  const argv = ['node', 'feed-seeker-cli.ts', '--file', '/tmp/sites.txt', '--metasearch', '--json'];
  await run(argv);

  expect(writeOutputFile).toHaveBeenCalledWith(
    '/tmp/sites.results.json',
    [{ sourceUrl: 'https://site1.com', feeds: [] }]
  );
});

it('prints resume message when existing output file has entries', async () => {
  const fileFeed2: Feed = { url: 'https://site2.com/atom.xml', type: 'atom', title: null, feedTitle: null };

  (readFile as unknown as Mock).mockResolvedValue('https://site1.com\nhttps://site2.com\n');
  (deriveOutputPath as unknown as Mock).mockReturnValue('/tmp/sites.results.json');
  (readOutputFile as unknown as Mock).mockResolvedValue([
    { sourceUrl: 'https://site1.com', feeds: [] }
  ]);
  (writeOutputFile as unknown as Mock).mockResolvedValue(undefined);
  (metaLinksMod as Mock).mockResolvedValue([fileFeed2]);

  const argv = ['node', 'feed-seeker-cli.ts', '--file', '/tmp/sites.txt', '--metasearch'];
  await run(argv);

  const allOutput = stdoutWriteSpy.mock.calls.flat().join('') +
    consoleLogSpy.mock.calls.flat().join('');
  expect(allOutput).toMatch(/Resuming from.*1.*already processed.*1.*remaining/i);
});

it('prints "Writing results" message on fresh run', async () => {
  (readFile as unknown as Mock).mockResolvedValue('https://site1.com\n');
  (deriveOutputPath as unknown as Mock).mockReturnValue('/tmp/sites.results.json');
  (readOutputFile as unknown as Mock).mockResolvedValue([]);
  (writeOutputFile as unknown as Mock).mockResolvedValue(undefined);
  (metaLinksMod as Mock).mockResolvedValue([]);

  const argv = ['node', 'feed-seeker-cli.ts', '--file', '/tmp/sites.txt', '--metasearch'];
  await run(argv);

  const allOutput = stdoutWriteSpy.mock.calls.flat().join('') +
    consoleLogSpy.mock.calls.flat().join('');
  expect(allOutput).toMatch(/Writing results to.*sites\.results\.json/i);
});
```

- [ ] **Step 2: Run to verify new tests fail**

```bash
pnpm run test tests/feed-seeker-cli.test.ts
```

Expected: 5 new failures. Existing tests still pass.

- [ ] **Step 3: Update `feed-seeker-cli.ts` — add import**

At the top of `feed-seeker-cli.ts`, after the existing imports, add:

```ts
import { deriveOutputPath, readOutputFile, writeOutputFile, type UrlResult } from './modules/fileOutput.ts';
```

- [ ] **Step 4: Update the `--file` branch in `feed-seeker-cli.ts`**

Replace the existing `if (options.file)` block (lines 367–379):

```ts
// Before:
if (options.file) {
  const urls = await readUrlsFromFile(options.file);
  const allFeeds: Feed[] = [];
  for (const url of urls) {
    const feeds = await getFeeds(url, options, ctx);
    allFeeds.push(...feeds);
  }
  program.feeds = allFeeds;
  program.site = options.file;
}
```

With:

```ts
if (options.file) {
  const urls = await readUrlsFromFile(options.file);
  const outputPath = deriveOutputPath(options.file);
  const existingResults = await readOutputFile(outputPath);
  const processedUrls = new Set(existingResults.map((r) => r.sourceUrl));
  const remaining = urls.filter((u) => !processedUrls.has(u));

  if (!ctx.quiet) {
    if (existingResults.length > 0) {
      process.stdout.write(
        `Resuming from ${outputPath} (${existingResults.length} URLs already processed, ${remaining.length} remaining)\n`
      );
    } else {
      process.stdout.write(`Writing results to ${outputPath}\n`);
    }
  }

  const allResults: UrlResult[] = [...existingResults];

  for (const url of remaining) {
    const feeds = await getFeeds(url, options, ctx);
    allResults.push({ sourceUrl: url, feeds });
    await writeOutputFile(outputPath, allResults);
  }

  program.feeds = allResults.flatMap((r) => r.feeds);
  program.site = options.file;
}
```

- [ ] **Step 5: Run CLI tests to verify new tests pass**

```bash
pnpm run test tests/feed-seeker-cli.test.ts
```

Expected: All tests pass, including the 5 new ones and all existing tests.

- [ ] **Step 6: Run full test suite**

```bash
pnpm run test
```

Expected: All 317+ tests pass (317 existing + 9 fileOutput + 5 new CLI tests).

- [ ] **Step 7: Typecheck**

```bash
pnpm run typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add feed-seeker-cli.ts tests/feed-seeker-cli.test.ts
git commit -m "feat: write --file results incrementally with crash-resume support"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Output file path derived from input path — `deriveOutputPath` in Task 1
- [x] JSON array format with `{ sourceUrl, feeds }` entries — `UrlResult` in Task 1
- [x] Read existing file on startup, skip processed URLs — Task 2 Step 4
- [x] Write atomically (tmp + rename) after each URL — `writeOutputFile` in Task 1
- [x] Zero-feed URLs recorded — tested in Task 2
- [x] Corrupt file: warn + start fresh — tested in Task 1 Step 5
- [x] Progress messages (resuming / writing) — Task 2 Step 4 + tests
- [x] `program.feeds` remains flat `Feed[]` for downstream formatting — Task 2 Step 4

**No placeholders:** No TBDs, all code blocks complete.

**Type consistency:** `UrlResult` defined once in `fileOutput.ts`, imported as `type UrlResult` in CLI. `deriveOutputPath`, `readOutputFile`, `writeOutputFile` signatures used identically in both tasks.

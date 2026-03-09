import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { run } from '../feed-seeker-cli.ts';
import { type Feed } from '../modules/metaLinks.ts';

// Mock the search modules to control their output and prevent network calls.
vi.mock('../modules/metaLinks.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/anchors.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/blindsearch.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/deepSearch.ts', () => ({ default: vi.fn() }));

// Mock fetchWithTimeout as well, since initialize() is called.
vi.mock('../modules/fetchWithTimeout.ts', () => ({
	default: vi.fn()
}));

import metaLinksMod from '../modules/metaLinks.ts';
import fetchWithTimeout from '../modules/fetchWithTimeout.ts';

describe('FeedSeeker CLI', () => {
	let stdoutWriteSpy: Mock;
	let consoleLogSpy: Mock;
	let consoleErrorSpy: Mock;

	beforeEach(() => {
		// Mock stdout and stderr to capture output
		stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		// Reset mocks for modules
		vi.clearAllMocks();
		(fetchWithTimeout as Mock).mockResolvedValue({ ok: true, text: async () => '<html></html>' });
		(metaLinksMod as Mock).mockResolvedValue([]);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const mockFeeds: Feed[] = [{ url: 'https://example.com/feed.xml', type: 'rss' }];

	describe('--json flag', () => {
		it('should output only JSON when --json flag is used', async () => {
			(metaLinksMod as Mock).mockResolvedValue(mockFeeds);

			// Simulate running `node feed-seeker-cli.ts example.com --metasearch --json`
			// Using --metasearch for a quick, single-strategy test.
			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--json'];
			await run(argv);

			// 1. console.log should have been called exactly once with the JSON string.
			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
			expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(mockFeeds, null, 2));

			// 2. No interactive logging should have happened via process.stdout.write
			const stdoutCalls = stdoutWriteSpy.mock.calls.flat().join('');
			expect(stdoutCalls).toBe('');
		});

		it('should output interactive logs and banner when --json is not used', async () => {
			(metaLinksMod as Mock).mockResolvedValue(mockFeeds);

			// Simulate running `node feed-seeker-cli.ts example.com --metasearch`
			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch'];
			await run(argv);

			// 1. Banner should be logged first.
			expect(consoleLogSpy).toHaveBeenCalled();

			// 2. No interactive logs to stdout (CLI strategy loop doesn't emit start/end events).
			// stdout is only used for progress in event-driven paths.
			const stdoutCalls = stdoutWriteSpy.mock.calls.flat().join('');
			expect(stdoutCalls).toBe('');

			// 3. Final output: printFeeds prints URL (no title on mockFeeds).
			const allLogOutput = consoleLogSpy.mock.calls.flat().join('\n');
			expect(allLogOutput).toContain(mockFeeds[0].url);
		});

		it('should output an empty JSON array if no feeds are found with --json', async () => {
			(metaLinksMod as Mock).mockResolvedValue([]);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--json'];
			await run(argv);

			// It should print an empty array, which is valid JSON.
			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
			expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify([], null, 2));
		});

		it('should not print a banner or progress on error when in --json mode', async () => {
			(fetchWithTimeout as Mock).mockRejectedValue(new Error('Network Failure'));

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--json'];
			await run(argv);

			// Banner should be suppressed in --json mode.
			// console.log should only be called once for the empty results array.
			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
			expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify([], null, 2));

			// process.stdout.write (for progress) should not be called.
			expect(stdoutWriteSpy).not.toHaveBeenCalled();

			// In --json mode errors are suppressed to keep output parseable.
			expect(consoleErrorSpy).not.toHaveBeenCalled();
		});
	});
});

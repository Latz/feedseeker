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
	let processExitSpy: Mock;

	beforeEach(() => {
		// Reset mocks for modules first
		vi.clearAllMocks();

		// Mock stdout, stderr, and process.exit to capture output without terminating
		stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
		consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		processExitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as () => never);

		(fetchWithTimeout as Mock).mockResolvedValue({ ok: true, text: async () => '<html></html>' });
		(metaLinksMod as Mock).mockResolvedValue([]);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	const mockFeeds: Feed[] = [{ url: 'https://example.com/feed.xml', type: 'rss', title: null, feedTitle: null }];

	describe('--json flag', () => {
		it('should output only JSON when --json flag is used', async () => {
			(metaLinksMod as Mock).mockResolvedValue(mockFeeds);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--json'];
			await run(argv);

			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
			expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(mockFeeds, null, 2));

			const stdoutCalls = stdoutWriteSpy.mock.calls.flat().join('');
			expect(stdoutCalls).toBe('');
		});

		it('should output interactive logs and banner when --json is not used', async () => {
			(metaLinksMod as Mock).mockResolvedValue(mockFeeds);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch'];
			await run(argv);

			// Banner should be logged first.
			expect(consoleLogSpy).toHaveBeenCalled();

			// Final output: printFeeds prints URL (no title on mockFeeds).
			const allLogOutput = consoleLogSpy.mock.calls.flat().join('\n');
			expect(allLogOutput).toContain(mockFeeds[0].url);
		});

		it('should output an empty JSON array and exit 2 if no feeds are found with --json', async () => {
			(metaLinksMod as Mock).mockResolvedValue([]);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--json'];
			await run(argv);

			expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify([], null, 2));
			expect(processExitSpy).toHaveBeenCalledWith(2);
		});

		it('should not print a banner or progress on error when in --json mode', async () => {
			(fetchWithTimeout as Mock).mockRejectedValue(new Error('Network Failure'));

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--json'];
			await run(argv);

			// Banner suppressed; only the empty array is printed.
			expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify([], null, 2));

			// process.stdout.write (for progress) should not be called.
			expect(stdoutWriteSpy).not.toHaveBeenCalled();

			// In --json mode errors are suppressed to keep output parseable.
			expect(consoleErrorSpy).not.toHaveBeenCalled();

			// Exit code 2: search completed but no feeds found.
			expect(processExitSpy).toHaveBeenCalledWith(2);
		});
	});

	describe('exit codes', () => {
		it('should exit 0 (implicit) when feeds are found', async () => {
			(metaLinksMod as Mock).mockResolvedValue(mockFeeds);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--json'];
			await run(argv);

			expect(processExitSpy).not.toHaveBeenCalled();
		});

		it('should exit 2 when no feeds are found', async () => {
			(metaLinksMod as Mock).mockResolvedValue([]);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--json'];
			await run(argv);

			expect(processExitSpy).toHaveBeenCalledWith(2);
		});
	});
});

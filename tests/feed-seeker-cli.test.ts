import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { run } from '../feed-seeker-cli.ts';
import { type Feed } from '../modules/metaLinks.ts';

// Mock the search modules to control their output and prevent network calls.
vi.mock('../modules/metaLinks.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/anchors.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/blindsearch.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/deepSearch.ts', () => ({ default: vi.fn() }));
vi.mock('../modules/checkFreshness.ts', () => ({ checkFeedFreshness: vi.fn() }));

// Mock fetchWithTimeout as well, since initialize() is called.
vi.mock('../modules/fetchWithTimeout.ts', () => ({
	default: vi.fn()
}));

import metaLinksMod from '../modules/metaLinks.ts';
import anchorsMod from '../modules/anchors.ts';
import blindsearchMod from '../modules/blindsearch.ts';
import deepSearchMod from '../modules/deepSearch.ts';
import fetchWithTimeout from '../modules/fetchWithTimeout.ts';
import { checkFeedFreshness } from '../modules/checkFreshness.ts';

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

	const mockFeeds: Feed[] = [
		{ url: 'https://example.com/feed.xml', type: 'rss', title: null, feedTitle: null }
	];

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

	describe('--all flag', () => {
		const feedA: Feed = { url: 'https://example.com/feed.xml', type: 'rss', title: null, feedTitle: 'Feed A' };
		const feedB: Feed = { url: 'https://example.com/atom.xml', type: 'atom', title: null, feedTitle: null };

		beforeEach(() => {
			(anchorsMod as Mock).mockResolvedValue([]);
			(blindsearchMod as Mock).mockResolvedValue([]);
			(deepSearchMod as Mock).mockResolvedValue([]);
		});

		it('prints per-strategy results using printFeeds format (not raw JSON)', async () => {
			(metaLinksMod as Mock).mockResolvedValue([feedA]);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--all'];
			await run(argv);

			const allOutput = consoleLogSpy.mock.calls.flat().join('\n');
			expect(allOutput).toContain(feedA.url);
			expect(allOutput).not.toContain('"url"');
		});

		it('prints final summary with deduplicated count', async () => {
			(metaLinksMod as Mock).mockResolvedValue([feedA]);
			(blindsearchMod as Mock).mockResolvedValue([feedB]);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--all'];
			await run(argv);

			const allOutput = consoleLogSpy.mock.calls.flat().join('\n');
			expect(allOutput).toContain('All Strategies Complete');
			expect(allOutput).toContain('Total unique feeds found: 2');
		});

		it('deduplicates feeds with the same URL across strategies', async () => {
			(metaLinksMod as Mock).mockResolvedValue([feedA]);
			(blindsearchMod as Mock).mockResolvedValue([feedA]);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--all'];
			await run(argv);

			const allOutput = consoleLogSpy.mock.calls.flat().join('\n');
			expect(allOutput).toContain('Total unique feeds found: 1');
		});

		it('exits with code 2 when no feeds found across all strategies', async () => {
			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--all'];
			await run(argv);

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

	describe('--check flag', () => {
		const freshFeed: Feed = { url: 'https://example.com/fresh.xml', type: 'rss', title: null, feedTitle: 'Fresh Feed' };
		const staleFeed: Feed = { url: 'https://example.com/stale.xml', type: 'rss', title: null, feedTitle: 'Stale Feed' };

		beforeEach(() => {
			(checkFeedFreshness as Mock).mockResolvedValue(true);
		});

		it('applies freshness filter with default 30 days when --check is passed alone', async () => {
			(metaLinksMod as Mock).mockResolvedValue([freshFeed]);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--check'];
			await run(argv);

			expect(checkFeedFreshness).toHaveBeenCalledWith(
				freshFeed,
				30,
				expect.objectContaining({ options: expect.any(Object) })
			);
		});

		it('uses custom days threshold from --check 60', async () => {
			(metaLinksMod as Mock).mockResolvedValue([freshFeed]);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--check', '60'];
			await run(argv);

			expect(checkFeedFreshness).toHaveBeenCalledWith(
				freshFeed,
				60,
				expect.any(Object)
			);
		});

		it('keeps fresh feeds in output', async () => {
			(metaLinksMod as Mock).mockResolvedValue([freshFeed]);
			(checkFeedFreshness as Mock).mockResolvedValue(true);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--check', '--json'];
			await run(argv);

			expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify([freshFeed], null, 2));
		});

		it('removes stale feeds from output', async () => {
			(metaLinksMod as Mock).mockResolvedValue([staleFeed]);
			(checkFeedFreshness as Mock).mockResolvedValue(false);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--check', '--json'];
			await run(argv);

			expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify([], null, 2));
		});

		it('filters mix of fresh and stale — only fresh in output', async () => {
			(metaLinksMod as Mock).mockResolvedValue([freshFeed, staleFeed]);
			(checkFeedFreshness as Mock)
				.mockResolvedValueOnce(true)
				.mockResolvedValueOnce(false);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--check', '--json'];
			await run(argv);

			expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify([freshFeed], null, 2));
		});

		it('exits with code 2 when all feeds are stale', async () => {
			(metaLinksMod as Mock).mockResolvedValue([staleFeed]);
			(checkFeedFreshness as Mock).mockResolvedValue(false);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--check', '--json'];
			await run(argv);

			expect(processExitSpy).toHaveBeenCalledWith(2);
		});

		it('does not call checkFeedFreshness when --check is not passed', async () => {
			(metaLinksMod as Mock).mockResolvedValue([freshFeed]);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--json'];
			await run(argv);

			expect(checkFeedFreshness).not.toHaveBeenCalled();
		});
	});

	describe('--format opml', () => {
		const opmlFeeds: Feed[] = [
			{ url: 'https://example.com/feed.xml', type: 'rss', title: 'Example Blog', feedTitle: 'Example Blog' },
			{ url: 'https://example.com/atom.xml', type: 'atom', title: null, feedTitle: null },
		];

		it('outputs a valid OPML document', async () => {
			(metaLinksMod as Mock).mockResolvedValue(opmlFeeds);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--format', 'opml'];
			await run(argv);

			const output = consoleLogSpy.mock.calls.flat().join('\n');
			expect(output).toContain('<?xml version="1.0" encoding="UTF-8"?>');
			expect(output).toContain('<opml version="2.0">');
			expect(output).toContain('<body>');
			expect(output).toContain('</body>');
			expect(output).toContain('</opml>');
		});

		it('includes an outline element for each feed', async () => {
			(metaLinksMod as Mock).mockResolvedValue(opmlFeeds);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--format', 'opml'];
			await run(argv);

			const output = consoleLogSpy.mock.calls.flat().join('\n');
			expect(output).toContain('xmlUrl="https://example.com/feed.xml"');
			expect(output).toContain('xmlUrl="https://example.com/atom.xml"');
			expect(output).toContain('type="rss"');
			expect(output).toContain('type="atom"');
		});

		it('uses feed title in outline text/title attributes', async () => {
			(metaLinksMod as Mock).mockResolvedValue(opmlFeeds);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--format', 'opml'];
			await run(argv);

			const output = consoleLogSpy.mock.calls.flat().join('\n');
			expect(output).toContain('text="Example Blog"');
			expect(output).toContain('title="Example Blog"');
		});

		it('falls back to URL when feed has no title', async () => {
			(metaLinksMod as Mock).mockResolvedValue([opmlFeeds[1]]);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--format', 'opml'];
			await run(argv);

			const output = consoleLogSpy.mock.calls.flat().join('\n');
			expect(output).toContain('text="https://example.com/atom.xml"');
		});

		it('escapes XML special characters in titles', async () => {
			const feed: Feed = { url: 'https://example.com/feed.xml', type: 'rss', title: 'Foo & "Bar"', feedTitle: 'Foo & "Bar"' };
			(metaLinksMod as Mock).mockResolvedValue([feed]);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--format', 'opml'];
			await run(argv);

			const output = consoleLogSpy.mock.calls.flat().join('\n');
			expect(output).toContain('text="Foo &amp; &quot;Bar&quot;"');
		});

		it('suppresses the banner', async () => {
			(metaLinksMod as Mock).mockResolvedValue(opmlFeeds);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--format', 'opml'];
			await run(argv);

			// Only one console.log call: the OPML output itself (no banner)
			const calls = consoleLogSpy.mock.calls;
			expect(calls.length).toBe(1);
			expect(calls[0][0]).toContain('<?xml');
		});

		it('--json flag still works as an alias for json format', async () => {
			(metaLinksMod as Mock).mockResolvedValue(opmlFeeds);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--json'];
			await run(argv);

			const output = consoleLogSpy.mock.calls.flat().join('');
			expect(output).toContain('"url"');
			expect(output).not.toContain('<opml');
		});
	});

	describe('--quiet flag', () => {
		const quietFeeds: Feed[] = [
			{ url: 'https://example.com/feed.xml', type: 'rss', title: 'My Blog', feedTitle: 'My Blog' },
			{ url: 'https://example.com/atom.xml', type: 'atom', title: 'My Blog Atom', feedTitle: 'My Blog Atom' },
		];

		it('prints only URLs, one per line', async () => {
			(metaLinksMod as Mock).mockResolvedValue(quietFeeds);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--quiet'];
			await run(argv);

			const calls = consoleLogSpy.mock.calls;
			expect(calls).toHaveLength(quietFeeds.length);
			expect(calls[0][0]).toBe('https://example.com/feed.xml');
			expect(calls[1][0]).toBe('https://example.com/atom.xml');
		});

		it('suppresses the banner', async () => {
			(metaLinksMod as Mock).mockResolvedValue(quietFeeds);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--quiet'];
			await run(argv);

			const allOutput = consoleLogSpy.mock.calls.flat().join('\n');
			expect(allOutput).not.toContain('feedseeker');
			expect(allOutput).not.toContain('FeedSeeker');
		});

		it('suppresses progress output (no stdout.write calls)', async () => {
			(metaLinksMod as Mock).mockResolvedValue(quietFeeds);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--quiet'];
			await run(argv);

			expect(stdoutWriteSpy).not.toHaveBeenCalled();
		});

		it('exits with code 2 when no feeds found', async () => {
			(metaLinksMod as Mock).mockResolvedValue([]);

			const argv = ['node', 'feed-seeker-cli.ts', 'example.com', '--metasearch', '--quiet'];
			await run(argv);

			expect(processExitSpy).toHaveBeenCalledWith(2);
			expect(consoleLogSpy).not.toHaveBeenCalled();
		});
	});
});

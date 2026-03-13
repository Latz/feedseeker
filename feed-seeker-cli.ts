#!/usr/bin/env node

import { Command, Option } from 'commander';
import FeedSeeker, { type FeedSeekerOptions } from './feed-seeker.ts';
import { styleText } from 'node:util';
import { type Feed } from './modules/metaLinks.ts';
import type { StartEventData, EndEventData, LogEventData } from './types/events.ts';
import bannerText from './modules/banner.ts';

// CLI-specific options that extend FeedSeekerOptions
interface CLIOptions extends FeedSeekerOptions {
	displayErrors?: boolean;
	searchMode?: 'fast' | 'standard' | 'exhaustive';
	json?: boolean;
}

let counterLength = 0; // needed for fancy blindsearch log display

interface CLIRunContext {
	isAllMode: boolean;
}

function start(...args: unknown[]): void {
	const data = args[0] as StartEventData;
	counterLength = 0; // Reset counter length for new module
	process.stdout.write(`Starting ${data.niceName} `);
}

function makeEndHandler(ctx: CLIRunContext) {
	return function end(...args: unknown[]): void {
		const data = args[0] as EndEventData;
		if (ctx.isAllMode) {
			// In --all mode, report per-strategy results
			if (data.feeds.length === 0) {
				process.stdout.write(styleText('yellow', ' No feeds found.\n'));
			} else {
				process.stdout.write(styleText('green', ` Found ${data.feeds.length} feeds.\n`));
				// Display feeds from this strategy
				console.log(JSON.stringify(data.feeds, null, 2));
			}
		} else if (data.feeds.length === 0) {
			// Normal mode
			process.stdout.write(styleText('yellow', ' No feeds found.\n'));
		} else {
			process.stdout.write(styleText('green', ` Found ${data.feeds.length} feeds.\n`));
		}
	};
}

async function log(...args: unknown[]): Promise<void> {
	const data = args[0] as LogEventData;
	if (data.module === 'metalinks') {
		process.stdout.write('.');
	}
	if (data.module === 'blindsearch' || data.module === 'anchors') {
		if ('totalCount' in data && 'totalEndpoints' in data) {
			if (counterLength > 0) {
				process.stdout.write(`\x1b[${counterLength}D`);
			}
			const counter = ` (${data.totalCount}/${data.totalEndpoints})`;
			process.stdout.write(counter);
			counterLength = counter.length;
		}
	}
	if (data.module === 'deepSearch') {
		// Display deep search progress: [depth/processed+remaining] current-url
		if ('url' in data && 'depth' in data && 'progress' in data) {
			const progress = data.progress as Record<string, number>;
			const processed = progress.processed || 0;
			const remaining = progress.remaining || 0;
			const total = processed + remaining;

			// Extract domain from URL for cleaner display
			try {
				const urlObj = new URL(data.url as string);
				const domain = urlObj.hostname;
				const path =
					urlObj.pathname.length > 30 ? urlObj.pathname.substring(0, 27) + '...' : urlObj.pathname;
				const displayUrl = `${domain}${path}`;

				// Log on a new line
				process.stdout.write(`  [depth:${data.depth} ${processed}/${total}] ${displayUrl}\n`);
			} catch {
				// Fallback if URL parsing fails
				process.stdout.write(`  [depth:${data.depth} ${processed}/${total}]\n`);
			}
		}
	}
}

interface FeedFinderWithError extends FeedSeeker {
	initializationError?: boolean;
}

function initializeFeedFinder(
	site: string,
	options: CLIOptions,
	ctx: CLIRunContext
): FeedFinderWithError {
	const FeedFinder = new FeedSeeker(site, options) as FeedFinderWithError;
	FeedFinder.site = site;
	FeedFinder.initializationError = false;

	if (!options.json) {
		FeedFinder.on('start', start);
		FeedFinder.on('log', log);
		FeedFinder.on('end', makeEndHandler(ctx));
	}

	// Add error handler to provide user-friendly error messages with site name
	FeedFinder.on('error', (...args: unknown[]) => {
		const errorData = args[0] as Record<string, unknown> | Error;

		// Check if this is an initialization error (from FeedSeeker module)
		if (typeof errorData === 'object' && errorData !== null) {
			const obj = errorData as Record<string, unknown>;
			if (obj.module === 'FeedSeeker') {
				FeedFinder.initializationError = true;
			}
		}

		// In JSON mode, errors should go to stderr. console.error does this.
		if (!options.json || options.displayErrors) {
			// Handle both Error objects and error event objects
			if (errorData instanceof Error) {
				console.error(styleText('red', `\nError for ${site}: ${errorData.message}`));
			} else if (typeof errorData === 'object' && errorData !== null) {
				const errorMessage =
					typeof errorData.error === 'string' ? errorData.error : String(errorData);
				console.error(styleText('red', `\nError for ${site}: ${errorMessage}`));
			} else {
				console.error(styleText('red', `\nError for ${site}: ${String(errorData)}`));
			}
		}
	});

	return FeedFinder;
}

async function getFeeds(
	site: string,
	options: CLIOptions & { all?: boolean },
	ctx: CLIRunContext
): Promise<Feed[]> {
	// Add https:// if no protocol is specified, unless it's a file path
	if (!site.includes('://')) {
		site = `https://${site}`;
	}

	const FeedFinder = initializeFeedFinder(site, options, ctx);

	// Initialize the site first to check for errors
	await FeedFinder.initialize();

	// If initialization failed, return empty array and don't continue searching
	if (FeedFinder.initializationError) {
		return [];
	}

	// Build strategies array based on CLI options
	const strategies: Array<() => Promise<Feed[]>> = [];

	// If specific strategies are requested, use only those (except --all)
	if (options.metasearch) {
		strategies.push(() => FeedFinder.metaLinks());
	} else if (options.anchorsonly) {
		strategies.push(() => FeedFinder.checkAllAnchors());
	} else if (options.blindsearch) {
		strategies.push(() => FeedFinder.blindSearch());
	} else if (options.deepsearchOnly) {
		strategies.push(() => FeedFinder.deepSearch());
	} else if (options.all) {
		// --all mode: execute all strategies and combine results
		strategies.push(
			() => FeedFinder.metaLinks(),
			() => FeedFinder.checkAllAnchors(),
			() => FeedFinder.blindSearch(),
			() => FeedFinder.deepSearch()
		);
	} else {
		// Default: try all strategies in order (including deep search if enabled)
		strategies.push(
			() => FeedFinder.metaLinks(),
			() => FeedFinder.checkAllAnchors(),
			() => FeedFinder.blindSearch(),
			...(options.deepsearch ? [() => FeedFinder.deepSearch()] : [])
		);
	}

	const findfeeds = async (): Promise<Feed[]> => {
		if (options.all) {
			// In --all mode, execute all strategies and combine results
			const allFeeds: Feed[] = [];
			for (const strategy of strategies) {
				const feeds = await strategy();
				if (feeds.length > 0) {
					allFeeds.push(...feeds);
				}
			}
			// Deduplicate the final list
			const uniqueFeeds = [...new Map(allFeeds.map((f) => [f.url, f])).values()];
			return uniqueFeeds;
		} else {
			// Normal mode: return on first successful strategy
			for (const strategy of strategies) {
				const feeds = await strategy();
				if (feeds.length > 0) return feeds;
			}
			return []; // no feeds found
		}
	};

	const feeds = await findfeeds();
	return feeds;
}

// Extended program type to store feeds and run context
interface ExtendedCommand extends Command {
	feeds?: Feed[];
	ctx?: CLIRunContext;
}

// =======================================================================================================

/**
 * Create and configure the CLI program
 * @param argv - Command line arguments (defaults to process.argv)
 * @returns Configured Command instance
 */
export function createProgram(_argv?: string[]): ExtendedCommand {
	const program: ExtendedCommand = new Command();
	program
		.name(`feed-seeker`)
		.description('Find RSS, Atom, and JSON feeds on any website with FeedSeeker.');
	program
		.command('version')
		.description('Get version')
		.action(async () => {
			const packageModule = await import('./package.json', { assert: { type: 'json' } });
			const packageConfig = packageModule.default;
			process.stdout.write(`${packageConfig.version}\n`);
		});

	program
		.argument('[site]', 'The website URL to search for feeds')
		.option('-m, --metasearch', 'Meta search only')
		.option('-b, --blindsearch', 'Blind search only')
		.option('-a, --anchorsonly', 'Anchors search only')
		.option('-d, --deepsearch', 'Enable deep search')
		.option('--all', 'Execute all strategies and combine results')
		.option('--json', 'Output feeds as JSON only (suppresses logging)')
		.option('--deepsearch-only', 'Deep search only')
		.option(
			'--depth <number>',
			'Depth of deep search',
			(val: string): number => {
				const num = parseInt(val, 10);
				if (Number.isNaN(num) || num < 1) {
					throw new Error('Depth must be a positive number (minimum 1)');
				}
				return num;
			},
			3
		)
		.option(
			'--max-links <number>',
			'Maximum number of links to process during deep search',
			(val: string): number => {
				const num = parseInt(val, 10);
				if (Number.isNaN(num) || num < 1) {
					throw new Error('Max links must be a positive number (minimum 1)');
				}
				return num;
			},
			1000
		)
		.option(
			'--timeout <seconds>',
			'Timeout for fetch requests in seconds',
			(val: string): number => {
				const num = parseInt(val, 10);
				if (Number.isNaN(num) || num < 1) {
					throw new Error('Timeout must be a positive number (minimum 1 second)');
				}
				return num;
			},
			5
		)
		.option('--keep-query-params', 'Keep query parameters from the original URL when searching')
		.option(
			'--check-foreign-feeds',
			"Check if foreign domain URLs are feeds (but don't crawl them)"
		)
		.option(
			'--max-errors <number>',
			'Stop after a certain number of errors',
			(val: string): number => {
				const num = parseInt(val, 10);
				if (Number.isNaN(num) || num < 0) {
					throw new Error('Max errors must be a non-negative number');
				}
				return num;
			},
			5
		)
		.option(
			'--max-feeds <number>',
			'Stop search after finding a certain number of feeds',
			(val: string): number => {
				const num = parseInt(val, 10);
				if (Number.isNaN(num) || num < 0) {
					throw new Error('Max feeds must be a non-negative number');
				}
				return num;
			},
			0
		)
		.option(
			'--search-mode <mode>',
			'Search mode for blind search: fast (~25), standard (~100), or full (~350+)',
			'standard'
		)
		.description('Find feeds for site\n')
		.action(async (site: string, options: CLIOptions & { all?: boolean }) => {
			if (!site) {
				program.help();
				process.exit(0);
			}
			try {
				const ctx: CLIRunContext = {
					isAllMode: !!options.all
				};
				// Store the result directly on the program object
				program.feeds = await getFeeds(site, options, ctx);
				program.ctx = ctx;
			} catch (error) {
				if (options.displayErrors) {
					console.error('\nError details:', error);
				} else {
					const err = error as Error;
					console.error(styleText('red', `\nError: ${err.message}`));
				}
				process.exit(1);
			}
		});

	// add hidden option '--display-errors' to program
	program.addOption(new Option('--display-errors', 'Display errors').hideHelp());
	program.addOption(new Option('--insecure', 'Disable TLS certificate verification (like curl -k)').hideHelp());

	return program;
}

/**
 * Prints feeds in a human-readable format, showing title (if available) above the URL.
 */
function printFeeds(feeds: Feed[]): void {
	feeds.forEach((feed, i) => {
		const title = feed.feedTitle ?? feed.title;
		if (title) {
			console.log(styleText('cyan', title));
		}
		console.log(feed.url);
		if (i < feeds.length - 1) console.log('');
	});
}

/**
 * Run the CLI with provided arguments
 * @param argv - Command line arguments (defaults to process.argv)
 * @returns Promise that resolves when CLI execution completes
 */
export async function run(argv: string[] = process.argv): Promise<void> {
	if (!argv.includes('--json')) {
		console.log(`${bannerText}\n`);
	}

	const program = createProgram(argv);

	// execute program
	await program.parseAsync(argv);

	const opts = program.opts<CLIOptions>();

	if (program.feeds !== undefined) {
		if (opts.json) {
			// JSON mode: just print the final array of feeds.
			console.log(JSON.stringify(program.feeds, null, 2));
		} else {
			// Interactive mode
			if (opts.all) {
				// In --all mode, per-strategy results were already printed.
				// Now print a final summary with the deduplicated list.
				console.log(styleText('yellow', '\n=== All Strategies Complete ==='));
				console.log(styleText('green', `Total unique feeds found: ${program.feeds.length}\n`));
				printFeeds(program.feeds);
			} else if (program.feeds.length > 0) {
				// In normal mode, print the final list.
				printFeeds(program.feeds);
			}
			// If no feeds found, the 'end' handler already printed the message.
		}

		// Exit code 2 = search succeeded but no feeds were found.
		// Exit code 1 = error (set by .catch below or process.exit(1) on init error).
		if (program.feeds.length === 0) {
			process.exit(2);
		}
	}
}

// Only run if this is the main module (not imported for testing)
if (import.meta.url === `file://${process.argv[1]}`) {
	run().catch((error) => {
		const err = error as Error;
		console.error(styleText('red', `\nError: ${err.message}`));
		process.exit(1);
	});
}

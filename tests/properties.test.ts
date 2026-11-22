/**
 * Property-based tests (fast-check): invariants that must hold for any input,
 * not just the hand-picked examples in the other test files.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { generateEndpointUrls } from '../modules/blindsearch/urlGeneration.ts';
import { validateConcurrency, validateRequestDelay } from '../modules/blindsearch/validation.ts';
import { validateTimeout } from '../modules/checkFeed/validation.ts';
import { escapeXml, formatOpml } from '../cli/output.ts';
import { acquireHostSlot, getHostname } from '../modules/hostRateLimiter.ts';
import { isAllowedDomain } from '../modules/anchors/domainFilter.ts';
import { excludedFile, EXCLUDED_EXTENSIONS } from '../modules/deepSearch.ts';
import { checkRss } from '../modules/checkFeed/checkRss.ts';
import { checkAtom } from '../modules/checkFeed/checkAtom.ts';
import { checkJson } from '../modules/checkFeed/checkJson.ts';
import { type Feed } from '../modules/metaLinks.ts';
import { cleanTitle, removeCDATA } from '../modules/checkFeed/textUtils.ts';
import { validateUrl } from '../modules/checkFeed/validation.ts';
import checkFeed from '../modules/checkFeed/index.ts';
import { checkFeedFreshness } from '../modules/checkFreshness.ts';
import { readUrlsFromFile } from '../cli/readUrlsFromFile.ts';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

afterEach(() => {
	vi.restoreAllMocks();
	vi.useRealTimers();
});

// Any JS number, including NaN, ±Infinity, -0 and fractions
const anyNumber = fc.oneof(
	fc.double(),
	fc.integer(),
	fc.constantFrom(NaN, Infinity, -Infinity, -0)
);

describe('generateEndpointUrls', () => {
	const segment = fc.stringMatching(/^[a-z0-9-]{1,8}$/);
	const endpoint = fc.stringMatching(/^[a-z0-9][a-z0-9.]{0,9}$/);
	const query = fc.stringMatching(/^[a-z]{1,5}=[a-z0-9]{1,5}$/);

	it('walks every path level once, stays on the origin, and handles the query correctly', () => {
		fc.assert(
			fc.property(
				fc.array(segment, { maxLength: 4 }),
				fc.boolean(),
				fc.option(query),
				fc.uniqueArray(endpoint, { minLength: 1, maxLength: 5 }),
				fc.boolean(),
				(segments, trailingSlash, q, endpoints, keepQuery) => {
					const path = segments.length ? `/${segments.join('/')}${trailingSlash ? '/' : ''}` : '/';
					const site = `https://example.com${path}${q ? `?${q}` : ''}`;
					const urls = generateEndpointUrls(site, keepQuery, endpoints);

					expect(urls).toHaveLength((segments.length + 1) * endpoints.length);
					expect(new Set(urls).size).toBe(urls.length);
					for (const url of urls) {
						const parsed = new URL(url);
						expect(parsed.origin).toBe('https://example.com');
						expect(parsed.pathname).not.toContain('//');
						if (keepQuery && q) expect(parsed.search).toBe(`?${q}`);
						else expect(parsed.search).toBe('');
					}
				}
			)
		);
	});
});

describe('value validation', () => {
	it('validateTimeout always yields a usable timeout and keeps valid values', () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		fc.assert(
			fc.property(fc.option(anyNumber, { nil: undefined }), (value) => {
				const t = validateTimeout(value);
				expect(Number.isFinite(t)).toBe(true);
				expect(t).toBeGreaterThan(0);
				expect(t).toBeLessThanOrEqual(60);
				if (value !== undefined && Number.isFinite(value) && value > 0 && value <= 60) {
					expect(t).toBe(value);
				}
			})
		);
	});

	it('validateConcurrency always yields an integer from 1 to 10', () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		fc.assert(
			fc.property(fc.option(anyNumber, { nil: undefined }), (value) => {
				const c = validateConcurrency(value);
				expect(Number.isInteger(c)).toBe(true);
				expect(c).toBeGreaterThanOrEqual(1);
				expect(c).toBeLessThanOrEqual(10);
			})
		);
	});

	it('validateRequestDelay always yields an integer from 0 to 60000', () => {
		vi.spyOn(console, 'warn').mockImplementation(() => {});
		fc.assert(
			fc.property(fc.option(anyNumber, { nil: undefined }), (value) => {
				const d = validateRequestDelay(value);
				expect(Number.isInteger(d)).toBe(true);
				expect(d).toBeGreaterThanOrEqual(0);
				expect(d).toBeLessThanOrEqual(60000);
			})
		);
	});
});

describe('XML output', () => {
	const unescape = (s: string) =>
		s
			.replace(/&lt;/g, '<')
			.replace(/&gt;/g, '>')
			.replace(/&quot;/g, '"')
			.replace(/&amp;/g, '&');
	// Characters XML 1.0 forbids anywhere in a document, even escaped
	const ILLEGAL_XML_CHARS = new RegExp(
		// oxlint-disable-next-line no-control-regex -- intentionally matches control characters
		'[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\uFFFE\\uFFFF]'
	);
	const anyText = fc.string({ unit: 'grapheme', maxLength: 40 });
	const textWithControls = fc.oneof(anyText, fc.string({ unit: 'binary', maxLength: 40 }));

	it('escapeXml leaves no raw markup or illegal characters, and round-trips the rest', () => {
		fc.assert(
			fc.property(textWithControls, (s) => {
				const escaped = escapeXml(s);
				expect(escaped).not.toMatch(/[<>"]/);
				expect(escaped).not.toMatch(/&(?!amp;|lt;|gt;|quot;)/);
				expect(escaped).not.toMatch(ILLEGAL_XML_CHARS);
				expect(unescape(escaped)).toBe(s.replace(new RegExp(ILLEGAL_XML_CHARS, 'g'), ''));
			})
		);
	});

	it('formatOpml produces one well-formed outline per feed, for any titles and URLs', () => {
		const feedArb = fc.record({
			url: fc.webUrl({ withQueryParameters: true, withFragments: true }),
			type: fc.constantFrom('rss', 'atom', 'json') as fc.Arbitrary<Feed['type']>,
			title: fc.option(textWithControls, { nil: null }),
			feedTitle: fc.option(textWithControls, { nil: null })
		});
		fc.assert(
			fc.property(fc.array(feedArb, { maxLength: 5 }), textWithControls, (feeds, site) => {
				const opml = formatOpml(feeds, site);
				expect(opml).not.toMatch(ILLEGAL_XML_CHARS);
				const outlines = [
					...opml.matchAll(
						/<outline type="(\w+)" text="([^"<]*)" title="([^"<]*)" xmlUrl="([^"<]*)"\/>/g
					)
				];
				expect(outlines).toHaveLength(feeds.length);
				outlines.forEach((m, i) => {
					expect(m[1]).toBe(feeds[i].type);
					expect(unescape(m[4])).toBe(feeds[i].url);
				});
			})
		);
	});
});

describe('hostRateLimiter', () => {
	it('never waits longer than 60 s, whatever the rate-limit headers say', async () => {
		// Checks the delays handed to setTimeout (fake timers never emit TimeoutOverflowWarning)
		vi.useFakeTimers();
		const timeout = vi.spyOn(globalThis, 'setTimeout');
		const MAX_WAIT_MS = 60_000;
		let n = 0;
		const headerValue = fc.oneof(
			fc.integer({ min: -5, max: 5_000_000_000 }).map(String),
			fc.double({ noNaN: false }).map(String),
			fc.string({ maxLength: 8 })
		);
		await fc.assert(
			// remaining is mostly 0: the exhausted case is the one that schedules a wait
			fc.asyncProperty(
				fc.oneof(fc.constantFrom('0', '-1'), headerValue),
				headerValue,
				async (remaining, reset) => {
					timeout.mockClear();
					const host = `prop${++n}.limiter.test`;
					(await acquireHostSlot(host))(
						new Response('', {
							headers: { 'x-ratelimit-remaining': remaining, 'x-ratelimit-reset': reset }
						})
					);
					const next = acquireHostSlot(host);
					await vi.runOnlyPendingTimersAsync();
					(await next)(null);
					for (const [, delay] of timeout.mock.calls) {
						expect(Number(delay ?? 0)).toBeLessThanOrEqual(MAX_WAIT_MS);
					}
				}
			),
			{ numRuns: 200 }
		);
	});

	it('getHostname agrees with the URL parser for any web URL', () => {
		fc.assert(
			fc.property(fc.webUrl(), (url) => {
				expect(getHostname(url)).toBe(new URL(url).hostname);
			})
		);
	});
});

describe('link filters', () => {
	it('isAllowedDomain accepts any URL on the base host', () => {
		fc.assert(
			fc.property(fc.webUrl(), fc.webPath(), (base, path) => {
				const baseUrl = new URL(base);
				expect(isAllowedDomain(`${baseUrl.origin}${path}`, baseUrl)).toBe(true);
			})
		);
	});

	it('excludedFile flags every excluded extension in any letter case', () => {
		fc.assert(
			fc.property(
				fc.webUrl(),
				fc.constantFrom(...EXCLUDED_EXTENSIONS),
				fc.boolean(),
				(url, ext, upper) => {
					const u = new URL(url);
					const file = `${u.origin}/file${upper ? ext.toUpperCase() : ext}`;
					expect(excludedFile(file)).toBe(true);
				}
			)
		);
	});
});

describe('feed parsers', () => {
	it('never throw and only ever return a result of their own type or null', () => {
		fc.assert(
			fc.property(fc.string({ maxLength: 300 }), (content) => {
				expect([null, 'rss']).toContain(checkRss(content)?.type ?? null);
				expect([null, 'atom']).toContain(checkAtom(content)?.type ?? null);
				expect([null, 'json']).toContain(checkJson(content)?.type ?? null);
			})
		);
	});
});

// Text built mostly from whitespace and markup characters, which the default
// fc.string() (printable ASCII, no newlines) almost never produces
const messyText = fc.string({
	unit: fc.constantFrom(' ', '\n', '\t', '\r', ' ', 'a', 'Z', 'é', '<', '>', ']', '&'),
	maxLength: 30
});

describe('title cleanup', () => {
	it('cleanTitle returns null or a non-empty, trimmed, single-spaced title, and is idempotent', () => {
		fc.assert(
			fc.property(messyText, (s) => {
				const t = cleanTitle(s);
				if (t === null) return;
				expect(t.length).toBeGreaterThan(0);
				expect(t).toBe(t.trim());
				expect(t).not.toMatch(/\s{2}/);
				expect(cleanTitle(t)).toBe(t);
			})
		);
	});

	it('removeCDATA unwraps CDATA sections whatever they contain, including newlines', () => {
		fc.assert(
			fc.property(
				messyText.filter((s) => !s.includes(']]>')),
				(s) => {
					expect(removeCDATA(`<![CDATA[${s}]]>`)).toBe(s);
					expect(removeCDATA(`a<![CDATA[${s}]]>b<![CDATA[${s}]]>`)).toBe(`a${s}b${s}`);
				}
			)
		);
	});

	it('an RSS title reads back as its cleaned text, plain or in multi-line CDATA', () => {
		const titleText = messyText.filter((s) => !/[<&]|]]>/.test(s));
		fc.assert(
			fc.property(titleText, fc.boolean(), (title, cdata) => {
				const inner = cdata ? `<![CDATA[\n${title}\n]]>` : title;
				const feed = `<rss version="2.0"><channel><title>${inner}</title><description>d</description><item></item></channel></rss>`;
				expect(checkRss(feed)?.title).toBe(cleanTitle(title));
			})
		);
	});
});

describe('validateUrl', () => {
	it('accepts every http(s) URL and rejects every other scheme', () => {
		fc.assert(
			fc.property(
				fc.webUrl(),
				fc.constantFrom('ftp', 'file', 'data', 'mailto', 'javascript', 'ws'),
				(url, scheme) => {
					expect(() => validateUrl(url)).not.toThrow();
					const other = url.replace(/^https?/, scheme);
					expect(() => validateUrl(other)).toThrow(/Invalid (protocol|URL)/);
				}
			)
		);
	});
});

describe('checkJson', () => {
	it('accepts any object with a non-empty items array and cleans a string title', () => {
		fc.assert(
			fc.property(
				fc.array(fc.jsonValue(), { minLength: 1, maxLength: 3 }),
				fc.option(messyText, { nil: undefined }),
				(items, title) => {
					const result = checkJson(
						JSON.stringify({ items, ...(title === undefined ? {} : { title }) })
					);
					expect(result).toEqual({ type: 'json', title: cleanTitle(title) });
				}
			)
		);
	});
});

describe('readUrlsFromFile', () => {
	const dir = mkdtempSync(join(tmpdir(), 'feedseeker-prop-'));
	let n = 0;

	it('returns exactly the trimmed lines that are neither blank nor comments, in order', async () => {
		const line = fc.oneof(
			fc.webUrl(),
			fc.webUrl().map((u) => `  ${u}\t`),
			fc.constant(''),
			fc.constant('   '),
			fc.string({ maxLength: 10 }).map((s) => `# ${s}`)
		);
		await fc.assert(
			fc.asyncProperty(
				fc.array(line, { maxLength: 8 }),
				fc.constantFrom('\n', '\r\n'),
				async (lines, eol) => {
					const file = join(dir, `urls${++n}.txt`);
					writeFileSync(file, lines.join(eol));
					const expected = lines.map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
					expect(await readUrlsFromFile(file)).toEqual(expected);
				}
			)
		);
	});
});

describe('checkFeedFreshness', () => {
	const NOW = Date.UTC(2026, 5, 15);
	let n = 0;

	it('keeps a feed exactly when its newest item is at most N days old', async () => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(NOW);
		await fc.assert(
			fc.asyncProperty(
				fc.integer({ min: 0, max: 400 * 86_400 }),
				fc.integer({ min: 1, max: 365 }),
				fc.constantFrom<Feed['type']>('rss', 'atom', 'json'),
				async (ageSeconds, days, type) => {
					const date = new Date(NOW - ageSeconds * 1000);
					const url = `https://fresh-prop${++n}.example/feed`;
					const content =
						type === 'rss'
							? `<rss version="2.0"><channel><title>t</title><description>d</description><item><pubDate>${date.toUTCString()}</pubDate></item></channel></rss>`
							: type === 'atom'
								? `<feed xmlns="http://www.w3.org/2005/Atom"><title>t</title><entry><updated>${date.toISOString()}</updated></entry></feed>`
								: JSON.stringify({
										version: 'https://jsonfeed.org/version/1.1',
										items: [{ date_published: date.toISOString() }]
									});
					// checkFeed caches recognized feeds; checkFeedFreshness reads that cache (no network)
					expect(await checkFeed(url, content)).toMatchObject({ type });
					const fresh = await checkFeedFreshness(
						{ url, type, title: null, feedTitle: null },
						days,
						{ options: {} }
					);
					expect(fresh).toBe(ageSeconds <= days * 86_400);
				}
			)
		);
	});
});

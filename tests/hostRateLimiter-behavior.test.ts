import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { acquireHostSlot, are403RetriesFutile, getHostname } from '../modules/hostRateLimiter.ts';

let n = 0;
const freshHost = () => `h${++n}.limiter.test`;
const res = (status: number, headers: Record<string, string> = {}) =>
	new Response('', { status, headers });

/** Resolves to true once p has settled, after letting pending microtasks run. */
async function isDone(p: Promise<unknown>): Promise<boolean> {
	let done = false;
	void p.then(() => {
		done = true;
	});
	await vi.advanceTimersByTimeAsync(0);
	return done;
}

beforeEach(() => {
	vi.useFakeTimers();
});
afterEach(() => {
	vi.useRealTimers();
});

describe('getHostname', () => {
	it('returns the lower-cased hostname, or the input when it is not a URL', () => {
		expect(getHostname('https://A.Example/feed')).toBe('a.example');
		expect(getHostname('not a url')).toBe('not a url');
	});
});

describe('are403RetriesFutile', () => {
	it('is false for an unknown host', () => {
		expect(are403RetriesFutile('never-seen.limiter.test')).toBe(false);
	});

	it('turns true after three final 403s in a row and resets on another status', async () => {
		const host = freshHost();
		for (let i = 0; i < 2; i++) (await acquireHostSlot(host))(res(403));
		expect(are403RetriesFutile(host)).toBe(false);
		(await acquireHostSlot(host))(res(403));
		expect(are403RetriesFutile(host)).toBe(true);
		(await acquireHostSlot(host))(res(200));
		expect(are403RetriesFutile(host)).toBe(false);
	});
});

describe('429 cooldown', () => {
	it('drops the host to one request at a time for 10 s after a 429', async () => {
		const host = freshHost();
		(await acquireHostSlot(host))(res(429));
		const first = acquireHostSlot(host);
		const second = acquireHostSlot(host);
		expect(await isDone(first)).toBe(true);
		expect(await isDone(second)).toBe(false);
		(await first)(res(200));
		expect(await isDone(second)).toBe(true);
	});

	it('does not cool down for a Cloudflare challenge 429', async () => {
		const host = freshHost();
		(await acquireHostSlot(host))(res(429, { 'cf-mitigated': 'challenge' }));
		const first = acquireHostSlot(host);
		const second = acquireHostSlot(host);
		expect(await isDone(first)).toBe(true);
		expect(await isDone(second)).toBe(true);
	});
});

describe('rate-limit headers', () => {
	async function waitAfter(headers: Record<string, string>): Promise<number | null> {
		const host = freshHost();
		(await acquireHostSlot(host))(res(200, headers));
		const next = acquireHostSlot(host);
		if (await isDone(next)) return 0;
		for (let s = 1; s <= 120; s++) {
			await vi.advanceTimersByTimeAsync(1000);
			if (await isDone(next)) return s;
		}
		return null; // still waiting after 2 minutes
	}

	it('waits the given seconds when the quota is exhausted', async () => {
		expect(await waitAfter({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '30' })).toBe(30);
	});

	it('waits at most 60 s, however long the host asks for', async () => {
		expect(await waitAfter({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '3600' })).toBe(60);
	});

	it('understands a reset given as a Unix timestamp', async () => {
		const warn = vi.spyOn(process, 'emitWarning');
		const resetAt = String(Math.floor(Date.now() / 1000) + 30);
		const waited = await waitAfter({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': resetAt });
		expect(waited).toBeGreaterThanOrEqual(29);
		expect(waited).toBeLessThanOrEqual(31);
		expect(warn).not.toHaveBeenCalled();
		warn.mockRestore();
	});

	it.each([
		['only a reset header', { 'x-ratelimit-reset': '30' }],
		['only a remaining header', { 'x-ratelimit-remaining': '0' }],
		['quota left', { 'x-ratelimit-remaining': '5', 'x-ratelimit-reset': '30' }],
		['a reset of 0', { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '0' }],
		['a negative reset', { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '-5' }],
		['non-numeric values', { 'x-ratelimit-remaining': 'none', 'x-ratelimit-reset': 'soon' }],
		['a non-numeric remaining', { 'x-ratelimit-remaining': 'none', 'x-ratelimit-reset': '30' }],
		['an infinite reset', { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': 'Infinity' }],
		[
			'a reset timestamp in the past',
			{ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1600000000' }
		]
	])('does not wait for %s', async (_name, headers) => {
		expect(await waitAfter(headers)).toBe(0);
	});
});

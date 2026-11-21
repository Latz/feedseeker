import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';

const spoofMock = vi.fn();
vi.mock('../modules/tlsSpoofFallback.ts', () => ({
	tryTlsSpoofFallback: (...args: unknown[]) => spoofMock(...args)
}));

// Record how the insecure dispatcher is built without opening real sockets
const agentArgs: unknown[] = [];
vi.mock('undici', () => ({
	Agent: class {
		constructor(opts: unknown) {
			agentArgs.push(opts);
		}
	}
}));

import fetchWithTimeout from '../modules/fetchWithTimeout.ts';

let fetchMock: Mock;
let hostCounter = 0;
/** Fresh hostname per test so the per-host rate limiter carries no state over. */
const freshUrl = (path = '/') => `https://h${++hostCounter}-${Date.now()}.example${path}`;
const lastInit = (): RequestInit & { dispatcher?: unknown } => fetchMock.mock.calls.at(-1)![1];

beforeEach(() => {
	fetchMock = vi.fn().mockResolvedValue(new Response('ok', { status: 200 }));
	vi.stubGlobal('fetch', fetchMock);
	spoofMock.mockReset();
	spoofMock.mockResolvedValue(null);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('fetchWithTimeout — headers', () => {
	it('sends browser-like default headers', async () => {
		await fetchWithTimeout(freshUrl());
		const headers = lastInit().headers as Record<string, string>;
		expect(headers['User-Agent']).toMatch(/^Mozilla\/5\.0 .*Chrome\/\d+/);
		expect(headers.Accept).toContain('text/html');
		expect(headers['Accept-Language']).toBe('en-US,en;q=0.5');
		expect(headers['Sec-Fetch-Mode']).toBe('navigate');
	});

	it('lets custom headers override and extend the defaults', async () => {
		await fetchWithTimeout(freshUrl(), { headers: { Accept: 'application/json', 'X-Test': '1' } });
		const headers = lastInit().headers as Record<string, string>;
		expect(headers.Accept).toBe('application/json');
		expect(headers['X-Test']).toBe('1');
		expect(headers['User-Agent']).toContain('Mozilla');
	});

	it('passes other fetch options through', async () => {
		await fetchWithTimeout(freshUrl(), { method: 'HEAD' });
		expect(lastInit().method).toBe('HEAD');
		expect(lastInit().signal).toBeInstanceOf(AbortSignal);
	});
});

describe('fetchWithTimeout — insecure', () => {
	it('uses no custom dispatcher by default, nor with the legacy numeric timeout', async () => {
		await fetchWithTimeout(freshUrl(), { timeout: 1000 });
		expect(lastInit()).not.toHaveProperty('dispatcher');
		await fetchWithTimeout(freshUrl(), 1000);
		expect(lastInit()).not.toHaveProperty('dispatcher');
	});

	it('uses one shared agent that skips certificate checks', async () => {
		await fetchWithTimeout(freshUrl(), { insecure: true });
		const first = lastInit().dispatcher;
		await fetchWithTimeout(freshUrl(), { insecure: true });
		expect(first).toBeDefined();
		expect(lastInit().dispatcher).toBe(first);
		expect(agentArgs).toEqual([{ connect: { rejectUnauthorized: false } }]);
	});
});

describe('fetchWithTimeout — retries', () => {
	it('retries a 429 and returns the later success', async () => {
		fetchMock
			.mockResolvedValueOnce(new Response('', { status: 429 }))
			.mockResolvedValueOnce(new Response('ok', { status: 200 }));
		const res = await fetchWithTimeout(freshUrl());
		expect(res.status).toBe(200);
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});

	it('hands a persistent 403 to the TLS spoof fallback with timeout and headers', async () => {
		fetchMock.mockResolvedValue(new Response('', { status: 403 }));
		const spoofed = new Response('spoofed', { status: 200 });
		spoofMock.mockResolvedValue(spoofed);
		const url = freshUrl();
		const res = await fetchWithTimeout(url, { timeout: 4321 });
		expect(res).toBe(spoofed);
		expect(spoofMock).toHaveBeenCalledWith(url, {
			timeout: 4321,
			headers: expect.objectContaining({ 'User-Agent': expect.stringContaining('Mozilla') })
		});
	});
});

describe('fetchWithTimeout — errors', () => {
	/** fetch that never answers on its own and rejects like undici when aborted */
	const hangingFetch = () =>
		fetchMock.mockImplementation(
			(_url: string, init: RequestInit) =>
				new Promise((_resolve, reject) => {
					init.signal!.addEventListener('abort', () =>
						reject(new DOMException('This operation was aborted', 'AbortError'))
					);
				})
		);

	it('turns an abort into a descriptive timeout error', async () => {
		hangingFetch();
		const url = freshUrl();
		const err = await fetchWithTimeout(url, { timeout: 20 }).catch((e: Error) => e);
		expect(err).toBeInstanceOf(Error);
		expect((err as Error).message).toBe(`Request to ${url} timed out after 20ms`);
		expect((err as Error).cause).toBeInstanceOf(DOMException);
	});

	it('rethrows other errors unchanged', async () => {
		const boom = new TypeError('fetch failed');
		fetchMock.mockRejectedValue(boom);
		await expect(fetchWithTimeout(freshUrl())).rejects.toBe(boom);
	});

	it('rethrows non-Error values unchanged', async () => {
		fetchMock.mockRejectedValue('weird');
		await expect(fetchWithTimeout(freshUrl())).rejects.toBe('weird');
	});

	it('clears the timeout timer when the request fails', async () => {
		vi.useFakeTimers();
		fetchMock.mockRejectedValue(new TypeError('fetch failed'));
		await expect(fetchWithTimeout(freshUrl(), { timeout: 60_000 })).rejects.toThrow('fetch failed');
		expect(vi.getTimerCount()).toBe(0);
	});
});

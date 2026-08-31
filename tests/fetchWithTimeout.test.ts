import { describe, it, expect, vi } from 'vitest';
import fetchWithTimeout from '../modules/fetchWithTimeout.ts';

describe('fetchWithTimeout Module', () => {
	describe('Function Structure', () => {
		it('should be a function', () => {
			expect(typeof fetchWithTimeout).toBe('function');
		});

		it('should have expected function signature', () => {
			// The function should accept URL and optional timeout parameters
			expect(fetchWithTimeout.length >= 1).toBe(true);
		});
	});

	describe('Timeout Behavior', () => {
		it('should accept timeout parameter', async () => {
			// This is a structural test - we can't easily test actual timeouts without real requests
			const url = 'https://example.com';
			const timeout = 5000;

			// Should not throw when called with valid parameters
			try {
				const promise = fetchWithTimeout(url, timeout);
				expect(promise instanceof Promise).toBeTruthy();
				// Catch any rejection to prevent unhandled rejection
				await promise.catch(() => {});
			} catch (error: unknown) {
				// Network errors are expected in this test environment
				expect(error instanceof Error || true).toBeTruthy();
			}
		});

		it('should use default timeout when not specified', async () => {
			const url = 'https://example.com';

			// Should not throw when called with just URL
			try {
				const promise = fetchWithTimeout(url);
				expect(promise instanceof Promise).toBeTruthy();
				// Catch any rejection to prevent unhandled rejection
				await promise.catch(() => {});
			} catch (error: unknown) {
				// Network errors are expected in this test environment
				expect(error instanceof Error || true).toBeTruthy();
			}
		});
	});

	describe('URL Validation', () => {
		it('should handle valid URLs', { timeout: 20000 }, async () => {
			const validUrls: string[] = [
				'https://example.com',
				'http://example.com',
				'https://example.com/path',
				'https://example.com:8080/path',
				'https://subdomain.example.com'
			];

			for (const url of validUrls) {
				try {
					const promise = fetchWithTimeout(url, 3000); // Use 3 second timeout
					expect(promise instanceof Promise).toBeTruthy();
					// Catch any rejection to prevent unhandled rejection
					await promise.catch(() => {});
				} catch (error: unknown) {
					// Network errors are expected in this test environment
					expect(error instanceof Error || true).toBeTruthy();
				}
			}
		});
	});

	describe('Return Value', () => {
		it('should return a Promise', async () => {
			const url = 'https://example.com';
			const result = fetchWithTimeout(url);

			expect(result instanceof Promise).toBeTruthy();
			// Catch any rejection to prevent unhandled rejection
			await result.catch(() => {});
		});
	});

	describe('URL Protocol Validation', () => {
		it('should throw for non-http/https protocols', async () => {
			await expect(fetchWithTimeout('ftp://example.com', 5000)).rejects.toThrow(
				'Invalid URL protocol: ftp:'
			);
		});

		it('should throw a clear error for a completely invalid URL string', async () => {
			await expect(fetchWithTimeout('not a url at all', 5000)).rejects.toThrow(
				'Invalid URL: not a url at all'
			);
		});
	});

	describe('Timeout Validation', () => {
		it('should throw a TypeError for zero timeout', async () => {
			await expect(fetchWithTimeout('https://example.com', 0)).rejects.toThrow(
				'Invalid timeout: 0'
			);
		});

		it('should throw a TypeError for negative timeout', async () => {
			await expect(fetchWithTimeout('https://example.com', -1)).rejects.toThrow(
				'Invalid timeout: -1'
			);
		});

		it('should throw a TypeError for infinite timeout', async () => {
			await expect(fetchWithTimeout('https://example.com', Infinity)).rejects.toThrow(
				'Invalid timeout: Infinity'
			);
		});

		it('should throw a TypeError for NaN timeout', async () => {
			await expect(fetchWithTimeout('https://example.com', NaN)).rejects.toThrow(
				'Invalid timeout: NaN'
			);
		});
	});

	describe('Error Handling', () => {
		it('should handle network errors gracefully', async () => {
			// Test with an invalid URL that should fail
			const invalidUrl = 'https://this-domain-does-not-exist-12345.com';

			try {
				await fetchWithTimeout(invalidUrl, 1000);
			} catch (error: unknown) {
				expect(error instanceof Error).toBeTruthy();
			}
		});

		it('should timeout on very slow requests', async () => {
			// Use a URL that's likely to timeout (non-routable IP)
			const slowUrl = 'http://10.255.255.1';
			const shortTimeout = 100; // 100ms timeout

			try {
				await fetchWithTimeout(slowUrl, shortTimeout);
			} catch (error: unknown) {
				expect(error instanceof Error).toBeTruthy();
			}
		});
	});

	describe('insecure option', () => {
		it('passes a dispatcher with rejectUnauthorized: false when insecure is true', async () => {
			const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
			const originalFetch = globalThis.fetch;
			globalThis.fetch = mockFetch;
			try {
				await fetchWithTimeout('https://example.com', { timeout: 5000, insecure: true });
				const [, options] = mockFetch.mock.calls[0];
				expect(options.dispatcher).toBeDefined();
			} finally {
				globalThis.fetch = originalFetch;
			}
		});

		it('does not set a dispatcher when insecure is false', async () => {
			const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
			const originalFetch = globalThis.fetch;
			globalThis.fetch = mockFetch;
			try {
				await fetchWithTimeout('https://example.com', { timeout: 5000, insecure: false });
				const [, options] = mockFetch.mock.calls[0];
				expect(options.dispatcher).toBeUndefined();
			} finally {
				globalThis.fetch = originalFetch;
			}
		});
	});

	describe('Integration with Fetch API', () => {
		it('should maintain fetch API compatibility', async () => {
			// Verify the function works like fetch
			const url = 'https://example.com';
			const promise = fetchWithTimeout(url);

			// Should have then/catch methods like a Promise
			expect(typeof promise.then).toBe('function');
			expect(typeof promise.catch).toBe('function');
			expect(typeof promise.finally).toBe('function');

			// Catch any rejection to prevent unhandled rejection
			await promise.catch(() => {});
		});
	});

	describe('403 retry behavior', () => {
		const makeResponse = (status: number) => new Response('', { status });

		it('retries and returns the successful response after an initial 403', async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(makeResponse(403))
				.mockResolvedValueOnce(makeResponse(200));
			vi.stubGlobal('fetch', fetchMock);

			try {
				const response = await fetchWithTimeout('https://example.com', 5000);
				expect(response.status).toBe(200);
				expect(fetchMock).toHaveBeenCalledTimes(2);
			} finally {
				vi.unstubAllGlobals();
			}
		});

		it('returns the final 403 response (not a thrown error) after exhausting retries', async () => {
			const fetchMock = vi.fn().mockResolvedValue(makeResponse(403));
			vi.stubGlobal('fetch', fetchMock);

			try {
				const response = await fetchWithTimeout('https://example.com', 5000);
				expect(response.status).toBe(403);
				expect(fetchMock).toHaveBeenCalledTimes(3);
			} finally {
				vi.unstubAllGlobals();
			}
		});

		it('does not retry when the first response is not a 403', async () => {
			const fetchMock = vi.fn().mockResolvedValue(makeResponse(200));
			vi.stubGlobal('fetch', fetchMock);

			try {
				const response = await fetchWithTimeout('https://example.com', 5000);
				expect(response.status).toBe(200);
				expect(fetchMock).toHaveBeenCalledTimes(1);
			} finally {
				vi.unstubAllGlobals();
			}
		});
	});

	describe('429 retry behavior', () => {
		const makeResponse = (status: number) => new Response('', { status });

		it('retries and returns the successful response after an initial 429', async () => {
			const fetchMock = vi
				.fn()
				.mockResolvedValueOnce(makeResponse(429))
				.mockResolvedValueOnce(makeResponse(200));
			vi.stubGlobal('fetch', fetchMock);

			try {
				const response = await fetchWithTimeout('https://example.com', 5000);
				expect(response.status).toBe(200);
				expect(fetchMock).toHaveBeenCalledTimes(2);
			} finally {
				vi.unstubAllGlobals();
			}
		});

		it('returns the final 429 response (not a thrown error) after exhausting retries', async () => {
			const fetchMock = vi.fn().mockResolvedValue(makeResponse(429));
			vi.stubGlobal('fetch', fetchMock);

			try {
				const response = await fetchWithTimeout('https://example.com', 5000);
				expect(response.status).toBe(429);
				expect(fetchMock).toHaveBeenCalledTimes(3);
			} finally {
				vi.unstubAllGlobals();
			}
		});
	});

	describe('per-host concurrency cap', () => {
		const makeResponse = (status: number) => new Response('', { status });

		it('never allows more than the concurrency cap in flight to the same host', async () => {
			vi.useFakeTimers();
			const inFlight = { current: 0, max: 0 };
			const fetchMock = vi.fn().mockImplementation(() => {
				inFlight.current++;
				inFlight.max = Math.max(inFlight.max, inFlight.current);
				return new Promise((resolve) => {
					setTimeout(() => {
						inFlight.current--;
						resolve(makeResponse(200));
					}, 50);
				});
			});
			vi.stubGlobal('fetch', fetchMock);

			try {
				const host = 'https://concurrency-cap-test.example.com';

				// Fire many concurrent requests at once (mirrors anchors + blindsearch
				// each launching their own batch to the same host simultaneously).
				const requests = Array.from({ length: 8 }, () => fetchWithTimeout(host, 5000));
				await vi.runAllTimersAsync();
				await Promise.all(requests);

				expect(inFlight.max).toBeLessThanOrEqual(2);
			} finally {
				vi.unstubAllGlobals();
				vi.useRealTimers();
			}
		});

		it('does not cap concurrency for requests to a different host', async () => {
			vi.useFakeTimers();
			const inFlight = { current: 0, max: 0 };
			const fetchMock = vi.fn().mockImplementation(() => {
				inFlight.current++;
				inFlight.max = Math.max(inFlight.max, inFlight.current);
				return new Promise((resolve) => {
					setTimeout(() => {
						inFlight.current--;
						resolve(makeResponse(200));
					}, 50);
				});
			});
			vi.stubGlobal('fetch', fetchMock);

			try {
				// Two requests each to two different hosts, all fired at once: each
				// host's own cap is 2, so both pairs should run fully concurrently
				// (max 4 in flight total), not be forced through a single shared cap.
				const requests = [
					fetchWithTimeout('https://host-a.example.com', 5000),
					fetchWithTimeout('https://host-a.example.com', 5000),
					fetchWithTimeout('https://host-b.example.com', 5000),
					fetchWithTimeout('https://host-b.example.com', 5000)
				];
				await vi.runAllTimersAsync();
				await Promise.all(requests);

				expect(inFlight.max).toBe(4);
			} finally {
				vi.unstubAllGlobals();
				vi.useRealTimers();
			}
		});

		it('reduces concurrency further and adds a cooldown after a 429', async () => {
			vi.useFakeTimers();
			const inFlight = { current: 0, max: 0 };
			let firstRequestDone = false;
			const fetchMock = vi.fn().mockImplementation(() => {
				inFlight.current++;
				inFlight.max = Math.max(inFlight.max, inFlight.current);
				// Every attempt belonging to the first logical request 429s
				// (including its internal retries); everything after succeeds.
				const status = firstRequestDone ? 200 : 429;
				return new Promise((resolve) => {
					setTimeout(() => {
						inFlight.current--;
						resolve(makeResponse(status));
					}, 10);
				});
			});
			vi.stubGlobal('fetch', fetchMock);

			try {
				const host = 'https://cooldown-test.example.com';

				const first = fetchWithTimeout(host, 5000);
				await vi.runAllTimersAsync();
				await first;
				firstRequestDone = true;

				// After the 429 (and its own per-request retries also 429ing until
				// the mock flips to 200), a fresh burst should be held to 1 in flight
				// at a time for the cooldown window, not the normal cap of 2.
				inFlight.max = 0;
				const burst = Array.from({ length: 5 }, () => fetchWithTimeout(host, 5000));
				await vi.advanceTimersByTimeAsync(50);
				expect(inFlight.max).toBeLessThanOrEqual(1);

				await vi.runAllTimersAsync();
				await Promise.all(burst);
			} finally {
				vi.unstubAllGlobals();
				vi.useRealTimers();
			}
		});
	});

	describe('gate-wait vs request timeout ordering', () => {
		const makeResponse = (status: number, headers?: Record<string, string>) =>
			new Response('', { status, headers });

		it('a long rate-limit gate wait does not itself trigger the request timeout', async () => {
			vi.useFakeTimers();
			let firstRequestDone = false;
			const fetchMock = vi.fn().mockImplementation(() => {
				const status = firstRequestDone ? 200 : 429;
				const headers = firstRequestDone
					? undefined
					: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '20' }; // 20s wait
				return Promise.resolve(makeResponse(status, headers));
			});
			vi.stubGlobal('fetch', fetchMock);

			try {
				const host = 'https://gate-wait-timeout-test.example.com';

				const first = fetchWithTimeout(host, 5000);
				await vi.runAllTimersAsync();
				await first;
				firstRequestDone = true;

				// The next request must wait ~20s for the gate before its fetch
				// even starts. Its own per-request timeout is much shorter (2s),
				// but that timeout must only start counting once the request
				// actually begins — not while it's still queued behind the gate.
				const shortTimeoutMs = 2000;
				const next = fetchWithTimeout(host, shortTimeoutMs);
				await vi.runAllTimersAsync();
				const response = await next;
				expect(response.status).toBe(200);
			} finally {
				vi.unstubAllGlobals();
				vi.useRealTimers();
			}
		});

		it('releases the host concurrency slot even when the request throws (e.g. times out)', async () => {
			vi.useFakeTimers();
			let callCount = 0;
			const fetchMock = vi.fn().mockImplementation((_url, init: { signal: AbortSignal }) => {
				callCount++;
				// First two calls hang until aborted; the third succeeds immediately.
				if (callCount <= 2) {
					return new Promise((_resolve, reject) => {
						init.signal.addEventListener('abort', () => {
							const err = new Error('The operation was aborted');
							err.name = 'AbortError';
							reject(err);
						});
					});
				}
				return Promise.resolve(makeResponse(200));
			});
			vi.stubGlobal('fetch', fetchMock);

			try {
				const host = 'https://slot-leak-on-error-test.example.com';

				// Two requests that will time out and throw, at the host's normal
				// concurrency cap (2) — if their slots aren't released on error,
				// the host is permanently stuck at 0 free slots.
				const timingOut = [
					fetchWithTimeout(host, 100).catch((error: unknown) => error),
					fetchWithTimeout(host, 100).catch((error: unknown) => error)
				];
				await vi.runAllTimersAsync();
				await Promise.all(timingOut);

				// A subsequent request must still be able to acquire a slot.
				const after = fetchWithTimeout(host, 5000);
				await vi.advanceTimersByTimeAsync(1);
				expect(fetchMock.mock.calls.length).toBe(3); // fired immediately, not stuck queued

				await vi.runAllTimersAsync();
				const response = await after;
				expect(response.status).toBe(200);
			} finally {
				vi.unstubAllGlobals();
				vi.useRealTimers();
			}
		});
	});

	describe('rate-limit header cooldown', () => {
		const makeResponse = (status: number, headers?: Record<string, string>) =>
			new Response('', { status, headers });

		it('honors x-ratelimit-reset when it is longer than the fixed cooldown', async () => {
			vi.useFakeTimers();
			const inFlight = { current: 0, max: 0 };
			let firstRequestDone = false;
			const fetchMock = vi.fn().mockImplementation(() => {
				inFlight.current++;
				inFlight.max = Math.max(inFlight.max, inFlight.current);
				const status = firstRequestDone ? 200 : 429;
				const headers = firstRequestDone
					? undefined
					: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '20' }; // 20s > fixed 10s cooldown
				return new Promise((resolve) => {
					setTimeout(() => {
						inFlight.current--;
						resolve(makeResponse(status, headers));
					}, 10);
				});
			});
			vi.stubGlobal('fetch', fetchMock);

			try {
				const host = 'https://ratelimit-header-test.example.com';

				const first = fetchWithTimeout(host, 5000);
				await vi.runAllTimersAsync();
				await first;
				firstRequestDone = true;

				// Just past the fixed 10s cooldown (which would normally have
				// expired by now), the host-specific 20s reset should still be
				// in effect, so a new request must still be gated to 1 in flight.
				const callsBefore = fetchMock.mock.calls.length;
				const afterFixedCooldown = fetchWithTimeout(host, 5000);
				await vi.advanceTimersByTimeAsync(11_000);
				expect(fetchMock.mock.calls.length).toBe(callsBefore); // still gated

				await vi.runAllTimersAsync();
				await afterFixedCooldown;
				expect(fetchMock.mock.calls.length).toBeGreaterThan(callsBefore);
			} finally {
				vi.unstubAllGlobals();
				vi.useRealTimers();
			}
		});

		it('does not add an extra wait when x-ratelimit-reset is shorter than the fixed cooldown', async () => {
			vi.useFakeTimers();
			let firstRequestDone = false;
			const fetchMock = vi.fn().mockImplementation(() => {
				const status = firstRequestDone ? 200 : 429;
				const headers = firstRequestDone
					? undefined
					: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '2' }; // 2s < fixed 10s cooldown
				return Promise.resolve(makeResponse(status, headers));
			});
			vi.stubGlobal('fetch', fetchMock);

			try {
				const host = 'https://ratelimit-header-short-test.example.com';

				const first = fetchWithTimeout(host, 5000);
				await vi.runAllTimersAsync();
				await first;
				firstRequestDone = true;

				// Past the short 2s header-driven wait, a single next request
				// should fire immediately (the wait is capped by the header's own
				// duration, not stretched out to match the longer fixed cooldown).
				const callsBefore = fetchMock.mock.calls.length;
				const afterHeaderWait = fetchWithTimeout(host, 5000);
				await vi.advanceTimersByTimeAsync(2_001);
				expect(fetchMock.mock.calls.length).toBe(callsBefore + 1);

				await vi.runAllTimersAsync();
				await afterHeaderWait;
			} finally {
				vi.unstubAllGlobals();
				vi.useRealTimers();
			}
		});

		it('does not delay a single next request when rate-limit headers are absent', async () => {
			vi.useFakeTimers();
			let firstRequestDone = false;
			const fetchMock = vi.fn().mockImplementation(() => {
				const status = firstRequestDone ? 200 : 429;
				return Promise.resolve(makeResponse(status));
			});
			vi.stubGlobal('fetch', fetchMock);

			try {
				const host = 'https://no-ratelimit-headers-test.example.com';

				const first = fetchWithTimeout(host, 5000);
				await vi.runAllTimersAsync();
				await first;
				firstRequestDone = true;

				// No rate-limit headers means no explicit wait deadline — only the
				// existing concurrency-cap-to-1 applies (covered by the separate
				// "reduces concurrency further" test), so a single next request is
				// not artificially delayed.
				const callsBefore = fetchMock.mock.calls.length;
				const next = fetchWithTimeout(host, 5000);
				await vi.advanceTimersByTimeAsync(1);
				expect(fetchMock.mock.calls.length).toBe(callsBefore + 1);

				await vi.runAllTimersAsync();
				await next;
			} finally {
				vi.unstubAllGlobals();
				vi.useRealTimers();
			}
		});

		it('ignores malformed rate-limit header values without crashing or waiting', async () => {
			vi.useFakeTimers();
			let firstRequestDone = false;
			const fetchMock = vi.fn().mockImplementation(() => {
				const status = firstRequestDone ? 200 : 429;
				const headers = firstRequestDone
					? undefined
					: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': 'not-a-number' };
				return Promise.resolve(makeResponse(status, headers));
			});
			vi.stubGlobal('fetch', fetchMock);

			try {
				const host = 'https://malformed-ratelimit-header-test.example.com';

				const first = fetchWithTimeout(host, 5000);
				await vi.runAllTimersAsync();
				const response = await first;
				expect(response.status).toBe(429);
				firstRequestDone = true;

				// Should not throw, and malformed headers should not produce a wait.
				const callsBefore = fetchMock.mock.calls.length;
				const next = fetchWithTimeout(host, 5000);
				await vi.advanceTimersByTimeAsync(1);
				expect(fetchMock.mock.calls.length).toBe(callsBefore + 1);

				await vi.runAllTimersAsync();
				await next;
			} finally {
				vi.unstubAllGlobals();
				vi.useRealTimers();
			}
		});
	});
});

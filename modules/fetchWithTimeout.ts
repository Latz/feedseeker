/**
 * @fileoverview fetchWithTimeout - HTTP fetch utility with timeout support
 *
 * This module provides a fetch wrapper that adds timeout functionality to prevent
 * hanging requests. It uses AbortController for clean cancellation and provides
 * detailed error messages for different failure scenarios.
 *
 * @module fetchWithTimeout
 * @version 2.0.0
 * @author latz
 * @since 1.0.0
 */

import { Agent } from 'undici';
import { tryTlsSpoofFallback } from './tlsSpoofFallback.ts';
import { acquireHostSlot, getHostname } from './hostRateLimiter.ts';
import { isChallengeResponse } from './challengeDetection.ts';

let insecureAgent: Agent | undefined;

// Module-wide switch for the TLS-fingerprint-spoofing fallback (see
// tlsSpoofFallback.ts), on by default. Exposed as a setter rather than a
// per-call option threaded through every fetchWithTimeout() call site (of
// which there are several across the codebase) — this is a global escape
// hatch, not a per-request choice, so the CLI sets it once at startup from
// the hidden `--no-tls-spoof` flag.
let tlsSpoofEnabled = true;
export function setTlsSpoofEnabled(enabled: boolean): void {
	tlsSpoofEnabled = enabled;
}

// Total attempts (including the first) made when a response is HTTP 403 or 429,
// to ride out probabilistic bot-scoring (e.g. Cloudflare) or transient rate
// limiting on the same URL.
const RETRYABLE_STATUS_CODES = new Set([403, 429]);
const FORBIDDEN_RETRY_ATTEMPTS = 3;
const FORBIDDEN_RETRY_DELAY_MS = 300;

/**
 * Extended RequestInit with timeout option
 */
export interface FetchWithTimeoutOptions extends RequestInit {
	timeout?: number;
	insecure?: boolean;
}

/**
 * Normalizes the legacy `fetchWithTimeout(url, timeoutMs)` and current
 * `fetchWithTimeout(url, options)` call shapes into a single resolved form.
 */
function resolveFetchOptions(
	optionsOrTimeout: number | FetchWithTimeoutOptions
): { timeout: number; insecure: boolean; fetchOptions: RequestInit } {
	if (typeof optionsOrTimeout === 'number') {
		return { timeout: optionsOrTimeout, insecure: false, fetchOptions: {} };
	}

	const {
		timeout: optTimeout = 5000,
		insecure: optInsecure = false,
		...restOptions
	} = optionsOrTimeout;
	return { timeout: optTimeout, insecure: optInsecure, fetchOptions: restOptions };
}

/**
 * Validates the URL protocol and timeout value, throwing the same errors
 * fetchWithTimeout has always thrown for invalid input.
 */
function validateFetchInputs(url: string, timeout: number): void {
	try {
		const urlObj = new URL(url);
		if (!['http:', 'https:'].includes(urlObj.protocol)) {
			throw new Error(
				`Invalid URL protocol: ${urlObj.protocol}. Only http: and https: are allowed.`
			);
		}
	} catch (error: unknown) {
		if (error instanceof TypeError) {
			const err = new Error(`Invalid URL: ${url}`);
			err.cause = error;
			throw err;
		}
		throw error;
	}

	if (timeout <= 0) {
		throw new TypeError(`Invalid timeout: ${timeout}. Timeout must be a positive number.`);
	}

	if (!Number.isFinite(timeout)) {
		throw new TypeError(`Invalid timeout: ${timeout}. Timeout must be a finite number.`);
	}
}

/**
 * Fetches a URL with a configurable timeout and custom options
 * Uses AbortController to cleanly cancel requests that exceed the timeout
 * @param {string} url - The URL to fetch (must be a valid HTTP/HTTPS URL)
 * @param {number | FetchWithTimeoutOptions} [optionsOrTimeout={}] - Timeout in milliseconds or fetch options including timeout
 * @returns {Promise<Response>} The fetch response
 * @throws {Error} When the request times out, URL is invalid, or network errors occur
 * @example
 * // Basic usage with default timeout
 * const response = await fetchWithTimeout('https://example.com');
 *
 * // Custom timeout (10 seconds) - backward compatible
 * const response = await fetchWithTimeout('https://slow-site.com', 10000);
 *
 * // Custom timeout using options object
 * const response = await fetchWithTimeout('https://slow-site.com', { timeout: 10000 });
 *
 * // POST request with custom headers and timeout
 * const response = await fetchWithTimeout('https://api.example.com', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json' },
 *   body: JSON.stringify({ data: 'value' }),
 *   timeout: 5000
 * });
 *
 * // Handle timeout gracefully
 * try {
 *   const response = await fetchWithTimeout('https://example.com', { timeout: 1000 });
 *   const data = await response.text();
 * } catch (error) {
 *   console.log('Request failed or timed out');
 * }
 */
export default async function fetchWithTimeout(
	url: string,
	optionsOrTimeout: number | FetchWithTimeoutOptions = {}
): Promise<Response> {
	const { timeout, insecure, fetchOptions } = resolveFetchOptions(optionsOrTimeout);
	validateFetchInputs(url, timeout);

	// Default browser-like headers to avoid being blocked by Cloudflare
	const defaultHeaders: HeadersInit = {
		'User-Agent':
			'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36',
		Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
		'Accept-Language': 'en-US,en;q=0.5',
		'Accept-Encoding': 'gzip, deflate, br',
		Connection: 'keep-alive',
		'Upgrade-Insecure-Requests': '1',
		'Sec-CH-UA': '"Chromium";v="132", "Google Chrome";v="132", "Not-A.Brand";v="99"',
		'Sec-CH-UA-Mobile': '?0',
		'Sec-CH-UA-Platform': '"Windows"',
		'Sec-Fetch-Dest': 'document',
		'Sec-Fetch-Mode': 'navigate',
		'Sec-Fetch-Site': 'none',
		'Cache-Control': 'max-age=0'
	};

	// Merge default headers with custom headers (custom headers take precedence)
	const headers = {
		...defaultHeaders,
		...fetchOptions.headers
	};

	if (insecure) insecureAgent ??= new Agent({ connect: { rejectUnauthorized: false } });
	const dispatcher = insecure ? insecureAgent : undefined;

	// Wait for this host's concurrency slot / rate-limit gate BEFORE starting the
	// request timeout — a host under heavy rate-limiting (e.g. Reddit) can require
	// a wait longer than a single request's own timeout budget; that wait must not
	// itself count against (and falsely trip) the request timeout.
	const hostname = getHostname(url);
	const releaseHostSlot = await acquireHostSlot(hostname);

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

	try {
		const fetchInit: RequestInit = {
			...fetchOptions,
			signal: controller.signal,
			headers,
			...(dispatcher ? { dispatcher } : {})
		};

		// Retry on 403/429: some sites (e.g. behind Cloudflare) apply probabilistic
		// bot-scoring where the identical request can pass or fail from one
		// attempt to the next, independent of headers or protocol; others apply
		// transient rate limiting (429) that clears on its own shortly after.
		// A response carrying a bot-mitigation challenge signature (e.g.
		// Cloudflare's `cf-mitigated: challenge` header) is neither — it's a
		// JS challenge no HTTP client here can solve, so every retry would
		// just get the same result. Stop immediately in that case: retrying
		// wastes time, and (via hostRateLimiter's 429 cooldown) can otherwise
		// serialize an entire blind search behind a challenge that will never
		// clear on its own.
		let response = await fetch(url, fetchInit);
		let isChallenge = isChallengeResponse(response, '');
		for (
			let attempt = 1;
			attempt < FORBIDDEN_RETRY_ATTEMPTS &&
			RETRYABLE_STATUS_CODES.has(response.status) &&
			!isChallenge;
			attempt++
		) {
			await new Promise((resolve) => setTimeout(resolve, FORBIDDEN_RETRY_DELAY_MS));
			response = await fetch(url, fetchInit);
			isChallenge = isChallengeResponse(response, '');
		}

		// Last resort: a 403 that survived every retry is worth one attempt
		// through a TLS-fingerprint-spoofing client (see tlsSpoofFallback.ts).
		// Deliberately not gated on isChallengeResponse()'s body/header
		// signatures — empirically, plenty of TLS-fingerprint-only blocks
		// (confirmed against electrive.net) return a plain 403 error page with
		// none of those markers, not a "Just a moment..."-style challenge page,
		// so requiring that signature here would miss the exact case this
		// fallback exists for. 429 is excluded: it's a rate-limit signal, not a
		// fingerprinting gate, and retrying it with a different client wastes
		// the already-paid cooldown.
		if (tlsSpoofEnabled && response.status === 403) {
			const spoofed = await tryTlsSpoofFallback(url, { timeout, headers });
			if (spoofed) response = spoofed;
		}

		releaseHostSlot(response);

		clearTimeout(timeoutId);
		return response;
	} catch (error: unknown) {
		clearTimeout(timeoutId);
		releaseHostSlot(null);

		// Provide clear error message for timeout
		if (error instanceof Error && error.name === 'AbortError') {
			const err = new Error(`Request to ${url} timed out after ${timeout}ms`);
			err.cause = error;
			throw err;
		}

		// Re-throw other errors
		throw error;
	}
}

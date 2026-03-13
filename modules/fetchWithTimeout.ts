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

/**
 * Extended RequestInit with timeout option
 */
export interface FetchWithTimeoutOptions extends RequestInit {
	timeout?: number;
	insecure?: boolean;
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
	// Handle backward compatibility: if second param is a number, treat it as timeout
	let timeout: number;
	let fetchOptions: RequestInit;

	let insecure = false;
	if (typeof optionsOrTimeout === 'number') {
		// Old signature: fetchWithTimeout(url, timeout)
		timeout = optionsOrTimeout;
		fetchOptions = {};
	} else {
		// New signature: fetchWithTimeout(url, options)
		const { timeout: optTimeout = 5000, insecure: optInsecure = false, ...restOptions } = optionsOrTimeout;
		timeout = optTimeout;
		insecure = optInsecure;
		fetchOptions = restOptions;
	}

	// Validate URL
	try {
		const urlObj = new URL(url);
		if (!['http:', 'https:'].includes(urlObj.protocol)) {
			throw new Error(`Invalid URL protocol: ${urlObj.protocol}. Only http: and https: are allowed.`);
		}
	} catch (error: unknown) {
		if (error instanceof TypeError) {
			throw new Error(`Invalid URL: ${url}`);
		}
		throw error;
	}

	// Validate timeout
	if (timeout <= 0) {
		throw new TypeError(`Invalid timeout: ${timeout}. Timeout must be a positive number.`);
	}

	if (!Number.isFinite(timeout)) {
		throw new TypeError(`Invalid timeout: ${timeout}. Timeout must be a finite number.`);
	}

	// Set up abort controller for timeout
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeout);

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
		'Cache-Control': 'max-age=0',
	};

	// Merge default headers with custom headers (custom headers take precedence)
	const headers = {
		...defaultHeaders,
		...fetchOptions.headers,
	};

	const dispatcher = insecure ? new Agent({ connect: { rejectUnauthorized: false } }) : undefined;

	try {
		const response = await fetch(url, {
			...fetchOptions,
			signal: controller.signal,
			headers,
			...(dispatcher ? { dispatcher } : {}),
		} as RequestInit);
		clearTimeout(timeoutId);
		return response;
	} catch (error: unknown) {
		clearTimeout(timeoutId);

		// Provide clear error message for timeout
		if (error instanceof Error && error.name === 'AbortError') {
			throw new Error(`Request to ${url} timed out after ${timeout}ms`);
		}

		// Re-throw other errors
		throw error;
	}
}

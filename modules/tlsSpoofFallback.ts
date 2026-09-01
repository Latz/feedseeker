/**
 * @fileoverview tlsSpoofFallback - Optional TLS-fingerprint-spoofing fetch fallback
 *
 * Node's undici-based `fetch` has a TLS/HTTP2 fingerprint that some
 * Cloudflare-protected sites block on, even though a real browser (or tools
 * that mimic one) get through. This module wraps the optional `node-wreq`
 * package — which impersonates real browser TLS/JA3/JA4/HTTP2 fingerprints
 * without running an actual browser engine — as a last-resort fallback for
 * requests that are confirmed to have hit a bot-mitigation challenge page.
 *
 * `node-wreq` is an optionalDependency: it ships prebuilt native bindings
 * for the common desktop/server platforms, but not every platform. This
 * module is the ONLY place in the codebase that imports it, and never
 * throws — every failure mode (not installed, unsupported platform, the
 * fallback request itself failing) resolves to `null`, so callers can
 * always safely fall back to their existing behavior. This keeps the
 * feature fully optional and easily removable without touching
 * `fetchWithTimeout.ts` beyond its single call-site hook.
 *
 * Note: `node-wreq`'s TlsOptions has no certificate-verification-skip
 * equivalent to undici's `rejectUnauthorized: false`, so the `insecure`
 * option is intentionally not passed through — this fallback only ever
 * runs against confirmed bot-challenge pages, which are not the same
 * class of request as the `--insecure` self-signed-cert use case.
 *
 * @module tlsSpoofFallback
 */

export interface TlsSpoofFallbackOptions {
	timeout: number;
	headers?: HeadersInit;
}

// Fixed, reasonably current browser profile. Deliberately not kept in sync
// with fetchWithTimeout.ts's own hand-rolled Chrome UA string — mixing a
// declared UA with a TLS fingerprint that doesn't match it is itself a bot
// signal, and keeping two profiles in sync is exactly the burden node-wreq's
// bundled profiles are meant to remove.
const BROWSER_PROFILE = 'chrome_149';

const DIAGNOSTIC_HEADER = 'x-feedseeker-tls-spoof';

type WreqFetch = (
	url: string,
	options: { browser: string; timeout: number; headers?: HeadersInit }
) => Promise<{
	status: number;
	statusText: string;
	url: string;
	headers: { forEach: (callback: (value: string, key: string) => void) => void };
	text: () => Promise<string>;
}>;

let cachedWreqFetch: WreqFetch | null | undefined;

async function getWreqFetch(): Promise<WreqFetch | null> {
	if (cachedWreqFetch !== undefined) return cachedWreqFetch;

	try {
		const mod = (await import('node-wreq')) as { fetch: WreqFetch };
		cachedWreqFetch = mod.fetch;
	} catch {
		// Not installed, or unsupported platform (no prebuilt native binary) —
		// cache the negative result so we don't re-attempt on every call.
		cachedWreqFetch = null;
	}
	return cachedWreqFetch;
}

/**
 * Attempts a single request through node-wreq's browser-fingerprint-spoofing
 * client. Returns a real WHATWG `Response` on success (with a diagnostic
 * `x-feedseeker-tls-spoof: success` header), or `null` on any failure —
 * node-wreq unavailable, or the request itself failing/erroring. Never throws.
 */
export async function tryTlsSpoofFallback(
	url: string,
	options: TlsSpoofFallbackOptions
): Promise<Response | null> {
	const wreqFetch = await getWreqFetch();
	if (!wreqFetch) return null;

	try {
		const wreqResponse = await wreqFetch(url, {
			browser: BROWSER_PROFILE,
			timeout: options.timeout,
			...(options.headers ? { headers: options.headers } : {})
		});

		const headers = new Headers();
		wreqResponse.headers.forEach((value, key) => headers.set(key, value));
		headers.set(DIAGNOSTIC_HEADER, 'success');

		const body = await wreqResponse.text();
		return new Response(body, {
			status: wreqResponse.status,
			statusText: wreqResponse.statusText,
			headers
		});
	} catch {
		return null;
	}
}

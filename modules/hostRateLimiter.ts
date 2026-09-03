/**
 * @fileoverview hostRateLimiter - Per-hostname concurrency cap and rate-limit gate
 *
 * Throttling policy applied to outgoing requests, kept separate from the fetch
 * mechanics in fetchWithTimeout.ts. Exposes a single entry point,
 * acquireHostSlot(), which blocks until this host has a free slot and any
 * active rate-limit wait has elapsed, and returns a release callback.
 *
 * @module hostRateLimiter
 */

// Per-hostname concurrency cap: feedseeker's own search strategies (anchors,
// blindsearch, etc.) run concurrently and independently, and can each open
// several simultaneous connections to the same host at once. Some sites rate
// limit based on concurrent connections rather than overall request rate —
// confirmed empirically (see fetchWithTimeout.test.ts comments) that a site
// can tolerate many sequential or even lightly-concurrent (2 at a time)
// requests indefinitely, but trips a 429 once ~3+ requests to it are in
// flight simultaneously, and that once tripped, the block can persist for
// tens of seconds even after load drops — far longer than the existing
// per-request retry (300ms apart) can ride out.
//
// This cap is enforced proactively (a small semaphore per hostname), not
// reactively after a 429, since by the time a 429 arrives the limit has
// already been exceeded by requests already in flight from other strategies.
// On top of the cap, a 429 still triggers an additional cooldown window
// during which the per-host concurrency is reduced further (to 1), since a
// tripped limiter needs time to recover, not just fewer simultaneous requests.
//
// Some hosts (e.g. Reddit) rate-limit by request *rate* within a time window,
// not by concurrency — even a single request issued too soon after a 429 will
// still be rejected, no matter how low concurrency is dropped. When such a
// host reports its rate-limit state via the (widely-used) x-ratelimit-remaining
// / x-ratelimit-reset headers, that reset time is used to make the *next*
// request to that host actually wait, on top of (not instead of) the
// concurrency-cap-to-1 behavior above.
const HOST_MAX_CONCURRENCY = 2;
const HOST_THROTTLED_CONCURRENCY = 1;
const HOST_COOLDOWN_MS = 10_000;

interface HostState {
	active: number;
	queue: Array<() => void>;
	cooldownUntil: number;
	waitUntil: number;
}
const hostState = new Map<string, HostState>();

export function getHostname(url: string): string {
	try {
		return new URL(url).hostname;
	} catch {
		return url;
	}
}

function getOrCreateHostState(hostname: string): HostState {
	let state = hostState.get(hostname);
	if (!state) {
		state = { active: 0, queue: [], cooldownUntil: 0, waitUntil: 0 };
		hostState.set(hostname, state);
	}
	return state;
}

function currentLimit(state: HostState): number {
	return Date.now() < state.cooldownUntil ? HOST_THROTTLED_CONCURRENCY : HOST_MAX_CONCURRENCY;
}

/**
 * Parses standard rate-limit response headers (x-ratelimit-remaining /
 * x-ratelimit-reset, as used by Reddit, GitHub, and others) and returns the
 * number of milliseconds to wait before the next request to this host, or
 * null if the headers are absent, malformed, or don't indicate exhaustion.
 */
function getRateLimitWaitMs(response: Response): number | null {
	const remaining = Number(response.headers?.get('x-ratelimit-remaining'));
	const resetSeconds = Number(response.headers?.get('x-ratelimit-reset'));

	if (!Number.isFinite(remaining) || !Number.isFinite(resetSeconds)) return null;
	if (remaining > 0 || resetSeconds <= 0) return null;

	return resetSeconds * 1000;
}

/**
 * Waits for a free concurrency slot on this host (capped at
 * HOST_MAX_CONCURRENCY, or HOST_THROTTLED_CONCURRENCY during an active
 * cooldown), then waits out any active rate-limit `waitUntil` deadline before
 * reserving the slot. Returns a function to call with the completed response,
 * which releases the slot and, based on the response, starts/extends the
 * cooldown window and/or the rate-limit wait deadline.
 */
export async function acquireHostSlot(
	hostname: string
): Promise<(response: Response | null) => void> {
	const state = getOrCreateHostState(hostname);

	while (state.active >= currentLimit(state)) {
		await new Promise<void>((resolve) => state.queue.push(resolve));
	}

	const wait = state.waitUntil - Date.now();
	if (wait > 0) {
		await new Promise((resolve) => setTimeout(resolve, wait));
	}

	state.active++;

	// response is null when the request errored/timed out before producing a
	// response (e.g. AbortError) — the slot must still be released, just with
	// nothing to inspect for cooldown/rate-limit signals.
	return (response: Response | null) => {
		state.active--;
		// A 429 carrying Cloudflare's `cf-mitigated: challenge` header is a bot
		// challenge, not a real rate limit — it will not clear within
		// HOST_COOLDOWN_MS (or ever, for this client), so starting the normal
		// cooldown here would just keep re-arming it on every subsequent
		// challenge response and serialize the rest of the search behind a
		// wait that never pays off.
		const isChallenge = response?.headers?.get('cf-mitigated') === 'challenge';
		if (response?.status === 429 && !isChallenge) {
			state.cooldownUntil = Date.now() + HOST_COOLDOWN_MS;
		}
		const rateLimitWaitMs = response ? getRateLimitWaitMs(response) : null;
		if (rateLimitWaitMs !== null) {
			state.waitUntil = Math.max(state.waitUntil, Date.now() + rateLimitWaitMs);
		}
		const next = state.queue.shift();
		next?.();
	};
}

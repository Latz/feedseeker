import fetchWithTimeout from './fetchWithTimeout.ts';

/**
 * Apple Podcasts pages carry no <link rel="alternate"> to the feed, but the
 * public iTunes lookup API returns it. Returns the feed URL for a
 * podcasts.apple.com/.../id<digits> page, or null (not Apple, or lookup failed).
 */
export default async function lookupApplePodcastFeed(
	site: string,
	options: { timeout?: number; insecure?: boolean } = {}
): Promise<string | null> {
	let url: URL;
	try {
		url = new URL(site);
	} catch {
		return null;
	}
	if (url.hostname !== 'podcasts.apple.com') return null;
	const id = /\/id(\d+)(?:\/|$)/.exec(url.pathname)?.[1];
	if (!id) return null;

	try {
		const res = await fetchWithTimeout(`https://itunes.apple.com/lookup?id=${id}&entity=podcast`, options);
		if (!res.ok) return null;
		const data = (await res.json()) as { results?: { feedUrl?: string }[] };
		return data.results?.[0]?.feedUrl ?? null;
	} catch {
		return null;
	}
}

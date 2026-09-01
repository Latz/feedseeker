import { parseUrlSafely } from './urlUtils.ts';

// Pre-converted array for subdomain suffix checks — avoids re-allocating on every isAllowedDomain() call
const ALLOWED_DOMAINS_ARRAY: string[] = [];

// Module-level Set of allowed external feed hosting domains (FeedBurner services).
// Hoisted here so it is allocated once, not on every isAllowedDomain() call.
export const ALLOWED_DOMAINS = new Set([
	'feedburner.com',
	'feeds.feedburner.com',
	'feedproxy.google.com',
	'feeds2.feedburner.com'
]);
ALLOWED_DOMAINS_ARRAY.push(...ALLOWED_DOMAINS);

/**
 * Checks if a URL is on the same domain as the base URL or is an allowed external domain (like feed hosting services)
 * @param {string} url - The URL to check
 * @param {URL} baseUrl - The base URL for comparison
 * @returns {boolean} True if the URL is on the same domain or is an allowed external domain, false otherwise
 */
export function isAllowedDomain(url: string, baseUrl: URL): boolean {
	const parsedUrl = parseUrlSafely(url);
	if (!parsedUrl) {
		// If URL parsing fails, it's likely a relative URL which should be same-domain by definition
		return true;
	}

	// Check if it's the same domain
	if (parsedUrl.hostname === baseUrl.hostname) {
		return true;
	}

	// Allow common feed hosting services as exceptions
	// These services host feeds for other websites and should be considered valid external sources
	return (
		ALLOWED_DOMAINS.has(parsedUrl.hostname) ||
		ALLOWED_DOMAINS_ARRAY.some((domain) => parsedUrl.hostname.endsWith('.' + domain))
	);
}

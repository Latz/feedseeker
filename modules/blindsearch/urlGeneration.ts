import { MAX_URL_LENGTH, isValidUrlLength } from './validation.ts';

const MAX_GENERATED_URLS = 10000; // Maximum number of URLs to generate (prevent memory exhaustion)

/**
 * Validates a URL for use in blind search, throwing descriptive errors for invalid input.
 */
function validateBlindSearchUrl(siteUrl: string): URL {
	let urlObj: URL;
	try {
		urlObj = new URL(siteUrl);
	} catch {
		throw new Error(`Invalid URL provided to blindSearch: ${siteUrl}`);
	}
	if (!isValidUrlLength(siteUrl)) {
		throw new Error(
			`URL too long (${siteUrl.length} chars). Maximum allowed: ${MAX_URL_LENGTH} characters.`
		);
	}
	if (!['http:', 'https:'].includes(urlObj.protocol)) {
		throw new Error(`Invalid protocol "${urlObj.protocol}". Only http: and https: are allowed.`);
	}
	return urlObj;
}

function appendEndpointsForPath(
	basePath: string,
	endpoints: string[],
	queryParams: string,
	endpointUrls: string[]
): boolean {
	for (const endpoint of endpoints) {
		if (endpointUrls.length >= MAX_GENERATED_URLS) {
			console.warn(
				`URL generation limit reached (${MAX_GENERATED_URLS} URLs). Stopping to prevent resource exhaustion.`
			);
			return false;
		}
		const urlWithParams = queryParams
			? `${basePath}/${endpoint}${queryParams}`
			: `${basePath}/${endpoint}`;
		if (isValidUrlLength(urlWithParams)) {
			endpointUrls.push(urlWithParams);
		} else {
			console.warn(`Skipping URL (too long): ${urlWithParams.substring(0, 100)}...`);
		}
	}
	return true;
}

/**
 * Generates all possible endpoint URLs by traversing up the URL path
 * Uses a "path traversal" algorithm that starts from the specific URL and works up to the domain root
 * @param {string} siteUrl - The base site URL
 * @param {boolean} keepQueryParams - Whether to keep query parameters
 * @param {string[]} endpoints - The list of feed endpoints to check
 * @returns {string[]} Array of potential feed URLs
 * @throws {Error} When siteUrl is invalid or too long
 */
export function generateEndpointUrls(
	siteUrl: string,
	keepQueryParams: boolean,
	endpoints: string[]
): string[] {
	const urlObj = validateBlindSearchUrl(siteUrl);
	const origin = urlObj.origin;
	const queryParams = keepQueryParams ? urlObj.search : '';
	let path = siteUrl;
	const endpointUrls: string[] = [];

	while (path.length >= origin.length) {
		const basePath = path.endsWith('/') ? path.slice(0, -1) : path;
		if (!appendEndpointsForPath(basePath, endpoints, queryParams, endpointUrls)) break;
		path = path.slice(0, path.lastIndexOf('/'));
	}

	return endpointUrls;
}

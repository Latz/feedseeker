/**
 * oEmbed detection constants
 */
export const OEMBED = {
	TYPES: ['rich', 'video', 'photo', 'link'] as const,
	VERSIONS: ['1.0', '2.0'] as const,
	URL_PATTERNS: ['/wp-json/oembed/', '/oembed'] as const
} as const;

/**
 * Checks if a URL is likely an oEmbed endpoint
 * @param url - The URL to check
 * @returns True if URL matches oEmbed patterns
 */
export function isOEmbedEndpoint(url: string): boolean {
	return OEMBED.URL_PATTERNS.some((pattern) => url.includes(pattern));
}

/**
 * Checks if JSON data is an oEmbed response
 * @param json - The parsed JSON data
 * @returns True if data appears to be an oEmbed response
 */
export function isOEmbedResponse(json: any): boolean {
	// Check for standard oEmbed type and version
	if (
		json.type &&
		(OEMBED.TYPES as readonly string[]).includes(json.type) &&
		(OEMBED.VERSIONS as readonly string[]).includes(json.version)
	) {
		return true;
	}

	// Check for other oEmbed indicators (type + version + html)
	if (json.type && json.version && json.html) {
		return true;
	}

	return false;
}

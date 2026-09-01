/**
 * Security and validation constants
 */
export const VALIDATION_LIMITS = {
	MAX_CONTENT_SIZE: 10 * 1024 * 1024, // 10MB maximum content size
	DEFAULT_TIMEOUT: 15, // Default timeout in seconds
	MAX_TIMEOUT: 60 // Maximum timeout in seconds (60 seconds)
} as const;

/**
 * Validates that a URL uses HTTP or HTTPS protocol
 * @param url - The URL to validate
 * @throws {Error} When URL is invalid or uses non-HTTP(S) protocol
 */
export function validateUrl(url: string): void {
	let urlObj: URL;

	try {
		urlObj = new URL(url);
	} catch {
		throw new Error(`Invalid URL: ${url}`);
	}

	// Security: Only allow HTTP and HTTPS protocols
	if (!['http:', 'https:'].includes(urlObj.protocol)) {
		throw new Error(
			`Invalid protocol: ${urlObj.protocol}. Only http: and https: protocols are allowed.`
		);
	}
}

/**
 * Validates content size to prevent memory exhaustion
 * @param content - The content to validate
 * @throws {Error} When content exceeds maximum size limit
 */
export function validateContentSize(content: string): void {
	if (content.length > VALIDATION_LIMITS.MAX_CONTENT_SIZE) {
		throw new Error(
			`Content too large: ${content.length} bytes. Maximum allowed: ${VALIDATION_LIMITS.MAX_CONTENT_SIZE} bytes.`
		);
	}
}

/**
 * Validates and normalizes timeout value
 * @param timeout - The timeout value in seconds (optional)
 * @returns Validated timeout value in seconds
 */
export function validateTimeout(timeout: number | undefined): number {
	// Use default if not provided
	if (timeout === undefined || timeout === null) {
		return VALIDATION_LIMITS.DEFAULT_TIMEOUT;
	}

	// Validate that timeout is a positive finite number
	if (!Number.isFinite(timeout) || timeout <= 0) {
		console.warn(
			`Invalid timeout value ${timeout}. Using default: ${VALIDATION_LIMITS.DEFAULT_TIMEOUT} seconds.`
		);
		return VALIDATION_LIMITS.DEFAULT_TIMEOUT;
	}

	// Clamp to maximum allowed value
	if (timeout > VALIDATION_LIMITS.MAX_TIMEOUT) {
		console.warn(
			`Timeout value ${timeout} exceeds maximum. Clamping to ${VALIDATION_LIMITS.MAX_TIMEOUT} seconds.`
		);
		return VALIDATION_LIMITS.MAX_TIMEOUT;
	}

	return Math.floor(timeout);
}

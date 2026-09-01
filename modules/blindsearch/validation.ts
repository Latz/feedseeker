import endpointsData from './endpoints.json' with { type: 'json' };

/**
 * Constants for blind search configuration
 */
const DEFAULT_REQUEST_DELAY = 0; // 0 means no delay (in milliseconds)
const DEFAULT_CONCURRENCY = 3; // Number of concurrent requests to make
const DEFAULT_SEARCH_MODE: SearchMode = 'standard';

/**
 * Security and resource limits
 */
export const MAX_URL_LENGTH = 2083; // Maximum safe URL length (IE limit, widely accepted standard)
const MAX_CONCURRENCY = 10; // Maximum concurrent requests to prevent resource exhaustion
const MIN_CONCURRENCY = 1; // Minimum concurrent requests
const MAX_REQUEST_DELAY = 60000; // Maximum delay between requests (60 seconds)

export type SearchMode = 'fast' | 'standard' | 'exhaustive' | 'full';

/**
 * Gets the appropriate endpoint list based on search mode
 * @param {SearchMode} mode - The search thoroughness mode
 * @returns {string[]} The combined endpoint list for the given mode
 */
export function getEndpointsByMode(mode: SearchMode): string[] {
	switch (mode) {
		case 'fast':
			return endpointsData.essential;
		case 'standard':
			return [...endpointsData.essential, ...endpointsData.standard];
		case 'exhaustive':
		case 'full':
			return [
				...endpointsData.essential,
				...endpointsData.standard,
				...endpointsData.comprehensive
			];
		default:
			return [...endpointsData.essential, ...endpointsData.standard];
	}
}

/**
 * Validates and sanitizes the search mode parameter
 * @param {string | undefined} mode - The search mode to validate
 * @returns {SearchMode} A valid search mode
 */
export function validateSearchMode(mode: string | undefined): SearchMode {
	if (!mode) {
		return DEFAULT_SEARCH_MODE;
	}

	const validModes: SearchMode[] = ['fast', 'standard', 'exhaustive', 'full'];
	if (!validModes.includes(mode as SearchMode)) {
		console.warn(`Invalid search mode "${mode}". Falling back to "${DEFAULT_SEARCH_MODE}".`);
		return DEFAULT_SEARCH_MODE;
	}

	return mode as SearchMode;
}

/**
 * Validates and clamps concurrency value to safe limits
 * @param {number | undefined} concurrency - The concurrency value to validate
 * @returns {number} A safe concurrency value
 */
export function validateConcurrency(concurrency: number | undefined): number {
	if (concurrency === undefined || concurrency === null) {
		return DEFAULT_CONCURRENCY;
	}

	if (!Number.isFinite(concurrency) || concurrency < MIN_CONCURRENCY) {
		console.warn(`Invalid concurrency value ${concurrency}. Using minimum: ${MIN_CONCURRENCY}.`);
		return MIN_CONCURRENCY;
	}

	if (concurrency > MAX_CONCURRENCY) {
		console.warn(
			`Concurrency value ${concurrency} exceeds maximum. Clamping to ${MAX_CONCURRENCY}.`
		);
		return MAX_CONCURRENCY;
	}

	return Math.floor(concurrency);
}

/**
 * Validates and clamps request delay to safe limits
 * @param {number | undefined} delay - The request delay to validate
 * @returns {number} A safe delay value
 */
export function validateRequestDelay(delay: number | undefined): number {
	if (delay === undefined || delay === null) {
		return DEFAULT_REQUEST_DELAY;
	}

	if (!Number.isFinite(delay) || delay < 0) {
		console.warn(`Invalid request delay ${delay}. Using default: ${DEFAULT_REQUEST_DELAY}.`);
		return DEFAULT_REQUEST_DELAY;
	}

	if (delay > MAX_REQUEST_DELAY) {
		console.warn(`Request delay ${delay}ms exceeds maximum. Clamping to ${MAX_REQUEST_DELAY}ms.`);
		return MAX_REQUEST_DELAY;
	}

	return Math.floor(delay);
}

/**
 * Validates that a URL is within safe length limits
 * @param {string} url - The URL to validate
 * @returns {boolean} True if URL is valid length
 */
export function isValidUrlLength(url: string): boolean {
	return url.length <= MAX_URL_LENGTH;
}

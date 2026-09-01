import { FEED_PATTERNS, WHITESPACE_PATTERN } from './feedPatterns.ts';

/**
 * Removes CDATA tags from text content
 * @param text - The text to remove CDATA tags from
 * @returns The text with CDATA tags removed
 */
export function removeCDATA(text: string): string {
	return text.replaceAll(FEED_PATTERNS.CDATA, '$1');
}

/**
 * Cleans titles by removing excessive whitespace and newlines
 * @param title - The title to clean
 * @returns The cleaned title, or null if input is falsy
 */
export function cleanTitle(title: string | null | undefined): string | null {
	if (!title) return null; // Explicitly return null for falsy values
	// Remove leading/trailing whitespace and collapse multiple whitespace characters
	return title.replaceAll(WHITESPACE_PATTERN, ' ').trim();
}

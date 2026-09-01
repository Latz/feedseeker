import { FEED_PATTERNS } from './feedPatterns.ts';
import { cleanTitle, removeCDATA } from './textUtils.ts';
import { type FeedResult } from './types.ts';

/**
 * Checks if content is an Atom feed
 * @param content - The content to check for Atom feed elements
 * @returns Object with type 'atom' and title if Atom feed, null otherwise
 */
export function checkAtom(content: string, onReject?: (reason: string) => void): FeedResult | null {
	// Gate on the cheap <feed> root-element check before running the three namespace
	// scans. The namespace patterns scan the whole document, so evaluating them first
	// cost ~4x on large non-Atom pages (the common case while crawling).
	if (!FEED_PATTERNS.ATOM.FEED_START.test(content)) return null;

	// Check for Atom feed root element with appropriate namespace
	const hasAtomNamespace =
		FEED_PATTERNS.ATOM.NAMESPACE_XMLNS.test(content) ||
		FEED_PATTERNS.ATOM.NAMESPACE_XMLNS_ATOM.test(content) ||
		FEED_PATTERNS.ATOM.NAMESPACE_ATOM_PREFIX.test(content);

	if (hasAtomNamespace) {
		// For Atom feeds, having <entry> elements is required to be a valid feed
		const hasEntry = FEED_PATTERNS.ATOM.ENTRY.test(content);

		// Additional check: Atom feeds should also have a feed-level title
		const hasTitle = FEED_PATTERNS.ATOM.TITLE_TAG.test(content);

		if (hasEntry && hasTitle) {
			// Extract title from Atom feed (feed title, not entry title)
			const match = FEED_PATTERNS.ATOM.TITLE_CONTENT.exec(content);
			const title = match ? cleanTitle(removeCDATA(match[1])) : null;
			return { type: 'atom', title };
		}

		// A well-formed Atom feed (correct namespace, has a title) that simply
		// has no entries yet (e.g. a brand-new blog) is not "not a feed" — surface
		// that distinction instead of the generic rejection message below.
		if (!hasEntry && hasTitle) {
			onReject?.('content is a valid Atom feed but has no entries yet');
		}
	}
	return null;
}

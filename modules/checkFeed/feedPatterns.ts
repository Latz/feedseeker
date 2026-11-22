/**
 * @fileoverview Pre-compiled regex patterns for RSS/Atom/JSON feed detection and processing.
 * Compiling once at module load time avoids creating new RegExp objects on every checkFeed call.
 *
 * Tag patterns only match the start of a tag; textUtils' openTags/elementText find the
 * rest. A full /<tag[^>]*>/ or /<tag>([\s\S]*?)<\/tag>/ would backtrack quadratically on
 * hostile pages full of unclosed tags.
 */

export const FEED_PATTERNS = {
	// RSS feed detection patterns
	RSS: {
		// <rss …> root element; VERSION is then checked within that tag
		ROOT: /<rss\s/i,
		VERSION: /version\s*=\s*["'][\d.]+["']/i,

		// RSS 1.0's RDF root element: <rdf:RDF ...>. RSS 1.0 feeds have no
		// <rss version="..."> tag at all, so they need a separate root-element check.
		RDF_ROOT: /<rdf:RDF/i,

		// RSS channel (required container for RSS content), items and description;
		// prefix matches like the former /<item[^>]*>/ (so <items> counts too)
		CHANNEL: /<channel/i,
		ITEM: /<item/i,
		DESCRIPTION: /<description/i,

		// Matches RSS channel closing tag
		CHANNEL_END: /<\/channel>/i,

		// Title tag without attributes (feed or item title)
		TITLE: /<title>/i
	},

	// Atom feed detection patterns
	ATOM: {
		// Atom feed root element: <feed …> or <feed>
		FEED_START: /<feed[\s>]/i,

		// Atom namespace inside the <feed> tag: "atom" after the first xmlns covers both
		// xmlns="...atom..." and xmlns:atom="..."; or an atom: prefix. (Not /xmlns.*atom/:
		// that backtracks quadratically on a huge tag full of "xmlns".)
		XMLNS: /xmlns/i,
		ATOM: /atom/i,
		NAMESPACE_ATOM_PREFIX: /atom:/i,

		// Atom entry and title tags (title may have attributes like type="text")
		ENTRY: /<entry/i,
		TITLE: /<title/i
	}
};

export const WHITESPACE_PATTERN = /\s+/g;

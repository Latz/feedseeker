/**
 * @fileoverview Pre-compiled regex patterns for RSS/Atom/JSON feed detection and processing.
 * Compiling once at module load time avoids creating new RegExp objects on every checkFeed call.
 */

export const FEED_PATTERNS = {
	// CDATA processing - matches XML CDATA sections: <![CDATA[content]]>
	// Used to extract clean text content from feeds that wrap content in CDATA
	CDATA: /<!\[CDATA\[(.*?)\]\]>/g,

	// RSS feed detection patterns
	RSS: {
		// Matches RSS root element with version attribute: <rss version="2.0">
		// [^>]* matches any attributes before version, \s+ ensures whitespace before version
		VERSION: /<rss\s[^>]*version\s*=\s*["'][\d.]+["']/i,

		// Matches RSS 1.0's RDF root element: <rdf:RDF ...>. RSS 1.0 feeds have no
		// <rss version="..."> tag at all, so they need a separate root-element check.
		RDF_ROOT: /<rdf:RDF[^>]*>/i,

		// Matches RSS channel opening tag (required container for RSS content)
		CHANNEL: /<channel[^>]*>/i,

		// Matches RSS item opening tag (individual feed entries)
		ITEM: /<item[^>]*>/i,

		// Matches RSS description opening tag (content description)
		DESCRIPTION: /<description[^>]*>/i,

		// Matches RSS channel closing tag
		CHANNEL_END: /<\/channel>/i,

		// Captures entire channel content between opening and closing tags
		// [\s\S]*? uses non-greedy matching to capture everything including newlines
		// [^>]* tolerates attributes on <channel>, e.g. RSS 1.0's <channel rdf:about="...">
		CHANNEL_CONTENT: /<channel[^>]*>([\s\S]*?)<\/channel>/i,

		// Captures title content between title tags (feed or item title)
		TITLE: /<title>([\s\S]*?)<\/title>/i
	},

	// Atom feed detection patterns
	ATOM: {
		// Matches Atom feed opening tag with optional attributes: <feed ...>
		// (?:\s+[^>]*)? is a non-capturing group for optional attributes
		FEED_START: /<feed[\s>]/i,

		// Matches Atom namespace declaration: xmlns="...atom..." or xmlns:atom="..."
		// These patterns ensure the feed uses the Atom XML namespace
		NAMESPACE_XMLNS: /<feed[^>]*xmlns[^>]*atom/i,
		NAMESPACE_XMLNS_ATOM: /<feed[^>]*xmlns:atom/i,
		NAMESPACE_ATOM_PREFIX: /<feed[^>]*atom:/i,

		// Matches Atom entry opening tag (individual feed entries)
		ENTRY: /<entry[^>]*>/i,

		// Matches Atom title opening tag
		TITLE_TAG: /<title[^>]*>/i,

		// Captures title content between title tags (with optional attributes like type="text")
		TITLE_CONTENT: /<title[^>]*>([\s\S]*?)<\/title>/i
	}
};

export const WHITESPACE_PATTERN = /\s+/g;

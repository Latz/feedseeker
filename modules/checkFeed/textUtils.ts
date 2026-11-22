import { WHITESPACE_PATTERN } from './feedPatterns.ts';

const CDATA_START = '<![CDATA[';
const CDATA_END = ']]>';

/**
 * Removes CDATA tags from text content
 * @param text - The text to remove CDATA tags from
 * @returns The text with CDATA tags removed
 */
export function removeCDATA(text: string): string {
	// indexOf instead of /<!\[CDATA\[([\s\S]*?)\]\]>/g: that regex rescans to the end
	// from every unclosed "<![CDATA[", which is quadratic on hostile input.
	let out = '';
	let pos = 0;
	for (;;) {
		const start = text.indexOf(CDATA_START, pos);
		if (start === -1) break;
		const end = text.indexOf(CDATA_END, start + CDATA_START.length);
		if (end === -1) break;
		out += text.slice(pos, start) + text.slice(start + CDATA_START.length, end);
		pos = end + CDATA_END.length;
	}
	return out + text.slice(pos);
}

/**
 * Yields every opening tag whose start `start` matches (e.g. /<item[\s>]/i), up to
 * and including its '>'.
 *
 * Linear: a regex like /<item[^>]*>/ rescans to the end of the document from every
 * unclosed "<item", so a hostile 50 kB page of "<item<item…" took minutes — while
 * blocking the event loop, where no fetch timeout can interrupt it.
 */
export function* openTags(content: string, start: RegExp): Generator<{ tag: string; end: number }> {
	const re = new RegExp(start.source, 'gi');
	for (let match = re.exec(content); match; match = re.exec(content)) {
		const end = content.indexOf('>', match.index);
		if (end === -1) return; // no '>' after this tag means none after later ones either
		yield { tag: content.slice(match.index, end + 1), end: end + 1 };
		re.lastIndex = end + 1;
	}
}

/** The first opening tag `start` matches, or null. */
export function firstOpenTag(content: string, start: RegExp): string | null {
	for (const { tag } of openTags(content, start)) return tag;
	return null;
}

/**
 * Inner text of the first element whose opening tag `start` matches, up to the next
 * `</name>`: what /<name[^>]*>([\s\S]*?)<\/name>/i captures, but in linear time.
 */
export function elementText(content: string, start: RegExp, name: string): string | null {
	for (const { end } of openTags(content, start)) {
		const close = new RegExp(`</${name}>`, 'gi');
		close.lastIndex = end;
		const match = close.exec(content);
		return match ? content.slice(end, match.index) : null;
	}
	return null;
}

/**
 * Cleans titles by removing excessive whitespace and newlines
 * @param title - The title to clean
 * @returns The cleaned title, or null if input is falsy or only whitespace
 */
export function cleanTitle(title: string | null | undefined): string | null {
	if (!title) return null; // Explicitly return null for falsy values
	// Remove leading/trailing whitespace and collapse multiple whitespace characters
	// A whitespace-only title is no title: '' would e.g. leave an OPML outline unlabeled
	return title.replaceAll(WHITESPACE_PATTERN, ' ').trim() || null;
}

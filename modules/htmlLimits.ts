/**
 * @fileoverview Size and nesting limits for HTML pages before they reach linkedom.
 *
 * linkedom's parser (htmlparser2) handles every opening tag in O(nesting depth)
 * (it keeps open tags with Array#unshift), so 1 MB of "<div><div>…" blocked the
 * process for a minute. Parsing is synchronous; no fetch timeout can stop it.
 */
import { parseHTML } from 'linkedom';

/** Most characters of an HTML page that are read and parsed (big news front pages reach 2–3 MB). */
export const MAX_HTML_CHARS = 5 * 1024 * 1024;
/** Deeper nesting is cut off; Blink uses the same limit. Real pages stay far below it. */
export const MAX_HTML_DEPTH = 512;

// htmlparser2's rules (Parser.js), so the depth counted here is the depth linkedom builds:
// void elements never stay open; opening a tag implicitly closes these elements on top
const VOID = new Set(
	'area base basefont br col command embed frame hr img input isindex keygen link meta param source track wbr'.split(
		' '
	)
);
const P = ['p'];
const FORM = ['input', 'option', 'optgroup', 'select', 'button', 'datalist', 'textarea'];
const IMPLIES_CLOSE = new Map<string, string[]>([
	['tr', ['tr', 'th', 'td']],
	['th', ['th']],
	['td', ['thead', 'th', 'td']],
	['body', ['head', 'link', 'script']],
	['li', ['li']],
	['option', ['option']],
	['optgroup', ['optgroup', 'option']],
	['dd', ['dd', 'dt']],
	['dt', ['dd', 'dt']],
	['rt', ['rt', 'rp']],
	['rp', ['rt', 'rp']],
	['tbody', ['thead', 'tbody']],
	['tfoot', ['thead', 'tbody']],
	...['select', 'input', 'output', 'button', 'datalist', 'textarea'].map(
		(t) => [t, FORM] as [string, string[]]
	),
	...'p h1 h2 h3 h4 h5 h6 address article aside blockquote details div dl fieldset figcaption figure footer form hr main nav ol pre section table ul'
		.split(' ')
		.map((t) => [t, P] as [string, string[]])
]);
// Inside <svg>/<math> "<x/>" closes itself; these elements switch back to HTML rules
const FOREIGN = new Set(['svg', 'math']);
const HTML_INTEGRATION = new Set([
	'mi',
	'mo',
	'mn',
	'ms',
	'mtext',
	'annotation-xml',
	'foreignobject',
	'desc',
	'title'
]);
// Content of these is text, not tags
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);

/**
 * Reads a response body as text, but stops after `maxChars` characters and
 * cancels the rest, so a huge (or endless) page cannot fill the memory.
 */
export async function readTextLimited(
	response: Response,
	maxChars: number = MAX_HTML_CHARS
): Promise<string> {
	const reader = response.body?.getReader();
	if (!reader) return (await response.text()).slice(0, maxChars);
	const decoder = new TextDecoder();
	let text = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return text + decoder.decode();
		text += decoder.decode(value, { stream: true });
		if (text.length >= maxChars) {
			await reader.cancel().catch(() => {});
			return text.slice(0, maxChars);
		}
	}
}

/**
 * Cuts the page to MAX_HTML_CHARS and before the first tag nested deeper than
 * MAX_HTML_DEPTH. Tracks open tags roughly like htmlparser2 does (a close tag
 * only counts if that element is open), in one linear pass.
 */
export function limitHtml(html: string): string {
	if (html.length > MAX_HTML_CHARS) html = html.slice(0, MAX_HTML_CHARS);
	const open: string[] = []; // innermost last; at most MAX_HTML_DEPTH entries
	const foreign: boolean[] = []; // per open element: are we in SVG/MathML there?
	const token = /<!--|<(\/?)([a-z][^\s/>]*)/gi;
	for (let m = token.exec(html); m; m = token.exec(html)) {
		if (m[0] === '<!--') {
			const end = html.indexOf('-->', token.lastIndex);
			if (end === -1) break;
			token.lastIndex = end + 3;
			continue;
		}
		const end = html.indexOf('>', token.lastIndex);
		if (end === -1) break; // no '>' after this tag, so no complete tag follows
		token.lastIndex = end + 1;
		const name = m[2].toLowerCase();

		if (m[1]) {
			const pos = open.lastIndexOf(name);
			if (pos !== -1) {
				open.length = pos;
				foreign.length = pos;
			}
			continue;
		}
		if (RAW_TEXT.has(name)) {
			const close = new RegExp(`</${name}`, 'gi');
			close.lastIndex = token.lastIndex;
			if (!close.exec(html)) break;
			token.lastIndex = close.lastIndex;
			continue;
		}
		const closes = IMPLIES_CLOSE.get(name);
		while (closes && open.length > 0 && closes.includes(open.at(-1)!)) {
			open.pop();
			foreign.pop();
		}
		const inForeign = FOREIGN.has(name) || (!HTML_INTEGRATION.has(name) && foreign.at(-1) === true);
		if (VOID.has(name) || (inForeign && html[end - 1] === '/')) continue;
		if (open.length >= MAX_HTML_DEPTH) return html.slice(0, m.index);
		open.push(name);
		foreign.push(inForeign);
	}
	return html;
}

/** linkedom's parseHTML on a page cut to the limits above. */
export function parseHtmlLimited(html: string): ReturnType<typeof parseHTML> {
	return parseHTML(limitHtml(html));
}

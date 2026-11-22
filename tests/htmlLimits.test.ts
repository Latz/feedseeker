import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { parseHTML } from 'linkedom';
import { readFileSync, readdirSync } from 'node:fs';
import {
	limitHtml,
	parseHtmlLimited,
	readTextLimited,
	MAX_HTML_CHARS,
	MAX_HTML_DEPTH
} from '../modules/htmlLimits.ts';

/** Deepest element nesting in a parsed document (linear: parents come first). */
function domDepth(html: string, parse = parseHtmlLimited): number {
	const { document } = parse(html);
	const depth = new Map<unknown, number>();
	let max = 0;
	for (const el of document.querySelectorAll('*')) {
		const d = (depth.get(el.parentNode) ?? 0) + 1;
		depth.set(el, d);
		max = Math.max(max, d);
	}
	return max;
}

describe('readTextLimited', () => {
	/** A body served in 1000-char chunks; counts how many chunks were pulled */
	function chunked(chunks: number) {
		let pulled = 0;
		let cancelled = false;
		const body = new ReadableStream<Uint8Array>(
			{
				pull(controller) {
					if (pulled === chunks) return controller.close();
					pulled++;
					controller.enqueue(new TextEncoder().encode('x'.repeat(1000)));
				},
				cancel() {
					cancelled = true;
				}
			},
			{ highWaterMark: 0 }
		);
		return { response: new Response(body), state: () => ({ pulled, cancelled }) };
	}

	it('reads a body below the limit completely', async () => {
		const { response, state } = chunked(3);
		expect(await readTextLimited(response, 5000)).toBe('x'.repeat(3000));
		expect(state().cancelled).toBe(false);
	});

	it('stops at the limit and cancels the rest of the body', async () => {
		const { response, state } = chunked(1000);
		expect(await readTextLimited(response, 2500)).toBe('x'.repeat(2500));
		expect(state()).toEqual({ pulled: 3, cancelled: true });
	});

	it('handles a response without a body stream', async () => {
		expect(await readTextLimited(new Response(null), 10)).toBe('');
	});

	it('stops exactly at the limit without reading another chunk', async () => {
		const { response, state } = chunked(1000);
		await readTextLimited(response, 2000);
		expect(state().pulled).toBe(2);
	});

	it('decodes a character split across chunks', async () => {
		const bytes = new TextEncoder().encode('ä');
		const body = new ReadableStream({
			start(controller) {
				controller.enqueue(bytes.slice(0, 1));
				controller.enqueue(bytes.slice(1));
				controller.close();
			}
		});
		expect(await readTextLimited(new Response(body))).toBe('ä');
	});

	it('limits a body that cannot be streamed', async () => {
		const response = { body: null, text: async () => 'x'.repeat(20) } as unknown as Response;
		expect(await readTextLimited(response, 10)).toBe('x'.repeat(10));
	});

	it('limits to MAX_HTML_CHARS by default', async () => {
		const html = 'x'.repeat(MAX_HTML_CHARS + 10);
		expect((await readTextLimited(new Response(html))).length).toBe(MAX_HTML_CHARS);
	});
});

describe('limitHtml', () => {
	const wrap = (body: string) => `<html><body>${body}</body></html>`;

	it.each(readdirSync(new URL('./fixtures/html', import.meta.url)))(
		'leaves the real page %s unchanged',
		(file) => {
			const html = readFileSync(new URL(`./fixtures/html/${file}`, import.meta.url), 'utf-8');
			expect(limitHtml(html)).toBe(html);
		}
	);

	it('cuts before the first tag nested deeper than MAX_HTML_DEPTH', () => {
		const html = '<div>'.repeat(1000);
		expect(limitHtml(html)).toBe('<div>'.repeat(MAX_HTML_DEPTH));
	});

	it.each([
		['closed elements', '<div><span>x</span></div>'],
		['void elements', '<br><img src=x><input>'],
		['implicitly closed elements', '<ul><li>a<li>b</ul><p>c<p>d<table><tr><td>e<td>f</table>'],
		['self-closing SVG shapes', '<svg><path d="M0"/></svg>'],
		['"<" inside attribute values', '<a title="<div x">x</a>'],
		['tags inside comments', '<!-- <div> -->'],
		['tags inside scripts', '<script>"<div>"</script>'],
		['tags inside styles', '<style>/* <div> */</style>']
	])('does not count %s as nesting', (_name, part) => {
		const html = wrap(part.repeat(1000));
		expect(limitHtml(html)).toBe(html);
	});

	it.each([
		['close tags of elements that are not open', '<div></span>'],
		['"/>" outside SVG, which HTML ignores', '<div/>'],
		['"/>" in an SVG <foreignObject>, which is HTML again', '<svg><foreignObject><div/>'],
		['implicitly closed elements that are not on top', '<li><p>']
	])('is not fooled by %s', (_name, part) => {
		expect(limitHtml(wrap(part.repeat(1000))).length).toBeLessThan(1000 * part.length);
	});

	it.each(['svg', 'math'])('lets "<x/>" close itself inside <%s>', (root) => {
		const html = wrap(`<${root}>` + '<x/>'.repeat(1000));
		expect(limitHtml(html)).toBe(html);
		expect(domDepth(html, parseHTML)).toBeLessThan(10);
	});

	// Where the count would be too low, the slow parsing would be back
	it.each(['mi', 'mo', 'mn', 'ms', 'mtext', 'annotation-xml', 'foreignObject', 'desc'])(
		'treats "<x/>" inside SVG <%s> as HTML, which nests',
		(el) => {
			const html = wrap(`<svg><${el}>` + '<div/>'.repeat(1000));
			expect(domDepth(html, parseHTML)).toBeGreaterThan(MAX_HTML_DEPTH);
			expect(limitHtml(html).length).toBeLessThan(html.length);
		}
	);

	it.each(['script', 'style', 'textarea', 'title'])(
		'ignores close tags inside <%s>, which are text',
		(el) => {
			const html = wrap(`<div><${el}></div></${el}>`.repeat(1000));
			expect(domDepth(html, parseHTML)).toBeGreaterThan(MAX_HTML_DEPTH);
			expect(limitHtml(html).length).toBeLessThan(html.length);
		}
	);

	it('keeps counting after a comment', () => {
		const html = '<!-- x -->' + '<div>'.repeat(1000);
		expect(limitHtml(html).length).toBeLessThan(html.length);
	});

	it('keeps track of SVG vs. HTML after implicitly closed elements', () => {
		// the second <li> closes the first; <foreignObject> switches back to HTML, where "/>" is ignored
		const html = wrap('<svg><li><li><foreignObject><b></b>' + '<div/>'.repeat(1000));
		expect(domDepth(html, parseHTML)).toBeGreaterThan(MAX_HTML_DEPTH);
		expect(limitHtml(html).length).toBeLessThan(html.length);
	});

	it('ends at an unclosed tag at the end of the page', () => {
		const html = '<div>'.repeat(10) + '<div';
		expect(limitHtml(html)).toBe(html);
	});

	it('cuts a page larger than MAX_HTML_CHARS', () => {
		expect(limitHtml('x'.repeat(MAX_HTML_CHARS + 1)).length).toBe(MAX_HTML_CHARS);
	});

	it('treats everything after an unclosed comment or script as text', () => {
		for (const tail of ['<!-- <div>', '<script> <div>']) {
			const html = '<div>'.repeat(10) + tail + '<div>'.repeat(1000);
			expect(limitHtml(html)).toBe(html);
		}
	});
});

describe('parseHtmlLimited on hostile pages', () => {
	// Nesting is what makes linkedom's parser slow (O(depth) per tag)
	const fragment = fc.constantFrom(
		'<div>',
		'</span>',
		'<a href=x>',
		'<b><i></b></i>',
		'<table><tr><td>',
		'<html><head><body>',
		'<li>',
		'<p>',
		'<td>',
		'<option>',
		'<div/>',
		'<foreignObject>',
		'<svg>',
		'<path/>',
		'</svg>',
		'<!--',
		'-->',
		'<script>',
		'</script>',
		'x'
	);

	it('never builds a document nested much deeper than MAX_HTML_DEPTH', () => {
		fc.assert(
			fc.property(fc.array(fragment, { minLength: 1, maxLength: 5 }), (unit) => {
				const u = unit.join('');
				expect(domDepth(u.repeat(Math.ceil(50_000 / u.length)))).toBeLessThanOrEqual(
					4 * MAX_HTML_DEPTH
				);
			}),
			{ numRuns: 60 }
		);
	});

	it('parses 300 kB of nested <div> quickly (took 4 s without the limit, 1 MB a minute)', () => {
		const start = performance.now();
		parseHtmlLimited('<div>'.repeat(60_000));
		expect(performance.now() - start).toBeLessThan(1000);
	});
});

import { describe, it, expect } from 'vitest';
import { decoderFor, decodeChunks } from '../modules/charset.ts';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('decoderFor', () => {
	it.each([
		['no hints', undefined, '<rss>', 'utf-8'],
		['a header charset', 'text/xml; charset=ISO-8859-1', '<rss>', 'windows-1252'],
		['a quoted header charset', 'text/xml; charset="koi8-r"', '<rss>', 'koi8-r'],
		[
			'an XML declaration',
			'text/xml',
			'<?xml version="1.0" encoding="iso-8859-15"?>',
			'iso-8859-15'
		],
		['a <meta charset>', 'text/html', '<html><head><meta charset=shift_jis>', 'shift_jis'],
		[
			'a <meta http-equiv> content type',
			'text/html',
			'<meta http-equiv="Content-Type" content="text/html; charset=euc-jp">',
			'euc-jp'
		],
		// a document readable as ASCII is not UTF-16, whatever it claims (HTML spec)
		['a <meta charset> claiming UTF-16', 'text/html', '<meta charset="utf-16">', 'utf-8'],
		['an unknown label', 'text/xml; charset=nonsense', '<rss>', 'utf-8'],
		// "encoding" outside an XML declaration is no declaration
		['"encoding" in plain text', 'text/xml', '<rss><p>encoding="koi8-r"</p>', 'utf-8']
	])('uses %s', (_name, type, head, expected) => {
		expect(decoderFor(type, bytes(head)).encoding).toBe(expected);
	});

	it('lets a byte order mark win over the header', () => {
		const bom = new Uint8Array([0xfe, 0xff, 0, 0x3c]);
		expect(decoderFor('text/xml; charset=iso-8859-1', bom).encoding).toBe('utf-16be');
	});

	it('only looks at the first 1024 bytes for a declaration', () => {
		const late = bytes(' '.repeat(1024) + '<meta charset="koi8-r">');
		expect(decoderFor('text/html', late).encoding).toBe('utf-8');
	});
});

describe('decodeChunks', () => {
	function reader(chunks: Uint8Array[]) {
		return new ReadableStream<Uint8Array>({
			start(controller) {
				for (const c of chunks) controller.enqueue(c);
				controller.close();
			}
		}).getReader();
	}
	const collect = async (gen: AsyncGenerator<string>) => {
		let s = '';
		for await (const piece of gen) s += piece;
		return s;
	};

	it('finds a declaration split over tiny chunks', async () => {
		const doc = Buffer.from('<?xml version="1.0" encoding="ISO-8859-1"?><t>Café</t>', 'latin1');
		const chunks = [...doc].map((b) => new Uint8Array([b]));
		expect(await collect(decodeChunks(reader(chunks), 'text/xml'))).toBe(
			'<?xml version="1.0" encoding="ISO-8859-1"?><t>Café</t>'
		);
	});

	it('decodes characters split across chunks after the prescan', async () => {
		const text = 'ä'.repeat(3000);
		const all = bytes(text);
		// the prescan takes the first chunk; then an 'ä' is split across the next two
		const chunks = [all.subarray(0, 1100), all.subarray(1100, 1101), all.subarray(1101)];
		expect(await collect(decodeChunks(reader(chunks), undefined))).toBe(text);
	});

	it('handles an empty body', async () => {
		expect(await collect(decodeChunks(reader([]), 'text/html'))).toBe('');
	});
});

/**
 * @fileoverview Decodes response bodies in their declared character set.
 *
 * fetch's response.text() always decodes UTF-8, which garbled ISO-8859-1 feeds
 * ("Café" became "Caf�") and missed UTF-16 feeds entirely.
 */

/** Bytes looked at for an XML declaration or <meta charset>, like the HTML prescan. */
const PRESCAN_BYTES = 1024;
const IN_DOCUMENT = /(?:<\?xml[^>]*\sencoding|<meta[^>]*charset)\s*=\s*["']?([\w.:-]+)/i;
const IN_HEADER = /charset\s*=\s*["']?([\w.:-]+)/i;

function decoder(label: string | undefined): TextDecoder | null {
	if (!label) return null;
	try {
		return new TextDecoder(label);
	} catch {
		return null; // unknown label: ignored, as browsers do
	}
}

/**
 * The decoder for a body, chosen like browsers do: a byte order mark wins, then the
 * Content-Type charset, then an XML declaration or <meta charset> near the start,
 * else UTF-8.
 */
export function decoderFor(contentType: string | null | undefined, head: Uint8Array): TextDecoder {
	if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) return new TextDecoder('utf-8');
	if (head[0] === 0xff && head[1] === 0xfe) return new TextDecoder('utf-16le');
	if (head[0] === 0xfe && head[1] === 0xff) return new TextDecoder('utf-16be');
	const fromHeader = decoder(IN_HEADER.exec(contentType ?? '')?.[1]);
	if (fromHeader) return fromHeader;
	// The declaration is ASCII, so any ASCII-compatible decoding finds it
	const prescan = new TextDecoder('latin1').decode(head.subarray(0, PRESCAN_BYTES));
	const fromDocument = decoder(IN_DOCUMENT.exec(prescan)?.[1]);
	// A document readable as ASCII cannot really be UTF-16 (HTML spec: treat as UTF-8)
	if (fromDocument && !fromDocument.encoding.startsWith('utf-16')) return fromDocument;
	return new TextDecoder('utf-8');
}

/**
 * Reads `reader` and yields its text in pieces, decoded in the body's charset. The
 * caller may stop early and keep using the reader (e.g. to cancel it).
 */
export async function* decodeChunks(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	contentType: string | null | undefined
): AsyncGenerator<string> {
	const head: Uint8Array[] = [];
	let headBytes = 0;
	let done = false;
	while (!done && headBytes < PRESCAN_BYTES) {
		const chunk = await reader.read();
		if (chunk.done) done = true;
		else {
			head.push(chunk.value);
			headBytes += chunk.value.byteLength;
		}
	}
	const start = new Uint8Array(headBytes);
	let offset = 0;
	for (const chunk of head) {
		start.set(chunk, offset);
		offset += chunk.byteLength;
	}
	const textDecoder = decoderFor(contentType, start);
	yield textDecoder.decode(start, { stream: true });
	while (!done) {
		const chunk = await reader.read();
		if (chunk.done) break;
		yield textDecoder.decode(chunk.value, { stream: true });
	}
	yield textDecoder.decode();
}

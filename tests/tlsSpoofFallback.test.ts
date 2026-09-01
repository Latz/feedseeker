import { describe, it, expect, vi, beforeEach } from 'vitest';

const wreqFetchMock = vi.fn();

vi.mock('node-wreq', () => ({
	fetch: (...args: unknown[]) => wreqFetchMock(...args)
}));

describe('tlsSpoofFallback', () => {
	beforeEach(() => {
		vi.resetModules();
		wreqFetchMock.mockReset();
	});

	it('returns a Response with the diagnostic success header on a successful node-wreq call', async () => {
		const { tryTlsSpoofFallback } = await import('../modules/tlsSpoofFallback.ts');
		wreqFetchMock.mockResolvedValue({
			status: 200,
			statusText: 'OK',
			url: 'https://example.com/',
			headers: { forEach: (cb: (v: string, k: string) => void) => cb('text/html', 'content-type') },
			text: async () => '<html>real content</html>'
		});

		const response = await tryTlsSpoofFallback('https://example.com/', { timeout: 5000 });

		expect(response).not.toBeNull();
		expect(response!.status).toBe(200);
		expect(await response!.text()).toBe('<html>real content</html>');
		expect(response!.headers.get('x-feedseeker-tls-spoof')).toBe('success');
	});

	it('calls node-wreq with the fixed browser profile and the given timeout', async () => {
		const { tryTlsSpoofFallback } = await import('../modules/tlsSpoofFallback.ts');
		wreqFetchMock.mockResolvedValue({
			status: 200,
			statusText: 'OK',
			url: 'https://example.com/',
			headers: { forEach: () => {} },
			text: async () => ''
		});

		await tryTlsSpoofFallback('https://example.com/', { timeout: 7000 });

		expect(wreqFetchMock).toHaveBeenCalledTimes(1);
		const [url, options] = wreqFetchMock.mock.calls[0];
		expect(url).toBe('https://example.com/');
		expect(options).toMatchObject({ browser: expect.any(String), timeout: 7000 });
	});

	it('passes through caller-supplied headers without merging feedseeker default headers', async () => {
		const { tryTlsSpoofFallback } = await import('../modules/tlsSpoofFallback.ts');
		wreqFetchMock.mockResolvedValue({
			status: 200,
			statusText: 'OK',
			url: 'https://example.com/',
			headers: { forEach: () => {} },
			text: async () => ''
		});

		await tryTlsSpoofFallback('https://example.com/', {
			timeout: 5000,
			headers: { 'X-Custom': 'value' }
		});

		const [, options] = wreqFetchMock.mock.calls[0];
		expect(options.headers).toEqual({ 'X-Custom': 'value' });
	});

	it('returns null when the node-wreq fetch call itself throws', async () => {
		const { tryTlsSpoofFallback } = await import('../modules/tlsSpoofFallback.ts');
		wreqFetchMock.mockRejectedValue(new Error('network error'));

		const response = await tryTlsSpoofFallback('https://example.com/', { timeout: 5000 });

		expect(response).toBeNull();
	});
});

describe('tlsSpoofFallback — node-wreq unavailable', () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it('returns null when the node-wreq module fails to load, and does not re-attempt the import on a second call', async () => {
		vi.doMock('node-wreq', () => {
			throw new Error('module not found');
		});
		const { tryTlsSpoofFallback } = await import('../modules/tlsSpoofFallback.ts');

		const first = await tryTlsSpoofFallback('https://example.com/', { timeout: 5000 });
		const second = await tryTlsSpoofFallback('https://example.com/other-path', { timeout: 5000 });

		expect(first).toBeNull();
		expect(second).toBeNull();
	});
});

import { describe, it, expect, vi, beforeEach } from 'vitest';

const fetchMock = vi.fn();
vi.mock('../modules/fetchWithTimeout.ts', () => ({
	default: (...a: unknown[]) => fetchMock(...a)
}));

import lookupApplePodcastFeed from '../modules/applePodcasts.ts';

const apple = 'https://podcasts.apple.com/us/podcast/k%C3%BChnert-schroeder/id6831165042';

describe('lookupApplePodcastFeed', () => {
	beforeEach(() => {
		fetchMock.mockReset();
	});

	it('returns feedUrl from the iTunes lookup', async () => {
		fetchMock.mockResolvedValue({
			ok: true,
			json: async () => ({ results: [{ feedUrl: 'https://feeds.megaphone.fm/kus' }] })
		});
		expect(await lookupApplePodcastFeed(apple)).toBe('https://feeds.megaphone.fm/kus');
		expect(fetchMock.mock.calls[0][0]).toContain('id=6831165042');
	});

	it('ignores non-Apple hosts and URLs without an id', async () => {
		expect(await lookupApplePodcastFeed('https://example.com/id123')).toBeNull();
		expect(await lookupApplePodcastFeed('https://podcasts.apple.com/us/browse')).toBeNull();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it('returns null on failed lookup or empty results', async () => {
		fetchMock.mockResolvedValue({ ok: false });
		expect(await lookupApplePodcastFeed(apple)).toBeNull();
		fetchMock.mockResolvedValue({ ok: true, json: async () => ({ results: [] }) });
		expect(await lookupApplePodcastFeed(apple)).toBeNull();
		fetchMock.mockImplementation(async () => {
			throw new Error('net');
		});
		expect(await lookupApplePodcastFeed(apple)).toBeNull();
	});
});

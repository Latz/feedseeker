import { describe, it, expect } from 'vitest';
import { isChallengeResponse, CHALLENGE_BODY_SIGNATURES } from '../modules/challengeDetection.ts';

describe('challengeDetection', () => {
	describe('isChallengeResponse', () => {
		it('detects a Cloudflare "Just a moment..." managed challenge by body signature', () => {
			const html =
				'<!DOCTYPE html><html><head><title>Just a moment...</title></head>' +
				'<body><noscript><div class="h2"><span id="challenge-error-text">Enable JavaScript and cookies to continue</span></div></noscript></body></html>';
			const response = new Response('', { status: 403 });
			expect(isChallengeResponse(response, html)).toBe(true);
		});

		it('detects a Vercel Security Checkpoint page by body signature', () => {
			const html =
				'<!DOCTYPE html><html><head><title>Vercel Security Checkpoint</title></head><body></body></html>';
			const response = new Response('', { status: 403 });
			expect(isChallengeResponse(response, html)).toBe(true);
		});

		it('detects an AWS WAF captcha challenge via the x-amzn-waf-action header', () => {
			const response = new Response('', {
				status: 405,
				headers: { 'x-amzn-waf-action': 'captcha' }
			});
			expect(isChallengeResponse(response, '<html><body>Human verification required</body></html>')).toBe(
				true
			);
		});

		it('returns false for an ordinary non-OK response', () => {
			const response = new Response('', { status: 404 });
			expect(isChallengeResponse(response, '<html><body>Page not found</body></html>')).toBe(false);
		});

		it('returns false when x-amzn-waf-action has a non-captcha value', () => {
			const response = new Response('', { status: 403, headers: { 'x-amzn-waf-action': 'block' } });
			expect(isChallengeResponse(response, '<html><body>Forbidden</body></html>')).toBe(false);
		});

		it('does not throw and returns false for a response without a headers object at all', () => {
			const response = { status: 500 } as unknown as Response;
			expect(() => isChallengeResponse(response, '<html><body>Server error</body></html>')).not.toThrow();
			expect(isChallengeResponse(response, '<html><body>Server error</body></html>')).toBe(false);
		});
	});

	describe('CHALLENGE_BODY_SIGNATURES', () => {
		it('exports at least one pattern', () => {
			expect(CHALLENGE_BODY_SIGNATURES.length).toBeGreaterThan(0);
		});
	});
});

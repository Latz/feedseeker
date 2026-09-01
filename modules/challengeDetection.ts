/**
 * @fileoverview challengeDetection - Bot-mitigation challenge page detection
 *
 * Known bot-mitigation challenge pages return a non-OK response with a real
 * HTML body (not a plain error page) that a browser would solve via JS, but
 * that no HTTP client we use can pass. Detecting these lets callers tell the
 * user *why* nothing was found instead of implying the site has no feed, and
 * lets fetchWithTimeout decide when a TLS-fingerprint-spoofing fallback is
 * worth attempting.
 *
 * @module challengeDetection
 */

export const CHALLENGE_BODY_SIGNATURES = [
	/id=["']challenge-error-text["']/i, // Cloudflare "Just a moment..." managed challenge
	/Vercel Security Checkpoint/i,
];

export function isChallengeResponse(response: Response, body: string): boolean {
	// AWS WAF's Human Verification (CAPTCHA) challenge is signaled by a
	// response header, not distinctive body text.
	if (response.headers?.get('x-amzn-waf-action') === 'captcha') return true;

	return CHALLENGE_BODY_SIGNATURES.some((pattern) => pattern.test(body));
}

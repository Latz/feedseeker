import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import {
	validateUrl,
	validateContentSize,
	validateTimeout,
	VALIDATION_LIMITS
} from '../modules/checkFeed/validation.ts';

describe('validateUrl', () => {
	it.each(['http://a.example', 'https://a.example/feed?x=1'])('accepts %s', (url) => {
		expect(() => validateUrl(url)).not.toThrow();
	});

	it('rejects unparsable URLs', () => {
		expect(() => validateUrl('not a url')).toThrow(new Error('Invalid URL: not a url'));
	});

	it.each([
		['ftp://a.example', 'ftp:'],
		['file:///etc/passwd', 'file:'],
		['javascript:alert(1)', 'javascript:']
	])('rejects %s', (url, protocol) => {
		expect(() => validateUrl(url)).toThrow(
			new Error(`Invalid protocol: ${protocol}. Only http: and https: protocols are allowed.`)
		);
	});
});

describe('validateContentSize', () => {
	it('accepts content of exactly the limit', () => {
		expect(() => validateContentSize(' '.repeat(VALIDATION_LIMITS.MAX_CONTENT_SIZE))).not.toThrow();
	});

	it('rejects content one character over the limit', () => {
		const size = VALIDATION_LIMITS.MAX_CONTENT_SIZE + 1;
		expect(() => validateContentSize(' '.repeat(size))).toThrow(
			new Error(
				`Content too large: ${size} bytes. Maximum allowed: ${VALIDATION_LIMITS.MAX_CONTENT_SIZE} bytes.`
			)
		);
	});
});

describe('validateTimeout', () => {
	let warn: Mock;
	beforeEach(() => {
		warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) as unknown as Mock;
	});
	afterEach(() => vi.restoreAllMocks());

	it.each([[undefined], [null as unknown as undefined]])(
		'uses the default for %s without warning',
		(value) => {
			expect(validateTimeout(value)).toBe(15);
			expect(warn).not.toHaveBeenCalled();
		}
	);

	it.each([[0], [-5], [Number.NaN], [Number.POSITIVE_INFINITY]])(
		'falls back to the default for %s with a warning',
		(value) => {
			expect(validateTimeout(value)).toBe(15);
			expect(warn).toHaveBeenCalledWith(
				`Invalid timeout value ${value}. Using default: 15 seconds.`
			);
		}
	);

	it('accepts exactly the maximum without warning', () => {
		expect(validateTimeout(60)).toBe(60);
		expect(warn).not.toHaveBeenCalled();
	});

	it('clamps values over the maximum with a warning', () => {
		expect(validateTimeout(61)).toBe(60);
		expect(warn).toHaveBeenCalledWith('Timeout value 61 exceeds maximum. Clamping to 60 seconds.');
	});

	it('keeps fractional seconds instead of rounding them down', () => {
		// 0.5 used to become 0, which fetchWithTimeout then rejected as an invalid timeout
		expect(validateTimeout(0.5)).toBe(0.5);
		expect(validateTimeout(10.7)).toBe(10.7);
		expect(warn).not.toHaveBeenCalled();
	});
});

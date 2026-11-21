import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	getEndpointsByMode,
	validateSearchMode,
	validateConcurrency,
	validateRequestDelay,
	isValidUrlLength,
	MAX_URL_LENGTH
} from '../modules/blindsearch/validation.ts';
import endpointsData from '../modules/blindsearch/endpoints.json' with { type: 'json' };

describe('blindsearch/validation', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('getEndpointsByMode', () => {
		it('falls back to essential+standard endpoints for an unrecognized mode', () => {
			// @ts-expect-error testing runtime fallback for an invalid mode value
			expect(getEndpointsByMode('bogus')).toEqual(getEndpointsByMode('standard'));
		});
	});

	describe('validateSearchMode', () => {
		it('returns the default mode when mode is undefined', () => {
			expect(validateSearchMode(undefined)).toBe('standard');
		});

		it('warns and falls back to the default mode for an invalid mode string', () => {
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			expect(validateSearchMode('nonsense')).toBe('standard');
			expect(warnSpy).toHaveBeenCalledWith(
				expect.stringContaining('Invalid search mode "nonsense"')
			);
		});

		it('returns a valid mode unchanged', () => {
			expect(validateSearchMode('exhaustive')).toBe('exhaustive');
		});
	});

	describe('validateConcurrency', () => {
		it('returns the default when concurrency is undefined', () => {
			expect(validateConcurrency(undefined)).toBe(3);
		});

		it('warns and clamps to the minimum for a non-finite concurrency', () => {
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			expect(validateConcurrency(Number.NaN)).toBe(1);
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid concurrency value'));
		});

		it('warns and clamps to the minimum for a concurrency below the minimum', () => {
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			expect(validateConcurrency(0)).toBe(1);
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid concurrency value 0'));
		});

		it('warns and clamps to the maximum for a concurrency above the maximum', () => {
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			expect(validateConcurrency(50)).toBe(10);
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('exceeds maximum'));
		});

		it('floors a valid fractional concurrency', () => {
			expect(validateConcurrency(2.9)).toBe(2);
		});
	});

	describe('validateRequestDelay', () => {
		it('returns the default when delay is undefined', () => {
			expect(validateRequestDelay(undefined)).toBe(0);
		});

		it('warns and falls back to the default for a negative delay', () => {
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			expect(validateRequestDelay(-100)).toBe(0);
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid request delay -100'));
		});

		it('warns and clamps to the maximum for a delay above the maximum', () => {
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			expect(validateRequestDelay(120000)).toBe(60000);
			expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('exceeds maximum'));
		});

		it('floors a valid fractional delay', () => {
			expect(validateRequestDelay(500.7)).toBe(500);
		});
	});

	describe('isValidUrlLength', () => {
		it('accepts a URL at exactly the maximum length', () => {
			const url = 'a'.repeat(MAX_URL_LENGTH);
			expect(isValidUrlLength(url)).toBe(true);
		});

		it('rejects a URL longer than the maximum length', () => {
			const url = 'a'.repeat(MAX_URL_LENGTH + 1);
			expect(isValidUrlLength(url)).toBe(false);
		});
	});
});

describe('blindsearch/validation — endpoint lists per mode', () => {
	it('builds each mode from the endpoint groups', () => {
		const { essential, standard, comprehensive } = endpointsData;
		expect(getEndpointsByMode('fast')).toEqual(essential);
		expect(getEndpointsByMode('standard')).toEqual([...essential, ...standard]);
		expect(getEndpointsByMode('exhaustive')).toEqual([...essential, ...standard, ...comprehensive]);
		expect(getEndpointsByMode('full')).toEqual([...essential, ...standard, ...comprehensive]);
	});
});

describe('blindsearch/validation — valid input does not warn', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it.each([[undefined], ['']])('search mode %j falls back to standard silently', (mode) => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(validateSearchMode(mode)).toBe('standard');
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it.each(['fast', 'standard', 'exhaustive', 'full'])(
		'search mode %s is accepted silently',
		(mode) => {
			const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
			expect(validateSearchMode(mode)).toBe(mode);
			expect(warnSpy).not.toHaveBeenCalled();
		}
	);

	it.each([
		[undefined, 3],
		[null, 3],
		[1, 1],
		[10, 10]
	])('concurrency %j → %i without warning', (value, expected) => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(validateConcurrency(value as number | undefined)).toBe(expected);
		expect(warnSpy).not.toHaveBeenCalled();
	});

	it.each([
		[undefined, 0],
		[null, 0],
		[0, 0],
		[60000, 60000]
	])('request delay %j → %i without warning', (value, expected) => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		expect(validateRequestDelay(value as number | undefined)).toBe(expected);
		expect(warnSpy).not.toHaveBeenCalled();
	});
});

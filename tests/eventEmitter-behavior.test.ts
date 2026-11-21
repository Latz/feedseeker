import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import EventEmitter from '../modules/eventEmitter.ts';

let warn: Mock;
let error: Mock;
beforeEach(() => {
	warn = vi.spyOn(console, 'warn').mockImplementation(() => {}) as unknown as Mock;
	error = vi.spyOn(console, 'error').mockImplementation(() => {}) as unknown as Mock;
});
afterEach(() => {
	vi.restoreAllMocks();
	EventEmitter.setDefaultMaxListeners(10);
});

const noop = () => {};

describe('max listeners', () => {
	it.each([
		['setDefaultMaxListeners', (n: number) => EventEmitter.setDefaultMaxListeners(n)],
		['setMaxListeners', (n: number) => new EventEmitter().setMaxListeners(n)]
	])('%s accepts 0 and rejects negative or fractional values', (_name, set) => {
		expect(() => set(0)).not.toThrow();
		for (const bad of [-1, 1.5, '3' as unknown as number]) {
			expect(() => set(bad)).toThrow(new TypeError('Max listeners must be a non-negative integer'));
		}
	});

	it('applies the default to new instances', () => {
		EventEmitter.setDefaultMaxListeners(3);
		expect(new EventEmitter().getMaxListeners()).toBe(3);
		expect(new EventEmitter({ maxListeners: 7 }).getMaxListeners()).toBe(7);
	});

	it('warns only once the limit is exceeded, for on and prependListener', () => {
		const e = new EventEmitter({ maxListeners: 2 });
		e.on('x', () => {}).on('x', () => {});
		expect(warn).not.toHaveBeenCalled();
		e.prependListener('x', () => {});
		expect(warn).toHaveBeenCalledWith(
			'Warning: Possible EventEmitter memory leak detected. 3 x listeners added. Use emitter.setMaxListeners() to increase limit'
		);
	});

	it('never warns with a limit of 0', () => {
		const e = new EventEmitter({ maxListeners: 0 });
		for (let i = 0; i < 20; i++) e.on('x', () => {});
		expect(warn).not.toHaveBeenCalled();
	});
});

describe('argument validation', () => {
	const methods = ['on', 'once', 'prependListener', 'prependOnceListener'] as const;

	it.each(methods)('%s rejects empty, blank and non-string event names', (method) => {
		const e = new EventEmitter();
		for (const name of ['', '   ', 42 as unknown as string]) {
			expect(() => e[method](name, noop)).toThrow(
				new TypeError('Event must be a non-empty string')
			);
		}
	});

	it.each(methods)('%s rejects non-function listeners', (method) => {
		const e = new EventEmitter();
		expect(() => e[method]('x', 'nope' as never)).toThrow(
			new TypeError('Listener must be a function')
		);
	});

	it('removeAllListeners validates a given name, removes only that event, or everything without one', () => {
		const e = new EventEmitter().on('a', noop).on('b', noop);
		expect(() => e.removeAllListeners('  ')).toThrow('Event must be a non-empty string');
		e.removeAllListeners('a');
		expect(e.eventNames()).toEqual(['b']);
		e.removeAllListeners();
		expect(e.eventNames()).toEqual([]);
	});
});

describe('off', () => {
	it('removes a direct listener and forgets the event once empty', () => {
		const fn = vi.fn();
		const e = new EventEmitter().on('x', fn);
		e.off('x', fn);
		expect(e.emit('x')).toBe(false);
		expect(fn).not.toHaveBeenCalled();
		expect(e.eventNames()).toEqual([]);
	});

	it('removes a once() listener by its original function', () => {
		const fn = vi.fn();
		const e = new EventEmitter().once('x', fn);
		e.off('x', fn);
		e.emit('x');
		expect(fn).not.toHaveBeenCalled();
	});
});

describe('unhandled error events', () => {
	it('rethrows an Error as-is', () => {
		const err = new Error('boom');
		expect(() => new EventEmitter().emit('error', err)).toThrow(err);
	});

	it.each([
		[{ error: 'from error prop' }, 'from error prop'],
		[{ message: 'from message prop' }, 'from message prop'],
		[
			{ error: 42, message: 'message wins over non-string error' },
			'message wins over non-string error'
		],
		[{ code: 7 }, '{"code":7}'],
		['plain string', 'plain string'],
		[null, 'null']
	])('serializes %j', (value, text) => {
		expect(() => new EventEmitter().emit('error', value)).toThrow(`Unhandled error event: ${text}`);
	});

	it('falls back for objects that cannot be serialized', () => {
		const circular: Record<string, unknown> = {};
		circular.self = circular;
		expect(() => new EventEmitter().emit('error', circular)).toThrow(
			'Unhandled error event: [unserializable object]'
		);
	});
});

describe('errors thrown by listeners', () => {
	it('routes them to error listeners with the event name', () => {
		const err = new Error('boom');
		const onError = vi.fn();
		const e = new EventEmitter().on('error', onError).on('data', () => {
			throw err;
		});
		e.emit('data');
		expect(onError).toHaveBeenCalledWith(err, 'data');
	});

	it('rethrows and logs them when there is no error listener (also after one was removed)', () => {
		const err = new Error('boom');
		const e = new EventEmitter().on('data', () => {
			throw err;
		});
		e.on('error', noop).off('error', noop);
		expect(() => e.emit('data')).toThrow(err);
		expect(error).toHaveBeenCalledWith("Unhandled error in event listener for 'data':", err);
	});

	it.each([
		[new Error('listener broke'), 'listener broke'],
		[{ message: 'object thrown' }, 'object thrown']
	])('logs and rethrows when an error listener itself throws %j', (thrown, text) => {
		const e = new EventEmitter().on('error', () => {
			throw thrown;
		});
		expect(() => e.emit('error', new Error('original'))).toThrow();
		expect(error).toHaveBeenCalledWith('Error in error event listener:', text);
	});
});

describe('async listeners', () => {
	/** Listener returning an already-handled rejection, so an uncaptured one is not "unhandled". */
	const rejecting = (err: Error) => () => {
		const p = Promise.reject(err);
		p.catch(() => {});
		return p;
	};

	it('captures rejections by default', async () => {
		const err = new Error('async boom');
		const onError = vi.fn();
		new EventEmitter().on('error', onError).on('data', rejecting(err)).emit('data');
		await vi.waitFor(() => expect(onError).toHaveBeenCalledWith(err, 'data'));
	});

	it('leaves rejections alone with captureAsyncErrors: false', async () => {
		const onError = vi.fn();
		new EventEmitter({ captureAsyncErrors: false })
			.on('error', onError)
			.on('data', rejecting(new Error('x')))
			.emit('data');
		await new Promise((r) => setTimeout(r, 10));
		expect(onError).not.toHaveBeenCalled();
	});
});

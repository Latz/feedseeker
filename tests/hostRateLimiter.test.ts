import { describe, it, expect } from 'vitest';
import { acquireHostSlot, trackedHostCount } from '../modules/hostRateLimiter.ts';

const ok = () => new Response('', { status: 200 });

describe('hostRateLimiter — host table does not grow without bound', () => {
	it('forgets a host once it has nothing left to remember', async () => {
		const before = trackedHostCount();
		for (let i = 0; i < 50; i++) {
			const release = await acquireHostSlot(`site${i}.forget.test`);
			release(ok());
		}
		expect(trackedHostCount()).toBe(before);
	});

	it('forgets a host also after a failed request (no response)', async () => {
		const before = trackedHostCount();
		const release = await acquireHostSlot('errored.forget.test');
		release(null);
		expect(trackedHostCount()).toBe(before);
	});

	it('keeps a host while requests are in flight or queued', async () => {
		const before = trackedHostCount();
		const a = await acquireHostSlot('busy.forget.test');
		const b = await acquireHostSlot('busy.forget.test');
		const queued = acquireHostSlot('busy.forget.test'); // over the cap of 2: waits
		a(ok());
		expect(trackedHostCount()).toBe(before + 1);
		b(ok());
		(await queued)(ok());
		expect(trackedHostCount()).toBe(before);
	});

	it('never lets a woken waiter run beside a fresh entry (cap of 2 holds)', async () => {
		const host = 'handover.forget.test';
		const a = await acquireHostSlot(host);
		const b = await acquireHostSlot(host);
		const waiter = acquireHostSlot(host); // queued
		a(ok());
		b(ok()); // wakes nobody new; the waiter was woken by a()
		const w = await waiter;
		// waiter holds 1 slot: two more fit, a third must queue
		const c = await acquireHostSlot(host);
		let dAcquired = false;
		const d = acquireHostSlot(host).then((r) => {
			dAcquired = true;
			return r;
		});
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(dAcquired).toBe(false);
		w(ok());
		(await d)(ok());
		c(ok());
	});

	it('keeps a host that has a 403 streak, a 429 cooldown or a rate-limit wait', async () => {
		const before = trackedHostCount();
		(await acquireHostSlot('forbidden.keep.test'))(new Response('', { status: 403 }));
		(await acquireHostSlot('cooldown.keep.test'))(new Response('', { status: 429 }));
		(await acquireHostSlot('ratelimit.keep.test'))(
			new Response('', { headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '60' } })
		);
		expect(trackedHostCount()).toBe(before + 3);
	});
});

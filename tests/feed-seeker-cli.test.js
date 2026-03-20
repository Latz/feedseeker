import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// CLI tests focus on what we can verify without broken constructor mocking.
// The run() function is integration-heavy (network calls), so we test
// structural/argument-parsing behaviors via the exported module.

describe('FeedSeeker CLI', () => {
	describe('module structure', () => {
		it('exports a run() function', async () => {
			const mod = await import('../feed-seeker-cli.ts');
			expect(typeof mod.run).toBe('function');
		});
	});

	describe('argument parsing', () => {
		let stdoutSpy, consoleSpy, exitSpy;

		beforeEach(() => {
			stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
			consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
			// Don't mock process.exit to avoid interfering with commander
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it('calling run() with no URL exits with an error indication', async () => {
			const { run } = await import('../feed-seeker-cli.ts');
			exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
				throw new Error('exit');
			});
			// Commander calls process.exit(1) when required arg is missing
			await expect(run(['node', 'cli'])).rejects.toThrow();
		});
	});
});

#!/usr/bin/env node

/**
 * Example: Checking initialization status
 *
 * This example demonstrates how to use the new getInitStatus() and isInitialized()
 * methods to detect initialization failures without relying solely on event listeners.
 */

import FeedSeeker from '../feed-seeker.ts';

async function demonstrateInitStatus() {
	console.log('=== Initialization Status Tracking Demo ===\n');

	// Example 1: Successful initialization
	console.log('1. Testing successful initialization:');
	const validSeeker = new FeedSeeker('https://example.com');

	console.log(`   Status before init: ${validSeeker.getInitStatus()}`);
	console.log(`   Is initialized: ${validSeeker.isInitialized()}`);

	await validSeeker.initialize();

	console.log(`   Status after init: ${validSeeker.getInitStatus()}`);
	console.log(`   Is initialized: ${validSeeker.isInitialized()}\n`);

	// Example 2: Failed initialization (invalid URL)
	console.log('2. Testing failed initialization (invalid URL):');
	const invalidSeeker = new FeedSeeker('not-a-valid-url');

	// Add error listener to suppress error output
	invalidSeeker.on('error', () => {});

	console.log(`   Status before init: ${invalidSeeker.getInitStatus()}`);
	console.log(`   Is initialized: ${invalidSeeker.isInitialized()}`);

	await invalidSeeker.initialize();

	console.log(`   Status after init: ${invalidSeeker.getInitStatus()}`);
	console.log(`   Is initialized: ${invalidSeeker.isInitialized()}\n`);

	// Example 3: Failed initialization (empty site)
	console.log('3. Testing failed initialization (empty site):');
	const emptySeeker = new FeedSeeker('');

	// Add error listener to suppress error output
	emptySeeker.on('error', () => {});

	console.log(`   Status before init: ${emptySeeker.getInitStatus()}`);

	await emptySeeker.initialize();

	console.log(`   Status after init: ${emptySeeker.getInitStatus()}`);
	console.log(`   Is initialized: ${emptySeeker.isInitialized()}\n`);

	// Example 4: Practical usage pattern
	console.log('4. Practical usage pattern:');
	const seeker = new FeedSeeker('https://example.com');

	await seeker.initialize();

	if (seeker.isInitialized()) {
		console.log('   ✓ Initialization successful, proceeding with feed search...');
		const feeds = await seeker.metaLinks();
		console.log(`   Found ${feeds.length} feeds`);
	} else {
		console.log('   ✗ Initialization failed, cannot search for feeds');
		console.log(`   Status: ${seeker.getInitStatus()}`);
	}
}

demonstrateInitStatus().catch(console.error);

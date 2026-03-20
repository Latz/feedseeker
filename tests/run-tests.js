import { run } from 'node:test';

// Get test files from command line arguments or use default list
const args = process.argv.slice(2);
const defaultTestFiles = [
	'./tests/eventEmitter.test.js',
	'./tests/checkFeed.test.js',
	'./tests/feedSeeker.test.js',
	'./tests/blindSearch.test.js',
	'./tests/deepSearch.test.js',
	'./tests/metaLinks.test.js',
	'./tests/fetchWithTimeout.test.js',
	'./tests/feed-seeker-cli.test.js'
];

const testFiles = args.length > 0 ? args : defaultTestFiles;

// Run tests
const testResults = await run({
	files: testFiles
});

// Collect results
let passed = 0;
let failed = 0;
let skipped = 0;

for await (const event of testResults) {
	if (event.type === 'test:pass') {
		passed++;
		console.log(`✓ ${event.data.name}`);
	} else if (event.type === 'test:fail') {
		failed++;
		console.log(`✗ ${event.data.name}`);
	} else if (event.type === 'test:skip') {
		skipped++;
		console.log(`- ${event.data.name} (skipped)`);
	}
}

console.log(`\\nTest Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);

if (failed > 0) {
	process.exit(1);
}

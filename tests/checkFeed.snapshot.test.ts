import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import checkFeed from '../modules/checkFeed.ts';

const dir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const load = (name: string) => readFileSync(join(dir, name), 'utf-8');
const URL = 'https://example.com/feed';

describe('checkFeed snapshot tests', () => {
	describe('RSS', () => {
		it.each([
			'rss-elektroelch.xml',
			'rss-hn-frontpage.xml',
			'rss-nasa-image.xml',
			'rss-guardian.xml',
			'rss-euobserver.xml',
			'rss-hessenschau.xml',
			'rss-betanews.xml',
			'rss-stylestage.xml',
			'rss-tt-rss.xml',
			'rss-visualcapitalist.xml',
		])('%s', async (file) => {
			expect(await checkFeed(URL, load(file))).toMatchSnapshot();
		});
	});

	describe('Atom', () => {
		it.each([
			'atom-daringfireball.xml',
			'atom-xkcd.xml',
			'atom-github-powertoys.xml',
			'atom-github-tagify.xml',
			'atom-cursor.xml',
			'atom-zoom-dev.xml',
			'atom-shkspr.xml',
			'atom-rachelbythebay.xml',
			'atom-geminiprotocol.xml',
			'atom-pagedout.xml',
		])('%s', async (file) => {
			expect(await checkFeed(URL, load(file))).toMatchSnapshot();
		});
	});

	describe('JSON Feed', () => {
		it.each([
			'json-microblog-manton.json',
			'json-microblog-vincent.json',
			'json-macstories.json',
			'json-inessential.json',
			'json-sixcolors.json',
			'json-hypercritical.json',
			'json-jimnielson.json',
			'json-adactio.json',
			'json-podnews.json',
			'json-netnewswire.json',
		])('%s', async (file) => {
			expect(await checkFeed(URL, load(file))).toMatchSnapshot();
		});
	});
});

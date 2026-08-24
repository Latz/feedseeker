#!/usr/bin/env node
// Tests all feeds in feeds.opml: runs FeedSeeker (all strategies incl. deepSearch)
// on each site's htmlUrl and checks if the known xmlUrl is discovered.
// Network errors are ignored. Writes fehler.md and prints failures to console.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from 'fs';
import FeedSeeker from './dist/feedseeker.js';

const PROGRESS_FILE = 'test-opml-progress.json';

const CONCURRENCY = 3;
const TIMEOUT = 20; // seconds

const NETWORK_PATTERNS = [
  'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'ECONNABORTED',
  'EHOSTUNREACH', 'ENETUNREACH', 'ERR_NETWORK', 'UND_ERR', 'fetch failed',
  'AbortError', 'socket hang up', 'SSL', 'certificate',
];

function isNetworkError(err) {
  const msg = String(err?.message ?? err).toLowerCase();
  const code = (err?.code ?? err?.cause?.code ?? '').toLowerCase();
  return NETWORK_PATTERNS.some(p => msg.includes(p.toLowerCase()) || code.includes(p.toLowerCase()));
}

// Parse OPML: extract { title, xmlUrl, htmlUrl } from each <outline>
function parseOpml(xml) {
  const entries = [];
  for (const tag of xml.matchAll(/<outline[^>]+>/g)) {
    const attr = (name) => {
      const m = tag[0].match(new RegExp(`${name}="([^"]*)"`));
      return m ? m[1].replace(/&amp;/g, '&') : null;
    };
    const xmlUrl = attr('xmlUrl');
    if (!xmlUrl) continue;
    entries.push({
      title: attr('title') ?? attr('text') ?? xmlUrl,
      xmlUrl,
      htmlUrl: attr('htmlUrl') ?? '',
    });
  }
  return entries;
}

// Normalize URL for comparison (lowercase, no trailing slash, preserve query)
function norm(url) {
  try {
    const u = new URL(url);
    return (u.origin + u.pathname.replace(/\/$/, '') + u.search).toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/$/, '');
  }
}

async function testEntry(entry, index, total) {
  const { title, xmlUrl, htmlUrl } = entry;
  // Use htmlUrl as the site to search; fall back to origin of xmlUrl
  let startUrl = htmlUrl?.trim() || (() => { try { const u = new URL(xmlUrl); return u.origin; } catch { return xmlUrl; } })();

  process.stdout.write(`[${index + 1}/${total}] ${title} ... `);

  try {
    const seeker = new FeedSeeker(startUrl, {
      timeout: TIMEOUT,
      keepQueryParams: true,
    });
    const feeds = await seeker.startSearch();
    const foundNorms = feeds.map(f => norm(f.url));
    const found = foundNorms.includes(norm(xmlUrl));

    if (found) {
      process.stdout.write('OK\n');
    } else {
      process.stdout.write(`FEHLER (nicht gefunden, ${feeds.length} andere Feeds entdeckt)\n`);
    }
    return { title, xmlUrl, startUrl, found, skip: false, error: null };
  } catch (err) {
    if (isNetworkError(err)) {
      process.stdout.write('SKIP (Netzwerkfehler)\n');
      return { title, xmlUrl, startUrl, found: false, skip: true, error: err?.message };
    }
    process.stdout.write(`FEHLER (${err?.message})\n`);
    return { title, xmlUrl, startUrl, found: false, skip: false, error: err?.message };
  }
}

function loadProgress() {
  if (!existsSync(PROGRESS_FILE)) return {};
  try {
    return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveProgress(done) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(done, null, 2), 'utf-8');
}

async function runConcurrent(entries, limit, done) {
  const results = new Array(entries.length);
  let next = 0;
  async function worker() {
    while (next < entries.length) {
      const i = next++;
      if (done[entries[i].xmlUrl]) {
        results[i] = done[entries[i].xmlUrl];
        process.stdout.write(`[${i + 1}/${entries.length}] ${entries[i].title} ... (übersprungen, bereits erledigt)\n`);
        continue;
      }
      results[i] = await testEntry(entries[i], i, entries.length);
      done[entries[i].xmlUrl] = results[i];
      saveProgress(done);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}

// --- Main ---
const xml = readFileSync('feeds.opml', 'utf-8');
const entries = parseOpml(xml);

const done = loadProgress();
const resuming = Object.keys(done).length;

console.log(`\nTeste ${entries.length} Feeds aus feeds.opml (metaLinks, blindSearch, anchors)...`);
if (resuming > 0) console.log(`Fortsetzen: ${resuming} bereits erledigt, ${entries.length - resuming} verbleibend.\n`);
else console.log();

const results = await runConcurrent(entries, CONCURRENCY, done);

const passed  = results.filter(r => r.found);
const failed  = results.filter(r => !r.found && !r.skip);
const skipped = results.filter(r => r.skip);

// Write fehler.md
const md = [
  '# Nicht erkannte Feeds',
  '',
  `**Getestet:** ${entries.length} | **Erkannt:** ${passed.length} | **Nicht erkannt:** ${failed.length} | **Übersprungen (Netzwerk):** ${skipped.length}`,
  '',
];

if (failed.length === 0) {
  md.push('Alle erreichbaren Feeds wurden erkannt.');
} else {
  for (const r of failed) {
    md.push(`## ${r.title}`);
    md.push(`- **Feed-URL:** ${r.xmlUrl}`);
    md.push(`- **Getestete Website:** ${r.startUrl}`);
    if (r.error) md.push(`- **Fehler:** ${r.error}`);
    md.push('');
  }
}

writeFileSync('fehler.md', md.join('\n'), 'utf-8');

// Console summary
console.log('\n--- Zusammenfassung ---');
console.log(`Gesamt:         ${entries.length}`);
console.log(`Erkannt:        ${passed.length}`);
console.log(`Nicht erkannt:  ${failed.length}`);
console.log(`Netzwerkfehler: ${skipped.length} (ignoriert)`);

if (failed.length > 0) {
  console.log('\nNicht erkannte Feeds:');
  for (const r of failed) {
    console.log(`\n  ${r.title}`);
    console.log(`    Feed:    ${r.xmlUrl}`);
    console.log(`    Website: ${r.startUrl}`);
    if (r.error) console.log(`    Fehler:  ${r.error}`);
  }
}

console.log('\nDetails in fehler.md geschrieben.');

// Remove progress file — run completed cleanly
if (existsSync(PROGRESS_FILE)) unlinkSync(PROGRESS_FILE);

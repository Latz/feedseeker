# Feature Suggestions

## High-value CLI (already in backlog)

- `--format opml` — export discovered feeds as OPML, universally importable into any feed reader
- `--file sites.txt` — batch mode, one URL per line, useful for auditing a list of sites
- `--type rss|atom|json` — filter output by feed type

## Discovery improvements

- Feed health check (`--check`) — verify each discovered feed has recent items (last published < 30 days), useful for pruning dead feeds
- Subdomain crawl (`--include-subdomains`) — deepSearch normalizes `www.` away but ignores other subdomains like `blog.example.com`
- `--follow-redirects` reporting — surface feeds that live behind redirects

## Output / integration

- `--format json` for all modes — makes feedseeker scriptable without parsing human-readable text
- `--quiet` — only print URLs, one per line, for pipe-friendly use
- Exit code reference (`--list-exit-codes` or man page section) — helps scripting users

## Library API

- `findAll(urls[])` — parallel multi-site search returning a `Map<url, Feed[]>`
- Progress events for non-deep strategies — deepSearch already emits events; metaLinks, anchors, blindSearch are silent

## Priority recommendation

`--format json` + `--file sites.txt` together: makes feedseeker scriptable for bulk auditing workflows, highest leverage for power users.

# Unconventional Feed Discovery Methods

## Overview

When standard feed discovery tools (like feed-seeker) fail to find RSS/Atom feeds, these unconventional methods can uncover hidden or non-obvious feed endpoints.

---

## Method 1: robots.txt Analysis

### Why It Works
Many sites list feed URLs in `robots.txt` to prevent search engines from crawling them excessively, inadvertently revealing their existence.

### How To
```bash
curl https://example.com/robots.txt
```

### What to Look For
- Lines containing `feed`, `rss`, `atom`, or `xml`
- Disallowed paths that might be feed endpoints
- Sitemap references (leads to Method 2)

### Example Discovery
```
# YouTube robots.txt
Disallow: /feeds/videos.xml
```
✅ **Found:** YouTube's feed endpoint (not linked anywhere on the site)

---

## Method 2: Sitemap.xml Deep Dive

### Why It Works
Sitemaps reveal content structure and section URLs. Feed endpoints often follow predictable patterns based on section paths.

### How To
```bash
curl https://example.com/sitemap.xml
```

### What to Look For
- Section URLs like `/blog/`, `/news/`, `/press/`, `/newsletter/`
- These sections often have feeds at `/section/feed` or `/section/rss`

### Strategy
1. Extract all section paths from sitemap
2. Append common feed suffixes to each section
3. Test each constructed URL

### Example
```
Found in sitemap:
- /newsletter/2024/01/article-name
- /the-teardown-sessions/posts/post-name

Try:
- /newsletter/feed
- /the-teardown-sessions/feed
```

---

## Method 3: HTTP Link Headers

### Why It Works
Some sites advertise feeds via HTTP `Link` headers instead of (or in addition to) HTML `<link>` tags.

### How To
```bash
curl -sI https://example.com | grep -i "link:"
```

### What to Look For
```
Link: <https://example.com/feed.xml>; rel="alternate"; type="application/rss+xml"
```

### Notes
- Not commonly used, but worth checking
- May reveal feeds not linked in HTML

---

## Method 4: CMS/Platform Detection

### Why It Works
Many platforms have predictable feed URL patterns.

### Common Platforms & Feed Patterns

| Platform | Feed Pattern |
|----------|--------------|
| WordPress | `/feed/`, `/rss/`, `/rss2/`, `/rdf/`, `/atom/` |
| Ghost | `/rss/`, `/feed/` |
| Substack | `/feed` |
| Medium | `/feed` |
| Blogger | `/feeds/posts/default` |
| Squarespace | `?format=rss` |
| Wix | `/feed.xml` |
| GitHub | `/{user}?format=atom`, `/{org}/{repo}/releases.atom` |
| YouTube | `/feeds/videos.xml?channel_id=ID` |

### How to Detect Platform
```bash
# Check for common headers
curl -sI https://example.com | grep -i "x-powered-by\|server\|x-generator"

# Check HTML generator meta tags
curl -s https://example.com | grep -i "generator\|wordpress\|ghost\|substack"
```

---

## Method 5: Well-Known URI Patterns

### Why It Works
RFC 5785 defines `.well-known/` for discovery endpoints. Some sites place feeds there.

### How To
```bash
curl https://example.com/.well-known/rss
curl https://example.com/.well-known/atom
curl https://example.com/.well-known/feed
```

### Notes
- Not widely adopted for feeds
- Worth a quick check

---

## Method 6: API Endpoint Discovery

### Why It Works
Modern sites often have JSON APIs that serve the same content as RSS feeds.

### Common API Patterns
```
/api/articles
/api/posts
/api/news
/api/blog
/api/content
/graphql (query for feed-like data)
```

### How to Test
```bash
curl https://example.com/api/articles | jq .
```

### What to Look For
- Arrays of objects with `title`, `url`, `published_at`, `content`
- Pagination metadata
- These can be consumed like feeds or converted to RSS

---

## Method 7: Google/Bing Search Operators

### Why It Works
Search engines index XML files that may not be linked from the main site.

### Search Queries
```
site:example.com filetype:xml
site:example.com inurl:feed
site:example.com inurl:rss
site:example.com inurl:atom
site:example.com ext:xml
```

### How to Automate
```bash
# Using Bing API or custom search
# Or manually visit:
https://www.google.com/search?q=site:example.com+filetype:xml
```

---

## Method 8: Wayback Machine

### Why It Works
Older versions of sites often had visible feed links that were removed in redesigns.

### How To
1. Visit `https://web.archive.org/web/*/https://example.com`
2. Browse historical snapshots
3. Look for feed links in older designs

### Bonus
Feed URLs often don't change even when sites are redesigned, so old links may still work.

---

## Method 9: Newsletter Service Detection

### Why It Works
Many newsletter platforms (Substack, Beehiiv, ConvertKit) automatically generate RSS feeds.

### Detection Patterns
```
# Substack
https://substackname.substack.com/feed

# Beehiiv
https://substackname.beehiiv.com/rss

# ConvertKit
Check for forms pointing to convertkit.com
```

### How to Detect
```bash
# Look for newsletter signup forms
curl -s https://example.com | grep -i "newsletter\|substack\|beehiiv\|convertkit"
```

---

## Method 10: JSON-LD & Structured Data

### Why It Works
Some sites include feed URLs in structured data markup.

### How To
```bash
curl -s https://example.com | grep -oP '<script type="application/ld\+json">.*?</script>'
```

### What to Look For
- `@type`: `Blog`
- `url` fields pointing to feed endpoints
- Custom properties with feed URLs

---

## Method 11: DNS & Subdomain Enumeration

### Why It Works
Some sites host feeds on dedicated subdomains.

### Common Feed Subdomains
```
feeds.example.com
rss.example.com
feed.example.com
blog.example.com
```

### How to Test
```bash
# Check if subdomain exists
curl -sI https://feeds.example.com | head -1
curl -sI https://rss.example.com | head -1
```

### Tools
- `subfinder`, `sublist3r` for subdomain enumeration
- `dig` or `nslookup` for DNS records

---

## Method 12: Linked Resources Analysis

### Why It Works
CSS, JavaScript, and image files sometimes contain comments with feed URLs.

### How To
```bash
# Extract all CSS/JS files
curl -s https://example.com | grep -oP 'href="[^"]+\.css"|src="[^"]+\.js"'

# Check each for feed references
curl -s https://example.com/styles.css | grep -i "feed\|rss\|atom"
```

---

## Method 13: Third-Party Aggregators

### Why It Works
Services like Feedly, Inoreader, and AllTop maintain databases of known feeds.

### How to Check
```
# Feedly
https://feedly.com/i/search?q=example.com

# Inoreader
https://www.inoreader.com/

# AllTop
https://alltop.com/
```

---

## Method 14: Social Media & About Pages

### Why It Works
Sites often link feeds on:
- About pages
- Press pages
- Developer documentation
- Social media profiles

### How to Check
```bash
curl -s https://example.com/about | grep -i "feed\|rss\|atom"
curl -s https://example.com/press | grep -i "feed\|rss\|atom"
```

---

## Method 15: Content-Type Probing

### Why It Works
Some feed endpoints return valid XML but aren't properly linked.

### How to Test
```bash
# Try common feed paths and check Content-Type
for path in /feed /rss /atom /feed.xml /rss.xml /atom.xml /index.xml; do
    CONTENT_TYPE=$(curl -sI "https://example.com$path" | grep -i "content-type:")
    if echo "$CONTENT_TYPE" | grep -q "xml\|rss\|atom"; then
        echo "Potential feed: $path"
    fi
done
```

---

## Quick Reference: Common Feed Paths

```
/feed
/rss
/atom
/feed.xml
/rss.xml
/atom.xml
/index.xml
/rss/index.xml
/feed/index.xml
/blog/feed
/news/feed
/press/feed
/updates/feed
```

---

## Automation Script Template

```bash
#!/bin/bash
# Unconventional Feed Discovery Script

SITE="$1"

echo "=== robots.txt ==="
curl -s "https://$SITE/robots.txt" | grep -i "feed\|rss\|atom\|sitemap"

echo -e "\n=== Sitemap ==="
curl -s "https://$SITE/sitemap.xml" | grep -oP "<loc>.*?</loc>"

echo -e "\n=== HTTP Headers ==="
curl -sI "https://$SITE" | grep -i "link:"

echo -e "\n=== Common Feed Paths ==="
for path in /feed /rss /atom /feed.xml /rss.xml; do
    STATUS=$(curl -sI "https://$SITE$path" | head -1 | grep -oP "HTTP/\d\.?\d? \K\d+")
    if [ "$STATUS" = "200" ]; then
        echo "✅ Found: $path"
    fi
done

echo -e "\n=== Well-Known URIs ==="
for path in /rss /atom /feed; do
    curl -sI "https://$SITE/.well-known$path" | head -1
done
```

---

## Case Studies

### 1. YouTube
- **Method:** robots.txt
- **Discovery:** `Disallow: /feeds/videos.xml`
- **Result:** `https://youtube.com/feeds/videos.xml?channel_id=ID`

### 2. CrowdSupply
- **Method:** Sitemap analysis
- **Discovery:** `/newsletter/`, `/the-teardown-sessions/` sections
- **Result:** No feeds found (email-only), but revealed content structure

### 3. GitHub
- **Method:** Platform detection
- **Discovery:** Known GitHub pattern
- **Result:** `https://github.com/{user}?format=atom`

---

## Troubleshooting

### Site returns 403/401
- Try different User-Agent
- Check if authentication required
- May be intentional blocking

### Feed returns empty content
- Endpoint may be deprecated
- Content may have moved
- Check Wayback Machine

### Too many false positives
- Verify Content-Type headers
- Check for valid XML/RSS structure
- Use feed validation tools

---

## Tools & Resources

- **curl** - HTTP requests
- **wget** - Recursive fetching
- **grep/ripgrep** - Pattern matching
- **xmllint** - XML validation
- **feedvalidator.org** - W3C feed validation
- **web.archive.org** - Historical snapshots

---

## Notes

- These methods work best in combination
- Always verify discovered feeds are valid XML
- Some endpoints may be rate-limited
- Respect robots.txt and terms of service
- Feed-seeker implements several of these methods automatically

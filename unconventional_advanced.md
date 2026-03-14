# Advanced & Deep Feed Discovery Techniques

## Overview

This document explores cutting-edge, unconventional, and deeply technical methods for discovering RSS/Atom feeds that go beyond standard discovery tools.

---

## Category 1: Network & Infrastructure Analysis

### 1.1 CDN Cache Enumeration

**Why It Works:** CDNs often cache feed files separately and may expose them through cache APIs or edge locations.

**Techniques:**
```bash
# Cloudflare cache check
curl -sI "https://example.com" | grep -i "cf-cache"

# Try CDN-specific feed paths
https://cdn.example.com/feed.xml
https://assets.example.com/rss/feed.xml
https://static.example.com/feeds/atom.xml

# Check CDN purge APIs (sometimes list cached resources)
curl -s "https://api.cloudflare.com/client/v4/zones/ZONE_ID/cache/purge"
```

### 1.2 HTTP/2 Server Push Analysis

**Why It Works:** Some servers push feed resources proactively to clients.

**Technique:**
```bash
# Capture HTTP/2 push promises
curl --http2 -sI https://example.com -v 2>&1 | grep -i "push\|link"
```

### 1.3 Preconnect/Prefetch Hints

**Why It Works:** Sites often hint at resources they expect users to access next.

**Technique:**
```bash
curl -s https://example.com | grep -i "preconnect\|prefetch\|prerender"
```

**Look for:**
```html
<link rel="preconnect" href="https://feeds.example.com">
<link rel="prefetch" href="/rss/latest.xml">
```

### 1.4 Service Worker Inspection

**Why It Works:** Service workers cache resources and may reveal feed URLs in their caching strategies.

**Technique:**
```bash
# Find service worker file
curl -s https://example.com | grep -oP 'navigator\.serviceWorker\.register\(["'\'']([^"'\'']+)["'\'']' | head -1

# Fetch and analyze
curl -s https://example.com/sw.js | grep -i "feed\|rss\|atom\|cache"
```

### 1.5 DNS TXT Records

**Why It Works:** Some sites publish feed metadata in DNS records.

**Technique:**
```bash
dig example.com TXT
nslookup -type=TXT example.com
```

**Look for:**
```
"feed-url=https://example.com/feed.xml"
```

### 1.6 DNS-SD/mDNS Discovery

**Why It Works:** Service Discovery protocols sometimes expose feed services on local networks.

**Technique:**
```bash
# Bonjour/Avahi discovery
avahi-browse -art | grep -i feed

# DNS-SD query
dig _rss._tcp.example.com PTR
```

### 1.7 IPv6 Alternate Endpoints

**Why It Works:** Some sites host different content on IPv6 vs IPv4.

**Technique:**
```bash
# Get AAAA record
dig example.com AAAA

# Test feed endpoints on IPv6
curl -6 -sI "https://example.com/feed.xml"
```

---

## Category 2: Content & Code Analysis

### 2.1 Source Map Analysis

**Why It Works:** JavaScript source maps can reveal original code with feed URLs stripped from production builds.

**Technique:**
```bash
# Find source map files
curl -s https://example.com | grep -oP 'sourceMappingURL=[^ ]+'

# Download and decode
curl -s https://example.com/app.js.map | jq '.sourcesContent[]' | grep -i feed
```

### 2.2 WebAssembly Module Inspection

**Why It Works:** Some sites embed feed URLs in Wasm modules for obfuscation.

**Technique:**
```bash
# Find Wasm files
curl -s https://example.com | grep -oP '[^"'\''>]+\.wasm'

# Disassemble and search
wasm2obj module.wasm | strings | grep -i "feed\|rss\|atom"
```

### 2.3 CSS Content Property Extraction

**Why It Works:** Some sites hide feed URLs in CSS `content:` properties.

**Technique:**
```bash
curl -s https://example.com/styles.css | grep -oP 'content:\s*["'\''][^"'\'']*feed[^"'\'']*["'\'']'
```

### 2.4 SVG Embedded Links

**Why It Works:** SVG files can contain clickable links to feeds.

**Technique:**
```bash
# Find all SVGs
curl -s https://example.com | grep -oP '[^"'\''>]+\.svg'

# Check for xlink:href
curl -s https://example.com/logo.svg | grep -i "xlink:href.*feed"
```

### 2.5 Web App Manifest Analysis

**Why It Works:** PWA manifests sometimes reference feed endpoints.

**Technique:**
```bash
# Find manifest
curl -s https://example.com | grep -oP 'manifest\.json'

# Analyze
curl -s https://example.com/manifest.json | jq '.related_applications[].url'
```

### 2.6 OpenSearch Description

**Why It Works:** OpenSearch files sometimes include feed URLs for search results.

**Technique:**
```bash
curl -s https://example.com | grep -i "opensearch"
curl -s https://example.com/opensearch.xml | grep -i "feed\|rss\|atom"
```

### 2.7 HTML Comments & Hidden Elements

**Why It Works:** Developers leave comments with feed URLs; some sites hide feeds in invisible elements.

**Technique:**
```bash
curl -s https://example.com | grep -oP '<!--[^>]*feed[^>]*-->'
curl -s https://example.com | grep -oP 'style=["'\'']display:\s*none[^>]*feed'
```

### 2.8 Data URI Schemes

**Why It Works:** Some sites embed feed URLs in base64-encoded data URIs.

**Technique:**
```bash
curl -s https://example.com | grep -oP 'data:[^,]+;base64,[A-Za-z0-9+/=]+' | \
  while read uri; do
    decoded=$(echo "$uri" | cut -d, -f2 | base64 -d 2>/dev/null)
    echo "$decoded" | grep -i "feed\|rss\|atom"
  done
```

### 2.9 JavaScript String Literal Analysis

**Why It Works:** Feed URLs often exist as string literals in JS even if not actively used.

**Technique:**
```bash
# Extract all JS files
curl -s https://example.com | grep -oP 'src=["'\''][^"'\'']*\.js["'\'']'

# Search for URL patterns
curl -s https://example.com/app.js | grep -oP 'https?://[^"'\''<> ]*(?:feed|rss|atom)[^"'\''<> ]*'
```

### 2.10 Template Literal Discovery

**Why It Works:** ES6 template literals may construct feed URLs dynamically.

**Technique:**
```bash
curl -s https://example.com/app.js | grep -oP '`[^`]*\$\{[^}]*\}[^`]*`' | \
  grep -i "feed\|rss\|atom"
```

---

## Category 3: Third-Party & External Data

### 3.1 RSS Aggregator APIs

**Why It Works:** Aggregators maintain databases of known feeds.

**Services to Query:**
```
# Feedly API
https://api.feedly.com/v3/search/feeds?q=example.com

# Inoreader API
https://www.inoreader.com/developers/api

# The Old Reader
https://theoldreader.com/feeds

# Feedbin API
https://api.feedbin.com/v2/feeds.json?q=example.com
```

### 3.2 IFTTT/Zapier Integration Discovery

**Why It Works:** Automation platforms index RSS feeds for triggers.

**Technique:**
```
https://ifttt.com/search?query=site:example.com+rss
https://zapier.com/app/search?q=example.com+feed
```

### 3.3 Social Media Platform APIs

**Why It Works:** Social platforms often auto-discover feeds when links are shared.

**Techniques:**
```bash
# Twitter oEmbed (reveals discovered content)
curl "https://publish.twitter.com/oembed?url=https://example.com"

# Facebook oEmbed
curl "https://graph.facebook.com/v18.0/oembed?url=https://example.com"

# LinkedIn
curl "https://api.linkedin.com/v2/ogp?url=https://example.com"
```

### 3.4 Slack/Discord Unfurl Data

**Why It Works:** Chat platforms fetch feed data for link previews.

**Technique:**
```bash
# Slack unfurl endpoint (requires token)
curl -X POST "https://slack.com/api/chat.unfurl" \
  -d "token=YOUR_TOKEN&unfurl_id=ID&source=example.com"
```

### 3.5 Email Client Preview Data

**Why It Works:** Email clients like Gmail fetch feed data for newsletter previews.

**Technique:** Check Gmail's "Follow" feature for discovered feeds.

### 3.6 Podcast Index & Directories

**Why It Works:** If the site has audio content, it may be in podcast directories.

**Services:**
```
https://podcastindex.org/search?q=example.com
https://listennotes.com/search/?q=example.com
https://podchaser.com/search?q=example.com
```

### 3.7 Google Discover Feed

**Why It Works:** Google Discover uses RSS-like feeds internally.

**Technique:**
```bash
# Try Google's internal feed format
https://www.google.com/search?q=site:example.com&tbm=nws
```

### 3.8 Microsoft Start/MSN Integration

**Why It Works:** MSN aggregates feeds from publishers.

**Check:**
```
https://www.msn.com/en-us/feed/publisher/example
```

### 3.9 Apple News Publisher Portal

**Why It Works:** Publishers submit RSS feeds to Apple News.

**Check:**
```
https://publisher.apple.com/news
```

### 3.10 Flipboard Magazine Discovery

**Why It Works:** Flipboard curates RSS feeds into magazines.

**Check:**
```
https://flipboard.com/search?q=example.com
```

### 3.11 Feedspot & Similar Directories

**Why It Works:** Feed directories maintain categorized RSS databases.

**Services:**
```
https://blog.feedspot.com/
https://www.rssmicro.com/search?q=example.com
https://feedsearch.dev/search?q=example.com
```

---

## Category 4: Developer & Build Artifacts

### 4.1 GitHub/GitLab Repository Mining

**Why It Works:** Source code often contains feed URLs not deployed to production.

**Technique:**
```bash
# Search GitHub
https://github.com/search?q=example.com+feed.xml&type=code

# Search GitLab
https://gitlab.com/search?search=feed.xml

# Check README files
curl -s https://raw.githubusercontent.com/org/repo/main/README.md | grep -i feed
```

### 4.2 NPM/Package Dependencies

**Why It Works:** RSS-related packages may indicate feed endpoints.

**Technique:**
```bash
# Check package.json
curl -s https://raw.githubusercontent.com/org/repo/main/package.json | \
  jq '.dependencies | keys[]' | grep -i "rss\|feed\|atom"
```

### 4.3 Docker Image Inspection

**Why It Works:** Docker images may contain feed configuration.

**Technique:**
```bash
docker pull example/app
docker history example/app
docker inspect example/app | grep -i feed
```

### 4.4 CI/CD Pipeline Analysis

**Why It Works:** Build pipelines may reference feed endpoints for testing.

**Check:**
```bash
# GitHub Actions
curl -s https://raw.githubusercontent.com/org/repo/main/.github/workflows/ci.yml | \
  grep -i feed

# GitLab CI
curl -s https://raw.githubusercontent.com/org/repo/main/.gitlab-ci.yml | \
  grep -i feed

# Travis CI
curl -s https://raw.githubusercontent.com/org/repo/main/.travis.yml | \
  grep -i feed
```

### 4.5 Environment Variable Leakage

**Why It Works:** Some sites accidentally expose feed URLs in environment configs.

**Check:**
```bash
# Common env file locations
curl -s https://example.com/.env
curl -s https://example.com/config/.env
curl -s https://example.com/api/.env
```

### 4.6 Build Output Directories

**Why It Works:** Build tools create directories that may contain feeds.

**Check:**
```
/dist/feed.xml
/build/rss.xml
/public/atom.xml
/static/feeds/
/out/rss/
```

### 4.7 TypeScript Definition Files

**Why It Works:** Type definitions may reference feed URL constants.

**Technique:**
```bash
curl -s https://example.com/types/index.d.ts | grep -i "feed\|rss\|atom"
```

### 4.8 GraphQL Schema Introspection

**Why It Works:** GraphQL APIs may have feed-related queries.

**Technique:**
```bash
curl -X POST https://example.com/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "query IntrospectionQuery { __schema { types { name fields { name } } } }"}' | \
  grep -i "feed\|rss\|atom"
```

---

## Category 5: User Behavior & Analytics

### 5.1 Google Analytics Configuration

**Why It Works:** GA may track feed link clicks, revealing feed URLs.

**Technique:**
```bash
curl -s https://example.com | grep -oP 'ga\(["'\'']send["'\''],['\s]*["'\'']event["'\''],['\s]*["'\''][^"'\'']*feed'
```

### 5.2 Hotjar/CrazyEgg Heatmaps

**Why It Works:** Session recording tools capture clicks on feed links.

**Note:** Requires access to analytics dashboard.

### 5.3 A/B Testing Configuration

**Why It Works:** A/B test variants may include/exclude feed links.

**Check:**
```bash
curl -s https://example.com | grep -i "optimizely\|vwo\|ab-test"
```

### 5.4 Search Autocomplete APIs

**Why It Works:** Site search may suggest feed-related queries.

**Technique:**
```bash
curl "https://example.com/api/search/autocomplete?q=fee"
curl "https://example.com/search/suggest?q=rss"
```

### 5.5 User Profile Exports

**Why It Works:** Some sites let users export their data including subscribed feeds.

**Check:**
```
https://example.com/settings/export
https://example.com/account/data
```

---

## Category 6: Mobile & App-Specific

### 6.1 Mobile App Deep Links

**Why It Works:** Apps use deep links that may point to feeds.

**Technique:**
```bash
# Check apple-app-site-association
curl -s https://example.com/.well-known/apple-app-site-association | \
  jq '.applinks.details[].components[].path'

# Check assetlinks.json for Android
curl -s https://example.com/.well-known/assetlinks.json | \
  jq '.[].target.namespace'
```

### 6.2 App Store Metadata

**Why It Works:** App descriptions may mention RSS features.

**Check:**
```
https://apps.apple.com/app/idAPP_ID (search description)
https://play.google.com/store/apps/details?id=com.example.app
```

### 6.3 APK/IPA File Analysis

**Why It Works:** Mobile app binaries contain hardcoded URLs.

**Technique:**
```bash
# Download APK
curl -L "https://play.google.com/store/apps/details?id=com.example" > app.apk

# Extract strings
unzip app.apk
strings classes.dex | grep -i "feed\|rss\|atom"
```

### 6.4 React Native/Flutter Bundle Analysis

**Why It Works:** JS bundles in mobile apps contain API endpoints.

**Technique:**
```bash
# Extract iOS app bundle
unzip App.ipa
strings Payload/App.app/main.jsbundle | grep -i feed
```

### 6.5 Push Notification Services

**Why It Works:** Firebase/OneSignal configs may reference feed endpoints.

**Check:**
```bash
curl -s https://example.com/firebase-messaging-sw.js | grep -i feed
```

---

## Category 7: Error Handling & Edge Cases

### 7.1 404 Page Analysis

**Why It Works:** Custom 404 pages sometimes suggest feed alternatives.

**Technique:**
```bash
curl -s https://example.com/nonexistent | grep -i "feed\|rss\|atom\|subscribe"
```

### 7.2 Error Message Mining

**Why It Works:** Error responses may reveal feed endpoints.

**Technique:**
```bash
# Try invalid feed paths and analyze errors
curl -s https://example.com/invalid-feed.xml | grep -oP 'href=["'\''][^"'\'']*'
```

### 7.3 Rate Limit Headers

**Why It Works:** Rate-limited endpoints may be valid feeds.

**Technique:**
```bash
curl -sI https://example.com/feed.xml | grep -i "rate-limit\|x-ratelimit"
```

### 7.4 Redirect Chain Analysis

**Why It Works:** Redirects may lead to feed endpoints.

**Technique:**
```bash
curl -sL -I https://example.com/rss 2>&1 | grep -i "location:"
```

### 7.5 HTTP OPTIONS Method

**Why It Works:** OPTIONS may reveal allowed endpoints including feeds.

**Technique:**
```bash
curl -sX OPTIONS https://example.com | grep -i "allow\|accept"
```

### 7.6 CORS Preflight Responses

**Why It Works:** CORS headers may reveal feed endpoints accessible from other origins.

**Technique:**
```bash
curl -sI -X OPTIONS https://example.com/feed.xml \
  -H "Origin: https://evil.com" | grep -i "access-control"
```

### 7.7 HTTP Range Requests

**Why It Works:** Partial requests can reveal file types.

**Technique:**
```bash
curl -sI https://example.com/feed.xml -H "Range: bytes=0-100"
```

---

## Category 8: Internationalization & Regional

### 8.1 Alternate Language Feeds

**Why It Works:** Sites may have feeds for different language versions.

**Check:**
```
https://example.com/es/feed.xml
https://example.com/fr/rss.xml
https://example.com/de/atom.xml
https://example.com/jp/feed
```

### 8.2 Country-Specific Domains

**Why It Works:** Regional sites may have separate feeds.

**Check:**
```
https://example.co.uk/feed.xml
https://example.de/rss.xml
https://example.co.jp/atom.xml
https://example.com.au/feed
```

### 8.3 hreflang Link Analysis

**Why It Works:** hreflang tags point to localized versions that may have feeds.

**Technique:**
```bash
curl -s https://example.com | grep -oP 'hreflang=["'\''][^"'\'']*["'\'']\s+href=["'\''][^"'\'']*'
```

### 8.4 Unicode/IDN Domain Variants

**Why It Works:** Internationalized domains may have separate feeds.

**Check:**
```
https://xn--example-9ta.com/feed.xml
```

---

## Category 9: Temporal & Versioned

### 9.1 Time-Based Feed Variants

**Why It Works:** Some sites have feeds for different time periods.

**Check:**
```
https://example.com/feed/2024.xml
https://example.com/rss/archive/2023.xml
https://example.com/atom/monthly/2024-03.xml
```

### 9.2 Versioned API Endpoints

**Why It Works:** API versioning may apply to feeds.

**Check:**
```
https://api.example.com/v1/feed
https://api.example.com/v2/rss
https://api.example.com/v3/atom
```

### 9.3 Git Commit History

**Why It Works:** Old commits may reference removed feed endpoints.

**Technique:**
```bash
# Search GitHub commit history
https://github.com/org/repo/commits/main?q=feed

# Check specific commit
curl -s https://raw.githubusercontent.com/org/repo/COMMIT_HASH/config.json | \
  grep -i feed
```

### 9.4 Database Dumps & Backups

**Why It Works:** Public data dumps may contain feed URLs.

**Check:**
```bash
# Common backup locations (often misconfigured)
curl -s https://example.com/backup.sql
curl -s https://example.com/db/dump.sql
```

---

## Category 10: Cross-Reference & Inference

### 10.1 Competitor Feed Analysis

**Why It Works:** Similar sites often use similar feed structures.

**Technique:**
```
# If competitor.com has /feed.xml
# Try example.com/feed.xml
```

### 10.2 Industry Standard Patterns

**Why It Works:** Industries have common feed conventions.

**Examples:**
- News sites: `/rss/headlines.xml`
- E-commerce: `/feed/products.xml`
- Podcasts: `/feed/podcast.xml`
- Job boards: `/feed/jobs.xml`

### 10.3 Technology Stack Inference

**Why It Works:** Same tech stack = same feed patterns.

**Technique:**
```bash
# BuiltWith lookup
curl "https://api.builtwith.com/free1/api.json?KEY=YOUR_KEY&LOOKUP=example.com" | \
  jq '.Results[].Frameworks[].Name'

# Wappalyzer API
```

### 10.4 Hosting Provider Patterns

**Why It Works:** Same hosting = similar configurations.

**Check:**
```bash
# Find sites on same IP
curl -s "https://api.hackertarget.com/reverseiplookup/?q=IP_ADDRESS" | \
  while read domain; do
    curl -sI "https://$domain/feed.xml" | head -1
  done
```

### 10.5 SSL Certificate Transparency Logs

**Why It Works:** CT logs reveal subdomains that may host feeds.

**Check:**
```
https://crt.sh/?q=example.com
https://transparencyreport.google.com/https/certificates
```

### 10.6 WHOIS History

**Why It Works:** Old WHOIS records may reference feed URLs in admin contacts.

**Check:**
```
https://whois-history.whoisxmlapi.com/
https://domainbigdata.com/
```

---

## Category 11: Machine Learning & AI

### 11.1 URL Pattern Prediction

**Why It Works:** ML models can predict likely feed URLs based on domain patterns.

**Approach:**
- Train on known feed URLs
- Generate probability scores for URL patterns
- Test high-probability candidates

### 11.2 Natural Language Processing

**Why It Works:** NLP can identify feed-related text on pages.

**Approach:**
- Scrape all text from site
- Use NER to find URL entities
- Classify as feed/non-feed

### 11.3 Computer Vision on Screenshots

**Why It Works:** RSS icons may be visible in screenshots but not in HTML.

**Technique:**
```bash
# Use Puppeteer to screenshot
# Run RSS icon detection with OpenCV
```

### 11.4 Clustering Similar Sites

**Why It Works:** Sites in same cluster often share feed patterns.

**Approach:**
- Cluster by technology, content, design
- Propagate known feed patterns within clusters

---

## Category 12: Protocol-Level Discovery

### 12.1 WebSub (PubSubHubbub) Hubs

**Why It Works:** Sites using WebSub register with hub services.

**Check:**
```
https://pubsubhubbub.appspot.com/
https://superfeedr.com/
```

### 12.2 Salmon Protocol

**Why It Works:** Used for distributed comments, may reveal feed endpoints.

### 12.3 ActivityPub Endpoints

**Why It Works:** Fediverse-compatible sites expose ActivityPub feeds.

**Check:**
```bash
curl -sI https://example.com/.well-known/webfinger
curl -s https://example.com/users/admin | grep -i "activitypub"
```

### 12.4 Microformats Discovery

**Why It Works:** h-feed, h-entry microformats indicate feed-like content.

**Check:**
```bash
curl -s https://example.com | grep -i "h-feed\|h-entry\|h-card"
```

### 12.5 JSON Feed Format

**Why It Works:** Some sites use JSON Feed instead of RSS/Atom.

**Check:**
```
https://example.com/feed.json
https://example.com/jsonfeed
```

### 12.6 Webmention Endpoints

**Why It Works:** Sites with Webmention may have feeds for mentions.

**Check:**
```bash
curl -s https://example.com | grep -i "webmention"
curl -s https://example.com/webmention | grep -i "feed"
```

### 12.7 IndieAuth Discovery

**Why It Works:** IndieWeb sites often have feeds.

**Check:**
```bash
curl -s https://example.com | grep -i "indieauth\|micropub"
```

---

## Category 13: Accessibility & Alternative Formats

### 13.1 Accessibility Statement

**Why It Works:** May mention alternative content formats including feeds.

**Check:**
```
https://example.com/accessibility
```

### 13.2 Print Stylesheet Analysis

**Why It Works:** Print CSS may reference feed URLs for "print this feed" functionality.

**Check:**
```bash
curl -s https://example.com/print.css | grep -i feed
```

### 13.3 AMP (Accelerated Mobile Pages)

**Why It Works:** AMP pages may have separate feed endpoints.

**Check:**
```bash
curl -s https://example.com | grep -i "amphtml"
curl -s https://example.com/amp/feed.xml
```

### 13.4 Reader View Compatibility

**Why It Works:** Firefox/Safari reader view may detect feed-like content structure.

---

## Category 14: Legal & Compliance

### 14.1 Terms of Service

**Why It Works:** ToS may mention feed usage policies, revealing existence.

**Check:**
```
https://example.com/terms
https://example.com/legal
```

### 14.2 API Documentation

**Why It Works:** API docs may reference RSS/Atom endpoints.

**Check:**
```
https://example.com/api/docs
https://example.com/developers
https://example.com/docs/api
```

### 14.3 Privacy Policy

**Why It Works:** May mention data collection from feed subscribers.

**Check:**
```
https://example.com/privacy
```

### 14.4 Cookie Policy

**Why It Works:** Feed subscriptions may set cookies.

**Check:**
```
https://example.com/cookies
```

### 14.5 DMCA/Copyright Notices

**Why It Works:** May reference feed content distribution.

**Check:**
```
https://example.com/copyright
https://example.com/dmca
```

---

## Category 15: Physical & Offline

### 15.1 QR Codes on Site

**Why It Works:** QR codes may link to feed subscription pages.

**Technique:**
- Screenshot pages with QR codes
- Decode with zbarimg or online tools

### 15.2 Printed Materials

**Why It Works:** Business cards, brochures may have feed URLs.

### 15.3 Business Listings

**Why It Works:** Google My Business, Yelp may list feed URLs.

**Check:**
```
https://www.google.com/business/
https://www.yelp.com/biz/
```

---

## Category 16: Email & Communication

### 16.1 Email Header Analysis

**Why It Works:** Newsletters may include "View in RSS" links.

**Technique:**
- Subscribe to newsletter
- Check email headers and body for feed links

### 16.2 Email Template Source

**Why It Works:** Email templates may reference feed endpoints.

**Check:**
```bash
# View email source (Gmail: Show Original)
# Search for feed URLs
```

### 16.3 Mailchimp/ESP Public Archives

**Why It Works:** Some ESPs archive newsletters with RSS feeds.

**Check:**
```
https://us1.campaign-archive.com/home/?u=USER_ID
https://example.substack.com/feed
```

### 16.4 SMTP Banner Analysis

**Why It Works:** Mail servers may reveal feed-related subdomains.

**Technique:**
```bash
dig example.com MX
# Check mail server banners
```

---

## Category 17: Advanced Search Techniques

### 17.1 GitHub Code Search

**Why It Works:** Open source projects may have feed configs.

**Queries:**
```
"example.com" + "feed.xml"
"example.com" + "rss"
"example.com" + "atom.xml"
```

### 17.2 Shodan Search

**Why It Works:** Shodan indexes HTTP headers and content.

**Query:**
```
hostname:example.com http.title:"rss"
hostname:example.com http.title:"atom"
```

### 17.3 Censys Search

**Why It Works:** Similar to Shodan, indexes certificates and services.

### 17.4 Common Crawl

**Why It Works:** Web archive with searchable content.

**Check:**
```
https://commoncrawl.org/
```

### 17.5 Archive.org Search

**Why It Works:** Historical captures may have feed links.

**Check:**
```
https://archive.org/advancedsearch.php
```

### 17.6 Pastebin/Dpaste Mining

**Why It Works:** Developers may paste configs with feed URLs.

**Search:**
```
https://pastebin.com/search?query=example.com+feed
```

---

## Category 18: Social Engineering (Ethical)

### 18.1 Contact Form Inquiry

**Why It Works:** Simply asking may reveal feeds.

### 18.2 Support Ticket Analysis

**Why It Works:** Public support forums may have feed-related questions.

**Check:**
```
https://support.example.com/search?q=rss
https://help.example.com/search?q=feed
```

### 18.3 Community Forums

**Why It Works:** Users may discuss feed subscriptions.

**Check:**
```
https://forum.example.com/search?q=rss
https://reddit.com/r/example/search?q=feed
```

### 18.4 Twitter/X Search

**Why It Works:** Users may share feed URLs.

**Search:**
```
site:example.com rss OR feed OR atom
from:example_support rss
```

### 18.5 LinkedIn Company Page

**Why It Works:** Company updates may link to blog feeds.

**Check:**
```
https://www.linkedin.com/company/example
```

---

## Category 19: Browser & Extension Data

### 19.1 Chrome Web Store Extensions

**Why It Works:** RSS extensions may have example URLs.

**Check:**
```
https://chrome.google.com/webstore/search/rss
```

### 19.2 Firefox Add-ons

**Why It Works:** Similar to Chrome.

### 19.3 Browser Sync Data

**Why It Works:** Synced bookmarks may include feed URLs.

### 19.4 DevTools Network Tab History

**Why It Works:** Previous sessions may have loaded feeds.

---

## Category 20: Exotic & Experimental

### 20.1 IPFS/Distributed Web

**Why It Works:** Sites on IPFS may have different feed endpoints.

**Check:**
```
ipfs://example.com/feed.xml
```

### 20.2 Tor Hidden Services

**Why It Works:** .onion versions may have separate feeds.

**Check:**
```
http://example.onion/feed.xml
```

### 20.3 Gemini Protocol

**Why It Works:** Some sites have Gemini feeds.

**Check:**
```
gemini://example.com/feed.gmi
```

### 20.4 Nostr Protocol

**Why It Works:** Decentralized social may have feed references.

### 20.5 Matrix/Chat Bridges

**Why It Works:** Matrix rooms may bridge RSS feeds.

**Check:**
```
https://matrix.to/#/#example:matrix.org
```

### 20.6 Blockchain/Smart Contracts

**Why It Works:** Some projects store feed URLs in contracts.

**Check:**
```
Etherscan contract data for domain-related contracts
```

### 20.7 DNS over HTTPS (DoH) Policies

**Why It Works:** DoH configuration may reference feed endpoints.

### 20.8 WebRTC Data Channels

**Why It Works:** P2P connections may exchange feed URLs.

---

## Master Checklist

```
□ robots.txt
□ sitemap.xml
□ HTTP Link headers
□ CMS detection
□ .well-known URIs
□ API endpoints
□ Search operators
□ Wayback Machine
□ Newsletter services
□ JSON-LD/structured data
□ Subdomain enumeration
□ Linked resources (CSS/JS)
□ Third-party aggregators
□ Social media profiles
□ About/Press pages
□ Content-Type probing
□ Source maps
□ Service workers
□ DNS TXT records
□ Preconnect/prefetch hints
□ CDN cache paths
□ WebAssembly modules
□ CSS content properties
□ SVG embedded links
□ Web app manifest
□ OpenSearch description
□ HTML comments
□ Data URIs
□ JS string literals
□ Template literals
□ Feedly/Inoreader APIs
□ IFTTT/Zapier
□ Social platform oEmbed
□ Podcast directories
□ Feedspot/RSSMicro
□ GitHub/GitLab repos
□ NPM dependencies
□ Docker images
□ CI/CD pipelines
□ Environment configs
□ Build directories
□ TypeScript definitions
□ GraphQL schemas
□ Google Analytics
□ A/B testing configs
□ Search autocomplete
□ Mobile deep links
□ App store metadata
□ APK/IPA analysis
□ Push notification configs
□ 404 page analysis
□ Error message mining
□ Rate limit headers
□ Redirect chains
□ HTTP OPTIONS
□ CORS preflight
□ HTTP Range requests
□ Alternate language feeds
□ Country-specific domains
□ hreflang analysis
□ IDN domain variants
□ Time-based feeds
□ Versioned APIs
□ Git commit history
□ Database dumps
□ Competitor analysis
□ Industry patterns
□ Tech stack inference
□ Hosting provider patterns
□ SSL CT logs
□ WHOIS history
□ URL pattern prediction (ML)
□ NLP classification
□ Computer vision (RSS icons)
□ Site clustering
□ WebSub hubs
□ Salmon protocol
□ ActivityPub endpoints
□ Microformats
□ JSON Feed format
□ Webmention endpoints
□ IndieAuth discovery
□ Accessibility statements
□ Print stylesheets
□ AMP pages
□ Reader view compatibility
□ Terms of Service
□ API documentation
□ Privacy policy
□ Cookie policy
□ DMCA notices
□ QR codes
□ Printed materials
□ Business listings
□ Email headers
□ Email template source
□ ESP public archives
□ SMTP banners
□ GitHub code search
□ Shodan/Censys
□ Common Crawl
□ Archive.org
□ Pastebin mining
□ Contact forms
□ Support tickets
□ Community forums
□ Twitter/X search
□ LinkedIn company pages
□ Browser extensions
□ IPFS/distributed web
□ Tor hidden services
□ Gemini protocol
□ Nostr protocol
□ Matrix bridges
□ Blockchain contracts
```

---

## Final Notes

- **Combine methods:** No single method finds all feeds; use multiple approaches
- **Automate:** Script repetitive checks
- **Respect boundaries:** Don't abuse rate limits or access controls
- **Verify:** Always validate discovered feeds are properly formatted
- **Document:** Keep track of which methods work for which sites
- **Stay updated:** New platforms and patterns emerge regularly

---

## Tool Recommendations

```bash
# General purpose
curl, wget, httpie

# DNS
dig, nslookup, dnsrecon, subfinder

# Content analysis
grep, ripgrep, jq, xmllint

# Browser automation
puppeteer, playwright, selenium

# Network analysis
nmap, masscan, httpx

# OSINT
theHarvester, maltego, recon-ng

# Feed validation
feedvalidator.org, validator.w3.org/feed
```

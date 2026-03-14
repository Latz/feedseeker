# Finding YouTube Channel RSS Feeds

## Overview

YouTube provides official RSS/Atom feeds for channels, but they're not linked from the website. This document describes strategies to discover and construct YouTube feed URLs.

---

## Official Feed URL Patterns

YouTube supports **three** official feed URL formats:

### 1. By Channel ID (Recommended)
```
https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
```

**Example:**
```
https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw
```

### 2. By Username (Legacy)
```
https://www.youtube.com/feeds/videos.xml?user=USERNAME
```

**Example:**
```
https://www.youtube.com/feeds/videos.xml?user=YouTube
```

### 3. By Channel URL (Redirect Method)
```
https://www.youtube.com/feeds/videos.xml?channel_url=CHANNEL_URL
```

---

## Strategy 1: Extract Channel ID from Page Source

### Steps:

1. **Visit the channel page** (e.g., `https://www.youtube.com/@ChannelName`)

2. **View page source** (`Ctrl+U` or right-click → "View Page Source")

3. **Search for** one of these patterns:
   - `channel_id=` 
   - `UC` followed by 22 alphanumeric characters
   - `<link rel="canonical" href="https://www.youtube.com/channel/CHANNEL_ID">`

4. **Construct the feed URL** using the Channel ID

### Example:
```html
<!-- In page source, find: -->
<link rel="canonical" href="https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw">

<!-- Feed URL becomes: -->
https://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw
```

---

## Strategy 2: Check robots.txt

YouTube's `robots.txt` reveals the feed endpoint:

```bash
curl https://www.youtube.com/robots.txt
```

Look for:
```
Disallow: /feeds/videos.xml
```

This confirms the feed path exists but is blocked from crawling.

---

## Strategy 3: Use the YouTube Handle (@username)

For channels with handles (e.g., `@YouTube`):

1. **Resolve handle to channel ID** via the page source or API
2. **Use the channel ID** in the feed URL

Or try the username format directly:
```
https://www.youtube.com/feeds/videos.xml?user=YouTube
```

---

## Strategy 4: Browser Developer Tools

1. **Open DevTools** (`F12`)
2. **Go to Network tab**
3. **Refresh the channel page**
4. **Filter by "feed" or "xml"**
5. **Look for requests** to `/feeds/videos.xml`

---

## Strategy 5: Third-Party Tools

### YouTube Data API
```bash
curl "https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=USERNAME&key=YOUR_API_KEY"
```

### RSS-Bridge
Services like RSS-Bridge can generate YouTube feeds:
```
https://rss-bridge.org/bridge.php?bridge=Youtube&username=CHANNEL_NAME&format=RSS
```

---

## Feed Format

YouTube feeds are **Atom 1.0** format:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" 
      xmlns:media="http://search.yahoo.com/mrss/" 
      xmlns="http://www.w3.org/2005/Atom">
  <link rel="self" href="http://www.youtube.com/feeds/videos.xml?channel_id=UC_x5XG1OV2P6uZZ5FSM9Ttw"/>
  <id>yt:channel:_x5XG1OV2P6uZZ5FSM9Ttw</id>
  <yt:channelId>_x5XG1OV2P6uZZ5FSM9Ttw</yt:channelId>
  <title>Channel Name</title>
  <link rel="alternate" href="https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw"/>
  <author>
    <name>Channel Name</name>
    <uri>https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw</uri>
  </author>
  <published>2007-08-23T00:34:43+00:00</published>
  <entry>
    <id>yt:video:VIDEO_ID</id>
    <yt:videoId>VIDEO_ID</yt:videoId>
    <yt:channelId>UC_x5XG1OV2P6uZZ5FSM9Ttw</yt:channelId>
    <title>Video Title</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=VIDEO_ID"/>
    <author>
      <name>Channel Name</name>
      <uri>https://www.youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw</uri>
    </author>
    <published>2024-01-15T10:00:00+00:00</published>
    <updated>2024-01-15T10:00:00+00:00</updated>
    <media:group>
      <media:title>Video Title</media:title>
      <media:content url="https://www.youtube.com/v/VIDEO_ID?version=3" type="application/x-shockwave-flash" width="640" height="390"/>
      <media:thumbnail url="https://i4.ytimg.com/vi/VIDEO_ID/hqdefault.jpg" height="360" width="480"/>
      <media:description>Video description...</media:description>
    </media:group>
  </entry>
</feed>
```

---

## Quick Reference

| Method | URL Pattern | Reliability |
|--------|-------------|-------------|
| Channel ID | `https://youtube.com/feeds/videos.xml?channel_id=UC...` | ⭐⭐⭐⭐⭐ |
| Username | `https://youtube.com/feeds/videos.xml?user=NAME` | ⭐⭐⭐ (legacy) |
| RSS-Bridge | Varies by instance | ⭐⭐⭐⭐ |

---

## Common Channel ID Patterns

Channel IDs always start with `UC` followed by 22 characters:
- `UC` + 22 alphanumeric characters (base64-like)
- Example: `UC_x5XG1OV2P6uZZ5FSM9Ttw`

---

## Troubleshooting

### Feed returns 400 Bad Request
- Channel ID may be incorrect
- Try extracting from page source again

### Feed is empty
- Channel may have no public videos
- Channel may be private or deleted

### Rate limiting
- YouTube may rate-limit frequent requests
- Consider caching feed results

---

## Automation Script Example

```bash
#!/bin/bash
# Extract Channel ID from YouTube page and test feed

CHANNEL_URL="$1"
CHANNEL_ID=$(curl -s "$CHANNEL_URL" | grep -oP 'channel_id=UC[a-zA-Z0-9_-]{22}' | head -1 | cut -d= -f2)

if [ -z "$CHANNEL_ID" ]; then
    echo "Could not extract Channel ID"
    exit 1
fi

FEED_URL="https://www.youtube.com/feeds/videos.xml?channel_id=$CHANNEL_ID"
echo "Feed URL: $FEED_URL"
curl -I "$FEED_URL"
```

---

## Notes

- YouTube feeds are **Atom**, not RSS 2.0
- Feeds include the **15 most recent videos**
- All official YouTube feeds use the `/feeds/videos.xml` endpoint
- Feed-seeker may miss these because the homepage doesn't link to them

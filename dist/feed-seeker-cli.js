#!/usr/bin/env node
import { Command as Y, Option as J } from "commander";
import { parseHTML as M } from "linkedom";
import k from "tldts";
import B from "async";
import { styleText as u } from "node:util";
async function I(r, e = {}) {
  let t, s;
  if (typeof e == "number")
    t = e, s = {};
  else {
    const { timeout: a = 5e3, ...d } = e;
    t = a, s = d;
  }
  try {
    const a = new URL(r);
    if (!["http:", "https:"].includes(a.protocol))
      throw new Error(`Invalid URL protocol: ${a.protocol}. Only http: and https: are allowed.`);
  } catch (a) {
    throw a instanceof TypeError ? new Error(`Invalid URL: ${r}`) : a;
  }
  if (t <= 0)
    throw new Error(`Invalid timeout: ${t}. Timeout must be a positive number.`);
  if (!Number.isFinite(t))
    throw new Error(`Invalid timeout: ${t}. Timeout must be a finite number.`);
  const o = new AbortController(), i = setTimeout(() => o.abort(), t), l = {
    ...{
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Cache-Control": "max-age=0"
    },
    ...s.headers || {}
  };
  try {
    const a = await fetch(r, {
      ...s,
      signal: o.signal,
      headers: l
    });
    return clearTimeout(i), a;
  } catch (a) {
    throw clearTimeout(i), a instanceof Error && a.name === "AbortError" ? new Error(`Request to ${r} timed out after ${t}ms`) : a;
  }
}
const p = {
  MAX_CONTENT_SIZE: 10 * 1024 * 1024,
  // 10MB maximum content size
  DEFAULT_TIMEOUT: 5,
  // Default timeout in seconds
  MAX_TIMEOUT: 60,
  // Maximum timeout in seconds (60 seconds)
  MIN_TIMEOUT: 1
  // Minimum timeout in seconds
}, C = {
  TYPES: ["rich", "video", "photo", "link"],
  VERSIONS: ["1.0", "2.0"],
  URL_PATTERNS: ["/wp-json/oembed/", "/oembed"]
}, f = {
  // CDATA processing - matches XML CDATA sections: <![CDATA[content]]>
  // Used to extract clean text content from feeds that wrap content in CDATA
  CDATA: /<!\[CDATA\[(.*?)\]\]>/g,
  // RSS feed detection patterns
  RSS: {
    // Matches RSS root element with version attribute: <rss version="2.0">
    // [^>]* matches any attributes before version, \s+ ensures whitespace before version
    VERSION: /<rss[^>]*\s+version\s*=\s*["'][\d.]+["'][^>]*>/i,
    // Matches RSS channel opening tag (required container for RSS content)
    CHANNEL: /<channel[^>]*>/i,
    // Matches RSS item opening tag (individual feed entries)
    ITEM: /<item[^>]*>/i,
    // Matches RSS description opening tag (content description)
    DESCRIPTION: /<description[^>]*>/i,
    // Matches RSS channel closing tag
    CHANNEL_END: /<\/channel>/i,
    // Captures entire channel content between opening and closing tags
    // [\s\S]*? uses non-greedy matching to capture everything including newlines
    CHANNEL_CONTENT: /<channel>([\s\S]*?)<\/channel>/i,
    // Captures title content between title tags (feed or item title)
    TITLE: /<title>([\s\S]*?)<\/title>/i
  },
  // Atom feed detection patterns
  ATOM: {
    // Matches Atom feed opening tag with optional attributes: <feed ...>
    // (?:\s+[^>]*)? is a non-capturing group for optional attributes
    FEED_START: /<feed(?:\s+[^>]*)?>/i,
    // Matches Atom namespace declaration: xmlns="...atom..." or xmlns:atom="..."
    // These patterns ensure the feed uses the Atom XML namespace
    NAMESPACE_XMLNS: /<feed[^>]*xmlns[^>]*atom/i,
    NAMESPACE_XMLNS_ATOM: /<feed[^>]*xmlns:atom/i,
    NAMESPACE_ATOM_PREFIX: /<feed[^>]*atom:/i,
    // Matches Atom entry opening tag (individual feed entries)
    ENTRY: /<entry[^>]*>/i,
    // Matches Atom title opening tag
    TITLE_TAG: /<title[^>]*>/i,
    // Captures title content between title tags
    TITLE_CONTENT: /<title>([\s\S]*?)<\/title>/i
  }
};
function G(r) {
  let e;
  try {
    e = new URL(r);
  } catch {
    throw new Error(`Invalid URL: ${r}`);
  }
  if (!["http:", "https:"].includes(e.protocol))
    throw new Error(
      `Invalid protocol: ${e.protocol}. Only http: and https: protocols are allowed.`
    );
}
function K(r) {
  if (r.length > p.MAX_CONTENT_SIZE)
    throw new Error(
      `Content too large: ${r.length} bytes. Maximum allowed: ${p.MAX_CONTENT_SIZE} bytes.`
    );
}
function Q(r) {
  return r == null ? p.DEFAULT_TIMEOUT : !Number.isFinite(r) || r < p.MIN_TIMEOUT ? (console.warn(
    `Invalid timeout value ${r}. Using minimum: ${p.MIN_TIMEOUT} seconds.`
  ), p.MIN_TIMEOUT) : r > p.MAX_TIMEOUT ? (console.warn(
    `Timeout value ${r} exceeds maximum. Clamping to ${p.MAX_TIMEOUT} seconds.`
  ), p.MAX_TIMEOUT) : Math.floor(r);
}
function Z(r) {
  return C.URL_PATTERNS.some((e) => r.includes(e));
}
function ee(r) {
  return !!(r.type && C.TYPES.includes(r.type) && C.VERSIONS.includes(r.version) || r.type && r.version && r.html);
}
function F(r) {
  return r.replace(f.CDATA, "$1");
}
function x(r) {
  return r ? r.replace(/\s+/g, " ").trim() : null;
}
async function E(r, e = "", t) {
  if (G(r), Z(r))
    return null;
  if (!e) {
    if (!t)
      throw new Error("Instance parameter is required when content is not provided");
    const i = Q(t.options.timeout) * 1e3, n = await I(r, i);
    if (!n.ok)
      throw new Error(`Failed to fetch ${r}: ${n.status} ${n.statusText}`);
    e = await n.text();
  }
  return K(e), re(e) || se(e) || oe(e) || null;
}
function te(r) {
  const e = f.RSS.CHANNEL_CONTENT.exec(r);
  if (e) {
    const o = e[1], i = f.RSS.TITLE.exec(o);
    return i ? x(F(i[1])) : null;
  }
  const t = f.RSS.TITLE.exec(r);
  return t ? x(F(t[1])) : null;
}
function re(r) {
  if (f.RSS.VERSION.test(r)) {
    const e = f.RSS.CHANNEL.test(r), t = f.RSS.ITEM.test(r), s = f.RSS.DESCRIPTION.test(r);
    if (e && s && (t || f.RSS.CHANNEL_END.test(r)))
      return { type: "rss", title: te(r) };
  }
  return null;
}
function se(r) {
  const e = f.ATOM.NAMESPACE_XMLNS.test(r) || f.ATOM.NAMESPACE_XMLNS_ATOM.test(r) || f.ATOM.NAMESPACE_ATOM_PREFIX.test(r);
  if (f.ATOM.FEED_START.test(r) && e) {
    const t = f.ATOM.ENTRY.test(r), s = f.ATOM.TITLE_TAG.test(r);
    if (t && s) {
      const o = f.ATOM.TITLE_CONTENT.exec(r);
      return { type: "atom", title: o ? x(F(o[1])) : null };
    }
  }
  return null;
}
function oe(r) {
  try {
    const e = JSON.parse(r);
    if (ee(e))
      return null;
    if (e.version && typeof e.version == "string" && e.version.includes("jsonfeed") || e.items && Array.isArray(e.items) || e.feed_url) {
      const t = e.title || e.name || null;
      return { type: "json", title: typeof t == "string" ? x(t) : null };
    }
    return null;
  } catch {
    return null;
  }
}
const ie = ["feed+json", "rss+xml", "atom+xml", "xml", "rdf+xml"], ne = ["/rss", "/feed", "/atom", ".rss", ".atom", ".xml", ".json"];
function ae(r) {
  return r ? r.replace(/\s+/g, " ").trim() : null;
}
async function L(r, e, t, s, o = 5) {
  const i = e.options?.maxFeeds || 0;
  for (let n = 0; n < r.length; n += o) {
    if (i > 0 && t.length >= i)
      return !0;
    const l = r.slice(n, n + o);
    if ((await Promise.allSettled(
      l.map((c) => le(c, e, t, s))
    )).some(
      (c) => c.status === "fulfilled" && c.value === !0
    ))
      return !0;
  }
  return !1;
}
async function le(r, e, t, s) {
  const o = e.options?.maxFeeds || 0;
  if (!r.href) return !1;
  let i;
  try {
    i = new URL(r.href, e.site).href;
  } catch (n) {
    if (e.options?.showErrors) {
      const l = n instanceof Error ? n : new Error(String(n));
      e.emit("error", {
        module: "metalinks",
        error: l.message,
        explanation: `Invalid URL found in meta link: ${r.href}. Unable to construct a valid URL.`,
        suggestion: "Check the meta link href attribute for malformed URLs."
      });
    }
    return !1;
  }
  if (s.has(i)) return !1;
  e.emit("log", { module: "metalinks", message: `Checking feed: ${i}` });
  try {
    const n = await E(i, "", e);
    if (n && (t.push({
      url: i,
      title: ae(r.title),
      type: n.type,
      feedTitle: n.title
    }), s.add(i), o > 0 && t.length >= o))
      return e.emit("log", {
        module: "metalinks",
        message: `Stopped due to reaching maximum feeds limit: ${t.length} feeds found (max ${o} allowed).`
      }), !0;
  } catch (n) {
    if (e.options?.showErrors) {
      const l = n instanceof Error ? n : new Error(String(n));
      e.emit("error", {
        module: "metalinks",
        error: l.message,
        explanation: "An error occurred while trying to fetch and validate a feed URL found in a meta link tag. This could be due to network issues, server problems, or invalid feed content.",
        suggestion: "Check if the meta link URL is accessible and returns valid feed content. The search will continue with other meta links."
      });
    }
  }
  return !1;
}
async function de(r) {
  r.emit("start", { module: "metalinks", niceName: "Meta links" });
  const e = [], t = /* @__PURE__ */ new Set();
  try {
    const s = ie.map((d) => `link[type="application/${d}"]`).join(", "), o = Array.from(r.document.querySelectorAll(s));
    if (await L(o, r, e, t))
      return e;
    const n = Array.from(
      r.document.querySelectorAll('link[rel="alternate"][type*="rss"], link[rel="alternate"][type*="xml"], link[rel="alternate"][type*="atom"], link[rel="alternate"][type*="json"]')
    );
    if (await L(n, r, e, t))
      return e;
    const a = Array.from(
      r.document.querySelectorAll('link[rel="alternate"]')
    ).filter(
      (d) => d.href && ne.some((c) => d.href.toLowerCase().includes(c))
    );
    return await L(a, r, e, t), e;
  } finally {
    r.emit("end", { module: "metalinks", feeds: e });
  }
}
function b(r, e) {
  try {
    return new URL(r, e);
  } catch {
    return null;
  }
}
function ce(r) {
  const e = b(r);
  return e ? e.protocol === "http:" || e.protocol === "https:" : !1;
}
function fe(r) {
  return b(r) ? !1 : !r.includes("://");
}
function z(r, e) {
  const t = b(r);
  if (!t || t.hostname === e.hostname)
    return !0;
  const s = [
    // Google FeedBurner (most common feed hosting service)
    "feedburner.com",
    "feeds.feedburner.com",
    "feedproxy.google.com",
    "feeds2.feedburner.com"
  ];
  return s.includes(t.hostname) || s.some((o) => t.hostname.endsWith("." + o));
}
function he(r) {
  if (r.options.followMetaRefresh && r.document && typeof r.document.querySelector == "function") {
    const e = r.document.querySelector('meta[http-equiv="refresh"]')?.getAttribute("content");
    if (e) {
      const t = e.match(/url=(.*)/i);
      if (t && t[1]) {
        const s = new URL(t[1], r.site).href;
        return r.emit("log", {
          module: "anchors",
          message: `Following meta refresh redirect to ${s}`
        }), X({ ...r, site: s });
      }
    }
  }
  return null;
}
function H(r, e, t) {
  if (!r.href)
    return null;
  if (ce(r.href))
    return r.href;
  if (fe(r.href)) {
    const s = b(r.href, e);
    return s ? s.href : (t.emit("error", {
      module: "anchors",
      error: `Invalid relative URL: ${r.href}`,
      explanation: "A relative URL found in an anchor tag could not be resolved against the base URL. This may be due to malformed relative path syntax.",
      suggestion: 'Check the anchor href attribute for proper relative path format (e.g., "./feed.xml", "../rss.xml", or "/feed").'
    }), null);
  }
  return null;
}
function ue(r) {
  const e = /https?:\/\/[^\s"'<>)]+/gi, t = r.match(e);
  if (!t)
    return [];
  const s = /* @__PURE__ */ new Set();
  for (const o of t) {
    const i = o.replace(/[.,;:!?]+$/, "");
    s.add(i);
  }
  return Array.from(s);
}
async function me(r, e) {
  const { instance: t, baseUrl: s, feedUrls: o } = e, i = H(r, s, t);
  if (i)
    try {
      const n = await E(i, "", t);
      n && o.push({
        url: i,
        title: r.textContent?.trim() || null,
        type: n.type,
        feedTitle: n.title
      });
    } catch (n) {
      if (t.options?.showErrors) {
        const l = n instanceof Error ? n : new Error(String(n));
        t.emit("error", {
          module: "anchors",
          error: `Error checking feed at ${i}: ${l.message}`,
          explanation: "An error occurred while trying to fetch and validate a potential feed URL found in an anchor tag. This could be due to network timeouts, server errors, or invalid feed content.",
          suggestion: "Check if the URL is accessible and returns valid feed content. Network connectivity issues or server problems may cause this error."
        });
      }
    }
}
async function X(r) {
  await he(r);
  const e = new URL(r.site), t = r.document.querySelectorAll("a"), s = [];
  for (const l of t) {
    const a = H(l, e, r);
    a && z(a, e) && s.push(l);
  }
  const o = r.options?.maxFeeds || 0, i = {
    instance: r,
    baseUrl: e,
    feedUrls: []
  };
  let n = 1;
  for (const l of s) {
    if (o > 0 && i.feedUrls.length >= o) {
      r.emit("log", {
        module: "anchors",
        message: `Stopped due to reaching maximum feeds limit: ${i.feedUrls.length} feeds found (max ${o} allowed).`
      });
      break;
    }
    r.emit("log", { module: "anchors", totalCount: n++, totalEndpoints: s.length }), await me(l, i);
  }
  if (o === 0 || i.feedUrls.length < o) {
    const l = r.document.body?.innerHTML || "", a = ue(l), d = new Set(i.feedUrls.map((h) => h.url)), c = [];
    for (const h of a)
      !d.has(h) && z(h, e) && (c.push(h), d.add(h));
    for (const h of c) {
      if (o > 0 && i.feedUrls.length >= o) {
        r.emit("log", {
          module: "anchors",
          message: `Stopped due to reaching maximum feeds limit: ${i.feedUrls.length} feeds found (max ${o} allowed).`
        });
        break;
      }
      r.emit("log", {
        module: "anchors",
        totalCount: n++,
        totalEndpoints: s.length + c.length
      });
      try {
        const m = await E(h, "", r);
        m && i.feedUrls.push({
          url: h,
          title: null,
          // Plain-text URLs don't have anchor text
          type: m.type,
          feedTitle: m.title
        });
      } catch (m) {
        if (r.options?.showErrors) {
          const T = m instanceof Error ? m : new Error(String(m));
          r.emit("error", {
            module: "anchors",
            error: `Error checking feed at ${h}: ${T.message}`,
            explanation: "An error occurred while trying to fetch and validate a potential feed URL found in page text. This could be due to network timeouts, server errors, or invalid feed content.",
            suggestion: "Check if the URL is accessible and returns valid feed content. Network connectivity issues or server problems may cause this error."
          });
        }
      }
    }
  }
  return i.feedUrls;
}
async function pe(r) {
  r.emit("start", {
    module: "anchors",
    niceName: "Check all anchors"
  });
  const e = await X(r);
  return r.emit("end", { module: "anchors", feeds: e }), e;
}
const ge = 0, A = 0, we = 3, v = "standard", W = 2083, U = 10, $ = 1, P = 1e4, R = 6e4, S = [
  // Most common standard paths (highest success rate)
  "feed",
  "rss",
  "atom",
  "feed.xml",
  "rss.xml",
  "atom.xml",
  "index.xml",
  "feeds",
  ".rss",
  ".atom",
  ".xml",
  // WordPress (extremely common CMS)
  "?feed=rss2",
  "?feed=atom",
  "feed/rss/",
  "feed/atom/",
  // Blog platforms
  "blog/feed",
  "blog/rss",
  // Common variations
  "feed.json",
  "rss.php",
  "feed.php",
  "news/rss",
  "latest/feed",
  // Query parameters
  "?format=rss",
  "?format=feed"
], N = [
  // Extended standard paths
  "rssfeed.xml",
  "feed.rss",
  "feed.atom",
  "feeds/",
  "rss/",
  "index.rss",
  "index.atom",
  "rss/index.xml",
  "atom/index.xml",
  "syndication/",
  "rssfeed.rdf",
  "&_rss=1",
  // Blog platforms
  "blog/atom",
  "blog/feeds",
  "blog?format=rss",
  "blog-feed.xml",
  "weblog/atom",
  "weblog/rss",
  // WordPress extended
  "?format=feed",
  "feed/rdf/",
  "feed/rss2/",
  "wp-atom.php",
  "wp-feed.php",
  "wp-rdf.php",
  "wp-rss.php",
  "wp-rss2.php",
  "index.php?format=feed",
  // News and articles
  "articles/feed",
  "atom/news/",
  "latest.rss",
  "news.xml",
  "news/atom",
  "rss/articles/",
  "rss/latest/",
  "rss/news/",
  "rss/news/rss.xml",
  "rss/rss.php",
  // API style
  "api/feed",
  "api/rss",
  "api/atom",
  "api/rss.xml",
  "api/feed.xml",
  "api/v1/feed",
  "api/v2/feed",
  "v1/feed",
  "v2/feed",
  // CMS and frameworks
  "feed.aspx",
  "rss.aspx",
  "rss.cfm",
  "feed.jsp",
  "feed.pl",
  "feed.py",
  "feed.rb",
  "feed/atom",
  "feed/rdf",
  "feed/atom.rss",
  "feed/atom.xml",
  "feed/rss.xml",
  "feed/rss2",
  "posts.rss",
  // Static site generators
  "_site/feed.xml",
  "build/feed.xml",
  "dist/feed.xml",
  "out/feed.xml",
  // Query parameters
  "?atom=1",
  "?rss=1",
  "?feed=atom",
  "?feed=rss",
  "?format=atom",
  "?output=rss",
  "?output=atom",
  "?type=rss",
  "?type=atom",
  "?view=feed",
  "?view=rss"
], ye = [
  // Custom and alternative paths
  "atomfeed",
  "jsonfeed",
  "newsfeed",
  "rssfeed",
  "feeds.json",
  "feeds.php",
  "feeds.xml",
  ".json",
  ".opml",
  ".rdf",
  "opml",
  "opml/",
  "rdf",
  "rdf/",
  // Additional modern formats
  "feed.cml",
  "feed.csv",
  "feed.txt",
  "feed.yaml",
  "feed.yml",
  // Complex query parameters
  "?download=atom",
  "?download=rss",
  "?export=atom",
  "?export=rss",
  "?syndicate=atom",
  "?syndicate=rss",
  // Specialized CMS paths
  "export/rss.xml",
  "extern.php?action=feed&type=atom",
  "external?type=rss2",
  "index.php?action=.xml;type=rss",
  "public/feed.xml",
  "spip.php?page=backend",
  "spip.php?page=backend-breve",
  "spip.php?page=backend-sites",
  "syndicate/rss.xml",
  "syndication.php",
  "xml",
  "sitenews",
  "api/mobile/feed",
  // E-commerce and product feeds
  "catalog.xml",
  // product catalogs
  "catalog/feed",
  "deals.xml",
  // deal/sale feeds
  "deals/feed",
  "inventory.rss",
  // inventory updates
  "inventory/feed",
  "products.rss",
  // product feeds
  "products/atom",
  "products/rss",
  "promotions/feed",
  "specials/feed",
  // Podcast and media feeds
  "audio/feed",
  "episodes.rss",
  // episodic content
  "episodes/feed",
  "gallery.rss",
  // image galleries
  "media/feed",
  "podcast.rss",
  // audio content
  "podcast/atom",
  "podcast/rss",
  "podcasts/feed",
  "shows/feed",
  "video/feed",
  "videos.rss",
  // video content
  // Social media and community feeds
  "comments/feed",
  "community/feed",
  "discussions/feed",
  "forum.rss",
  // forum posts
  "forum/atom",
  "forum/rss",
  "reviews/feed",
  // Event and calendar feeds
  "agenda/feed",
  "calendar/feed",
  "events.rss",
  // calendar events
  "events/feed",
  "schedule/feed",
  // Job and career feeds
  "careers/feed",
  "jobs.rss",
  // job listings
  "jobs/feed",
  "opportunities/feed",
  "vacancies/feed",
  // Content management systems
  "content/feed",
  "documents/feed",
  "pages/feed",
  "resources/feed",
  // Newsletter and email feeds
  "emails/feed",
  "mailinglist/feed",
  "newsletter/feed",
  "subscription/feed",
  // Category and tag feeds
  "category/*/feed",
  "tag/*/feed",
  "tags/feed",
  "topics/feed",
  // User and author feeds
  "author/*/feed",
  "profile/*/feed",
  "user/*/feed",
  // Time-based feeds
  "archive/feed",
  "daily/feed",
  "monthly/feed",
  "weekly/feed",
  "yearly/feed",
  // Specialized content feeds
  "announcements/feed",
  "changelog/feed",
  "press/feed",
  "updates/feed",
  "revisions/feed",
  // Mobile and app feeds
  "app/feed",
  "mobile/feed",
  // Regional and local feeds
  "international/feed",
  "local/feed",
  "national/feed",
  "regional/feed",
  // Industry specific feeds
  "education/feed",
  "entertainment/feed",
  "finance/feed",
  "health/feed",
  "industry/feed",
  "market/feed",
  "science/feed",
  "sector/feed",
  "sports/feed",
  "technology/feed",
  // Aggregation and compilation feeds
  "aggregate/feed",
  "all/feed",
  "combined/feed",
  "compilation/feed",
  "everything/feed",
  // International variations
  "actualites/feed",
  "nachrichten/feed",
  "nieuws/feed",
  "noticias/feed",
  "novosti/feed",
  // Headless CMS feeds
  "cms/feed",
  "contentful/feed",
  "sanity/feed",
  "strapi/feed",
  // Documentation feeds
  "docs/feed",
  "documentation/feed",
  "help/feed",
  "kb/feed",
  "support/feed",
  "wiki/feed",
  // Repository and code feeds
  "branches/feed",
  "commits/feed",
  "issues/feed",
  "pull-requests/feed",
  "releases/feed",
  "tags/feed",
  // Analytics and tracking feeds
  "analytics/feed",
  "metrics/feed",
  "reports/feed",
  "stats/feed",
  // Multi-language feeds
  "de/feed",
  "en/feed",
  "es/feed",
  "fr/feed",
  "it/feed",
  "ja/feed",
  "ko/feed",
  "pt/feed",
  "ru/feed",
  "zh/feed",
  // Specialized platforms
  "drupal/feed",
  "joomla/feed",
  "magento/feed",
  "opencart/feed",
  "prestashop/feed",
  "shopify/feed",
  "typo3/feed",
  "woocommerce/feed",
  // Social and community platforms
  "discourse/feed",
  "invision/feed",
  "phpbb/feed",
  "vbulletin/feed",
  "xenforo/feed"
];
function Ee(r) {
  switch (r) {
    case "fast":
      return S;
    case "standard":
      return [...S, ...N];
    case "exhaustive":
    case "full":
      return [...S, ...N, ...ye];
    default:
      return [...S, ...N];
  }
}
function Se(r) {
  return r ? ["fast", "standard", "exhaustive", "full"].includes(r) ? r : (console.warn(`Invalid search mode "${r}". Falling back to "${v}".`), v) : v;
}
function _e(r) {
  return r == null ? we : !Number.isFinite(r) || r < $ ? (console.warn(`Invalid concurrency value ${r}. Using minimum: ${$}.`), $) : r > U ? (console.warn(
    `Concurrency value ${r} exceeds maximum. Clamping to ${U}.`
  ), U) : Math.floor(r);
}
function xe(r) {
  return r == null ? A : !Number.isFinite(r) || r < 0 ? (console.warn(`Invalid request delay ${r}. Using default: ${A}.`), A) : r > R ? (console.warn(`Request delay ${r}ms exceeds maximum. Clamping to ${R}ms.`), R) : Math.floor(r);
}
function q(r) {
  return r.length <= W;
}
function be(r, e, t) {
  let s;
  try {
    s = new URL(r);
  } catch {
    throw new Error(`Invalid URL provided to blindSearch: ${r}`);
  }
  if (!q(r))
    throw new Error(
      `URL too long (${r.length} chars). Maximum allowed: ${W} characters.`
    );
  if (!["http:", "https:"].includes(s.protocol))
    throw new Error(`Invalid protocol "${s.protocol}". Only http: and https: are allowed.`);
  const o = s.origin;
  let i = r;
  const n = [];
  let l = "";
  for (e && (l = s.search); i.length >= o.length; ) {
    const a = i.endsWith("/") ? i.slice(0, -1) : i;
    for (const d of t) {
      if (n.length >= P)
        return console.warn(
          `URL generation limit reached (${P} URLs). Stopping to prevent resource exhaustion.`
        ), n;
      const c = l ? `${a}/${d}${l}` : `${a}/${d}`;
      q(c) ? n.push(c) : console.warn(`Skipping URL (too long): ${c.substring(0, 100)}...`);
    }
    i = i.slice(0, i.lastIndexOf("/"));
  }
  return n;
}
function Te(r, e, t, s, o) {
  return r.type === "rss" ? s = !0 : r.type === "atom" && (o = !0), t.push({
    url: e,
    title: null,
    // No link element title in blind search (unlike metaLinks)
    type: r.type,
    feedTitle: r.title
    // Actual feed title from parsing the feed
  }), { rssFound: s, atomFound: o };
}
function ke(r, e, t, s, o) {
  return r >= e ? !1 : o ? !0 : !(t && s);
}
async function Le(r, e) {
  const t = Se(r.options?.searchMode), s = Ee(t), o = be(
    r.site,
    r.options?.keepQueryParams || !1,
    s
  );
  r.emit("start", {
    module: "blindsearch",
    niceName: "Blind search",
    endpointUrls: o.length
  });
  const i = r.options?.all || !1, n = r.options?.maxFeeds ?? ge, l = _e(r.options?.concurrency), a = await Ae(
    o,
    i,
    n,
    l,
    r
  );
  return r.emit("end", { module: "blindsearch", feeds: a.feeds }), a.feeds;
}
async function Ae(r, e, t, s, o, i) {
  const n = [], l = /* @__PURE__ */ new Set();
  let a = !1, d = !1, c = 0;
  for (; ke(c, r.length, a, d, e); ) {
    if (t > 0 && n.length >= t) {
      await j(o, n, t);
      break;
    }
    const h = Math.min(s, r.length - c), m = r.slice(c, c + h), T = await Promise.allSettled(
      m.map((g) => ve(g, o, l, n, a, d))
    );
    for (const g of T)
      if (g.status === "fulfilled" && g.value.found && (a = g.value.rssFound, d = g.value.atomFound, t > 0 && n.length >= t)) {
        await j(o, n, t), c = r.length;
        break;
      }
    c += h;
    const V = n.length;
    o.emit("log", {
      module: "blindsearch",
      totalEndpoints: r.length,
      totalCount: c,
      feedsFound: V
    });
    const D = xe(o.options?.requestDelay);
    D > 0 && c < r.length && await new Promise((g) => setTimeout(g, D));
  }
  return { feeds: n, rssFound: a, atomFound: d };
}
async function ve(r, e, t, s, o, i) {
  if (t.has(r))
    return { found: !1, rssFound: o, atomFound: i };
  t.add(r);
  try {
    const n = await E(r, "", e);
    if (n) {
      const l = Te(n, r, s, o, i);
      return o = l.rssFound, i = l.atomFound, { found: !0, rssFound: o, atomFound: i };
    }
  } catch (n) {
    const l = n instanceof Error ? n : new Error(String(n));
    await Ue(e, r, l);
  }
  return { found: !1, rssFound: o, atomFound: i };
}
async function j(r, e, t) {
  r.emit("log", {
    module: "blindsearch",
    message: `Stopped due to reaching maximum feeds limit: ${e.length} feeds found (max ${t} allowed).`
  });
}
async function Ue(r, e, t) {
  r.options?.showErrors && r.emit("error", {
    module: "blindsearch",
    error: `Error fetching ${e}: ${t.message}`,
    explanation: "An error occurred while trying to fetch a potential feed URL during blind search. This could be due to network timeouts, server errors, 404 not found, or invalid content.",
    suggestion: "This is normal during blind search as many URLs are tested. The search will continue with other potential feed endpoints."
  });
}
class y {
  /**
   * Private field storing event listeners using Map and Set for optimal performance
   * @private
   * @type {Map<string, Set<EventListener>>}
   */
  #e = /* @__PURE__ */ new Map();
  /**
   * Maximum number of listeners per event (0 = unlimited)
   * @private
   */
  #t;
  /**
   * Whether to capture async errors
   * @private
   */
  #o;
  /**
   * Default max listeners for all instances
   * @private
   */
  static #i = 10;
  /**
   * Creates a new EventEmitter instance
   * @param {EventEmitterOptions} options - Configuration options
   */
  constructor(e = {}) {
    this.#t = e.maxListeners ?? y.#i, this.#o = e.captureAsyncErrors ?? !0;
  }
  /**
   * Sets the default maximum number of listeners for all new EventEmitter instances
   * @param {number} n - The maximum number of listeners (0 = unlimited)
   */
  static setDefaultMaxListeners(e) {
    if (typeof e != "number" || e < 0 || !Number.isInteger(e))
      throw new TypeError("Max listeners must be a non-negative integer");
    y.#i = e;
  }
  /**
   * Validates event name
   * @private
   */
  #r(e) {
    if (typeof e != "string" || e.trim().length === 0)
      throw new TypeError("Event must be a non-empty string");
  }
  /**
   * Validates listener
   * @private
   */
  #s(e) {
    if (typeof e != "function")
      throw new TypeError("Listener must be a function");
  }
  /**
   * Checks and warns if max listeners exceeded
   * @private
   */
  #n(e) {
    if (this.#t > 0) {
      const t = this.listenerCount(e);
      t > this.#t && console.warn(
        `Warning: Possible EventEmitter memory leak detected. ${t} ${e} listeners added. Use emitter.setMaxListeners() to increase limit`
      );
    }
  }
  /**
   * Converts an error to a string representation
   * Handles Error objects, plain objects with error properties, and other types
   * @private
   */
  #l(e) {
    if (e instanceof Error)
      return e.message;
    if (typeof e == "object" && e !== null) {
      const t = e;
      if (typeof t.error == "string") return t.error;
      if (typeof t.message == "string") return t.message;
      try {
        return JSON.stringify(t);
      } catch {
        return String(e);
      }
    }
    return String(e);
  }
  /**
   * Handles errors from listener execution
   * @private
   */
  #a(e, t) {
    if (t === "error")
      throw console.error("Error in error event listener:", e), e;
    const s = this.#e.get("error");
    if (s && s.size > 0)
      this.emit("error", e, t);
    else
      throw console.error(`Unhandled error in event listener for '${t}':`, e), e;
  }
  /**
   * Adds an event listener for the specified event
   * @param {string} event - The name of the event to listen for
   * @param {EventListener} listener - The function to call when the event is emitted
   * @returns {EventEmitter} The instance for method chaining
   * @throws {TypeError} When event is not a non-empty string or listener is not a function
   * @example
   * emitter.on('data', (payload) => {
   *   console.log('Received data:', payload);
   * });
   */
  on(e, t) {
    this.#r(e), this.#s(t);
    const s = this.#e.get(e);
    return s ? s.add(t) : this.#e.set(e, /* @__PURE__ */ new Set([t])), this.#n(e), this;
  }
  /**
   * Adds an event listener to the beginning of the listeners array
   * @param {string} event - The name of the event to listen for
   * @param {EventListener} listener - The function to call when the event is emitted
   * @returns {EventEmitter} The instance for method chaining
   * @throws {TypeError} When event is not a non-empty string or listener is not a function
   * @example
   * emitter.prependListener('data', (payload) => {
   *   console.log('This runs first');
   * });
   */
  prependListener(e, t) {
    this.#r(e), this.#s(t);
    const s = this.#e.get(e);
    if (!s)
      this.#e.set(e, /* @__PURE__ */ new Set([t]));
    else {
      const o = /* @__PURE__ */ new Set([t, ...s]);
      this.#e.set(e, o);
    }
    return this.#n(e), this;
  }
  /**
   * Adds a one-time event listener for the specified event
   * The listener will be automatically removed after being called once
   * @param {string} event - The name of the event to listen for
   * @param {EventListener} listener - The function to call when the event is emitted (will be removed after first call)
   * @returns {EventEmitter} The instance for method chaining
   * @throws {TypeError} When event is not a non-empty string or listener is not a function
   * @example
   * emitter.once('init', () => {
   *   console.log('This will only run once');
   * });
   *
   * emitter.emit('init'); // Triggers listener
   * emitter.emit('init'); // Does nothing - listener was removed
   */
  once(e, t) {
    this.#r(e), this.#s(t);
    const s = ((...o) => {
      this.off(e, s), t(...o);
    });
    return s.originalListener = t, this.on(e, s);
  }
  /**
   * Adds a one-time event listener to the beginning of the listeners array
   * @param {string} event - The name of the event to listen for
   * @param {EventListener} listener - The function to call when the event is emitted
   * @returns {EventEmitter} The instance for method chaining
   * @throws {TypeError} When event is not a non-empty string or listener is not a function
   */
  prependOnceListener(e, t) {
    this.#r(e), this.#s(t);
    const s = ((...o) => {
      this.off(e, s), t(...o);
    });
    return s.originalListener = t, this.prependListener(e, s);
  }
  /**
   * Emits an event, calling all listeners registered for that event
   * Listeners are called synchronously in the order they were added
   * @param {string} event - The name of the event to emit
   * @param {...unknown} args - Arguments to pass to the listeners
   * @returns {boolean} True if the event had listeners, false otherwise
   * @throws {Error} If an 'error' event is emitted with no listeners
   * @example
   * emitter.emit('data', { id: 1, message: 'Hello' });
   * emitter.emit('error', new Error('Something went wrong'));
   *
   * const hasListeners = emitter.emit('test');
   * console.log(hasListeners); // true if listeners exist, false otherwise
   */
  emit(e, ...t) {
    const s = this.#e.get(e);
    if (!s || s.size === 0) {
      if (e === "error") {
        const o = t[0];
        if (o instanceof Error)
          throw o;
        {
          const i = this.#l(o);
          throw new Error(`Unhandled error event: ${i}`);
        }
      }
      return !1;
    }
    return [...s].forEach((o) => {
      try {
        const i = o(...t);
        this.#o && i instanceof Promise && i.catch((n) => {
          this.#a(n, e);
        });
      } catch (i) {
        this.#a(i, e);
      }
    }), !0;
  }
  /**
   * Removes an event listener for the specified event
   * @param {string} event - The name of the event
   * @param {EventListener} listener - The specific listener function to remove (must be same reference)
   * @returns {EventEmitter} The instance for method chaining
   * @example
   * const handler = (data) => console.log(data);
   * emitter.on('test', handler);
   * emitter.off('test', handler); // Removes the specific handler
   */
  off(e, t) {
    const s = this.#e.get(e);
    return s ? ([...s].forEach((o) => {
      (o === t || o.originalListener === t) && s.delete(o);
    }), s.size === 0 && this.#e.delete(e), this) : this;
  }
  /**
   * Removes all listeners for a specific event, or all events if no event specified
   * @param {string} [event] - The name of the event (optional, if not provided removes all listeners for all events)
   * @returns {EventEmitter} The instance for method chaining
   */
  removeAllListeners(e) {
    return e ? (this.#r(e), this.#e.delete(e)) : this.#e.clear(), this;
  }
  /**
   * Sets the maximum number of listeners for this emitter instance
   * @param {number} n - The maximum number of listeners (0 = unlimited)
   * @returns {EventEmitter} The instance for method chaining
   */
  setMaxListeners(e) {
    if (typeof e != "number" || e < 0 || !Number.isInteger(e))
      throw new TypeError("Max listeners must be a non-negative integer");
    return this.#t = e, this;
  }
  /**
   * Gets the maximum number of listeners for this emitter instance
   * @returns {number} The maximum number of listeners
   */
  getMaxListeners() {
    return this.#t;
  }
  /**
   * Returns the number of listeners for a specific event
   * @param {string} event - The name of the event
   * @returns {number} The number of listeners for the event
   */
  listenerCount(e) {
    const t = this.#e.get(e);
    return t ? t.size : 0;
  }
  /**
   * Returns a copy of the array of listeners for the specified event
   * Returns unwrapped listeners (without once() wrappers)
   * @param {string} event - The name of the event
   * @returns {Array<EventListener>} Array of listener functions
   * @example
   * const listeners = emitter.listeners('data');
   * console.log(`There are ${listeners.length} listeners`);
   */
  listeners(e) {
    const t = this.#e.get(e);
    return t ? [...t].map((s) => s.originalListener || s) : [];
  }
  /**
   * Returns a copy of the array of listeners for the specified event,
   * including any wrappers (such as those created by once())
   * @param {string} event - The name of the event
   * @returns {Array<EventListener>} Array of listener functions including wrappers
   * @example
   * const rawListeners = emitter.rawListeners('data');
   */
  rawListeners(e) {
    const t = this.#e.get(e);
    return t ? [...t] : [];
  }
  /**
   * Returns an array of event names that have listeners
   * @returns {Array<string>} Array of event names
   */
  eventNames() {
    return Array.from(this.#e.keys());
  }
}
const { queue: $e } = B;
function Re(r) {
  return [
    ".zip",
    ".rar",
    ".7z",
    ".tar.gz",
    ".tar.bz2",
    ".tar.xz",
    ".tar",
    ".gz",
    ".bz2",
    ".xz",
    ".tgz",
    ".epub",
    ".mobi",
    ".azw",
    ".pdf",
    ".doc",
    ".docx",
    ".xls",
    ".xlsx",
    ".ppt",
    ".pptx",
    ".jpg",
    ".jpeg",
    ".png",
    ".gif",
    ".bmp",
    ".tiff",
    ".svg",
    ".mp3",
    ".mp4",
    ".avi",
    ".mov",
    ".wmv",
    ".mpg",
    ".mpeg",
    ".flv",
    ".mkv",
    ".webm",
    ".ogg",
    ".ogv",
    ".ogx"
  ].some((t) => r.endsWith(t));
}
class Ne extends y {
  constructor(e, t = 3, s = 5, o = 1e3, i = !1, n = 5, l = 0, a = null) {
    super();
    try {
      const d = new URL(e);
      this.startUrl = d.href;
    } catch {
      throw new Error(`Invalid start URL: ${e}`);
    }
    this.maxDepth = t, this.concurrency = s, this.maxLinks = o, this.mainDomain = k.getDomain(this.startUrl), this.checkForeignFeeds = i, this.maxErrors = n, this.maxFeeds = l, this.errorCount = 0, this.instance = a, this.queue = $e(this.crawlPage.bind(this), this.concurrency), this.visitedUrls = /* @__PURE__ */ new Set(), this.timeout = 5e3, this.maxLinksReachedMessageEmitted = !1, this.feeds = [], this.queue.error((d) => {
      this.errorCount < this.maxErrors && (this.errorCount++, this.emit("error", {
        module: "deepSearch",
        error: `Async error: ${d}`,
        explanation: "An error occurred in the async queue while processing a crawling task. This could be due to network issues, invalid URLs, or server problems.",
        suggestion: "Check network connectivity and ensure the target website is accessible. The crawler will continue with other URLs."
      }), this.errorCount >= this.maxErrors && (this.queue.kill(), this.emit("log", {
        module: "deepSearch",
        message: `Stopped due to ${this.errorCount} errors (max ${this.maxErrors} allowed).`
      })));
    });
  }
  /**
   * Starts the crawling process
   */
  start() {
    this.queue.push({ url: this.startUrl, depth: 0 }), this.emit("start", { module: "deepSearch", niceName: "Deep search" });
  }
  /**
   * Checks if a URL is valid (same domain, not excluded file type)
   * @param {string} url - The URL to validate
   * @returns {boolean} True if the URL is valid, false otherwise
   */
  isValidUrl(e) {
    try {
      const t = k.getDomain(e) === k.getDomain(this.startUrl), s = !Re(e);
      return t && s;
    } catch {
      return this.errorCount < this.maxErrors && (this.errorCount++, this.emit("error", {
        module: "deepSearch",
        error: `Invalid URL: ${e}`,
        explanation: "A URL encountered during crawling could not be parsed or validated. This may be due to malformed URL syntax or unsupported URL schemes.",
        suggestion: "This is usually caused by broken links on the website. The crawler will skip this URL and continue with others."
      }), this.errorCount >= this.maxErrors && (this.queue.kill(), this.emit("log", {
        module: "deepSearch",
        message: `Stopped due to ${this.errorCount} errors (max ${this.maxErrors} allowed).`
      }))), !1;
    }
  }
  /**
   * Handles pre-crawl checks and validations for a given URL.
   * @param {string} url - The URL to check.
   * @param {number} depth - The current crawl depth.
   * @returns {boolean} True if the crawl should continue, false otherwise.
   * @private
   */
  shouldCrawl(e, t) {
    return t > this.maxDepth || this.visitedUrls.has(e) ? !1 : this.visitedUrls.size >= this.maxLinks ? (this.maxLinksReachedMessageEmitted || (this.emit("log", {
      module: "deepSearch",
      message: `Max links limit of ${this.maxLinks} reached. Stopping deep search.`
    }), this.maxLinksReachedMessageEmitted = !0), !1) : this.isValidUrl(e);
  }
  /**
   * Handles fetch errors and increments the error counter.
   * @param {string} url - The URL that failed to fetch.
   * @param {number} depth - The crawl depth at which the error occurred.
   * @param {string} error - The error message.
   * @returns {boolean} True if the crawl should stop, false otherwise.
   * @private
   */
  handleFetchError(e, t, s) {
    return this.errorCount < this.maxErrors && (this.errorCount++, this.emit("log", { module: "deepSearch", url: e, depth: t, error: s }), this.errorCount >= this.maxErrors) ? (this.queue.kill(), this.emit("log", {
      module: "deepSearch",
      message: `Stopped due to ${this.errorCount} errors (max ${this.maxErrors} allowed).`
    }), !0) : !1;
  }
  /**
   * Processes a single link found on a page, checking if it's a feed.
   * @param {string} url - The absolute URL of the link to process.
   * @param {number} depth - The current crawl depth.
   * @returns {Promise<boolean>} True if the crawl should stop, false otherwise.
   * @private
   */
  async processLink(e, t) {
    if (this.visitedUrls.has(e)) return !1;
    if (this.visitedUrls.size >= this.maxLinks)
      return this.maxLinksReachedMessageEmitted || (this.emit("log", {
        module: "deepSearch",
        message: `Max links limit of ${this.maxLinks} reached. Stopping deep search.`
      }), this.maxLinksReachedMessageEmitted = !0), !0;
    if (!(this.isValidUrl(e) || this.checkForeignFeeds)) return !1;
    const o = this.queue.length();
    this.emit("log", {
      module: "deepSearch",
      url: e,
      depth: t,
      progress: { processed: this.visitedUrls.size, remaining: o }
    });
    try {
      const i = await E(e, "", this.instance || void 0);
      if (i && !this.feeds.some((n) => n.url === e)) {
        if (this.feeds.push({ url: e, type: i.type, title: i.title, feedTitle: i.title }), this.emit("log", {
          module: "deepSearch",
          url: e,
          depth: t + 1,
          feedCheck: { isFeed: !0, type: i.type }
        }), this.maxFeeds > 0 && this.feeds.length >= this.maxFeeds)
          return this.queue.kill(), this.emit("log", {
            module: "deepSearch",
            message: `Stopped due to reaching maximum feeds limit: ${this.feeds.length} feeds found (max ${this.maxFeeds} allowed).`
          }), !0;
      } else i || this.emit("log", { module: "deepSearch", url: e, depth: t + 1, feedCheck: { isFeed: !1 } });
    } catch (i) {
      const n = i instanceof Error ? i : new Error(String(i));
      return this.handleFetchError(e, t + 1, `Error checking feed: ${n.message}`);
    }
    return t + 1 <= this.maxDepth && this.isValidUrl(e) && this.queue.push({ url: e, depth: t + 1 }), !1;
  }
  /**
   * Crawls a single page, extracting links and checking for feeds
   * @param {CrawlTask} task - The task object containing the URL and depth
   * @returns {Promise<void>} A promise that resolves when the page has been crawled
   */
  async crawlPage(e) {
    let { url: t, depth: s } = e;
    if (!this.shouldCrawl(t, s)) return;
    this.visitedUrls.add(t);
    const o = await I(t, this.timeout);
    if (!o) {
      this.handleFetchError(t, s, "Failed to fetch URL - timeout or network error");
      return;
    }
    if (!o.ok) {
      this.handleFetchError(t, s, `HTTP ${o.status} ${o.statusText}`);
      return;
    }
    const i = await o.text(), { document: n } = M(i);
    for (const l of n.querySelectorAll("a"))
      try {
        const a = new URL(l.href, this.startUrl).href;
        if (await this.processLink(a, s)) break;
      } catch {
        continue;
      }
  }
}
async function Me(r, e = {}, t = null) {
  const s = new Ne(
    r,
    e.depth || 3,
    5,
    e.maxLinks || 1e3,
    !!e.checkForeignFeeds,
    // Whether to check foreign domains for feeds
    e.maxErrors || 5,
    // Maximum number of errors before stopping
    e.maxFeeds || 0,
    // Maximum number of feeds before stopping (0 = no limit)
    t
    // Pass the FeedSeeker instance to the crawler
  );
  return s.timeout = (e.timeout || 5) * 1e3, t && t.emit && (s.on("start", (o) => t.emit("start", o)), s.on("log", (o) => t.emit("log", o)), s.on("error", (o) => t.emit("error", o)), s.on("end", (o) => t.emit("end", o))), s.start(), await new Promise((o) => {
    s.queue.drain(() => {
      s.emit("end", { module: "deepSearch", feeds: s.feeds, visitedUrls: s.visitedUrls.size }), o();
    });
  }), s.feeds;
}
class Ce extends y {
  /**
   * Creates a new FeedSeeker instance
   * @param {string} site - The website URL to search for feeds (protocol optional, defaults to https://)
   * @param {FeedSeekerOptions} [options={}] - Configuration options for the search
   * @example
   * // Basic usage
   * const seeker = new FeedSeeker('example.com');
   * seeker.on('error', (error) => console.error(error));
   *
   * // With options
   * const seeker = new FeedSeeker('https://blog.example.com', {
   *   maxFeeds: 5,
   *   timeout: 10,
   *   all: true
   * });
   * seeker.on('error', (error) => console.error(error));
   */
  constructor(e, t = {}) {
    super(), this.initStatus = "pending", this.rawSite = e;
    let s = e;
    s.includes("://") || (s = `https://${s}`);
    try {
      const o = new URL(s);
      this.site = o.pathname === "/" ? o.origin : o.href;
    } catch {
      this.site = s;
    }
    this.options = {
      timeout: 5,
      // Default timeout of 5 seconds
      ...t
    }, this.initPromise = null;
  }
  /**
   * Gets the current initialization status
   * @returns {InitStatus} The current status: 'pending', 'success', or 'error'
   * @example
   * const seeker = new FeedSeeker('https://example.com');
   * await seeker.initialize();
   * if (seeker.getInitStatus() === 'error') {
   *   console.error('Failed to initialize');
   * }
   */
  getInitStatus() {
    return this.initStatus;
  }
  /**
   * Checks if initialization was successful
   * @returns {boolean} True if initialization succeeded, false otherwise
   * @example
   * const seeker = new FeedSeeker('https://example.com');
   * await seeker.initialize();
   * if (seeker.isInitialized()) {
   *   const feeds = await seeker.metaLinks();
   * }
   */
  isInitialized() {
    return this.initStatus === "success";
  }
  /**
   * Creates an empty document for error states
   * This ensures all Document methods are available even when initialization fails
   * @returns {Document} An empty but valid Document object
   * @private
   */
  createEmptyDocument() {
    const { document: e } = M("<!DOCTYPE html><html><head></head><body></body></html>");
    return e;
  }
  /**
   * Sets the instance to an empty state (used when initialization fails)
   * @private
   */
  setEmptyState() {
    this.content = "", this.document = this.createEmptyDocument();
  }
  /**
   * Initializes the FeedSeeker instance by validating the URL and fetching the site content and parsing the HTML
   * This method is called automatically by other methods and caches the result
   * Emits 'error' events if validation or fetching fails
   * Sets initStatus to 'success' or 'error' based on the outcome
   * @returns {Promise<void>} A promise that resolves when the initialization is complete
   * @private
   * @example
   * await seeker.initialize(); // Usually called automatically
   * if (seeker.getInitStatus() === 'error') {
   *   console.error('Initialization failed');
   * }
   */
  async initialize() {
    return this.initPromise ??= (async () => {
      try {
        if (!this.rawSite || typeof this.rawSite != "string") {
          this.initStatus = "error", this.emit("error", {
            module: "FeedSeeker",
            error: "Site parameter must be a non-empty string"
          }), this.setEmptyState(), this.emit("initialized");
          return;
        }
        try {
          new URL(this.site);
        } catch {
          this.initStatus = "error", this.emit("error", {
            module: "FeedSeeker",
            error: `Invalid URL: ${this.site}`
          }), this.setEmptyState(), this.emit("initialized");
          return;
        }
        const e = (this.options.timeout ?? 5) * 1e3, t = await I(this.site, e);
        if (!t.ok) {
          this.initStatus = "error", this.emit("error", {
            module: "FeedSeeker",
            error: `HTTP error while fetching ${this.site}: ${t.status} ${t.statusText}`
          }), this.setEmptyState(), this.emit("initialized");
          return;
        }
        this.content = await t.text();
        const { document: s } = M(this.content);
        this.document = s, this.initStatus = "success", this.emit("initialized");
      } catch (e) {
        const t = e instanceof Error ? e : new Error(String(e));
        let s = `Failed to fetch ${this.site}`;
        if (t.name === "AbortError")
          s += ": Request timed out";
        else {
          s += `: ${t.message}`;
          const o = t.cause;
          o && (s += ` (cause: ${o.code || o.message})`);
        }
        this.initStatus = "error", this.emit("error", {
          module: "FeedSeeker",
          error: s,
          cause: t.cause
        }), this.setEmptyState(), this.emit("initialized");
      }
    })(), this.initPromise;
  }
  /**
   * Searches for feeds using meta links in the page (link tags in head)
   * This method looks for <link> elements with feed-related type attributes
   * @returns {Promise<Feed[]>} A promise that resolves to an array of found feed objects
   * @throws {Error} When initialization fails or network errors occur
   * @example
   * const feeds = await seeker.metaLinks();
   * console.log(feeds); // [{ url: '...', title: '...', type: 'rss' }]
   */
  async metaLinks() {
    return await this.initialize(), de(this);
  }
  /**
   * Searches for feeds by checking all anchor links on the page
   * This method analyzes all <a> elements for potential feed URLs
   * @returns {Promise<Feed[]>} A promise that resolves to an array of found feed objects
   * @throws {Error} When initialization fails or network errors occur
   * @example
   * const feeds = await seeker.checkAllAnchors();
   * console.log(feeds); // [{ url: '...', title: '...', type: 'atom' }]
   */
  async checkAllAnchors() {
    return await this.initialize(), pe(this);
  }
  /**
   * Performs a blind search for common feed endpoints
   * This method tries common feed paths like /feed, /rss, /atom.xml, etc.
   * @returns {Promise<Feed[]>} A promise that resolves to an array of found feed objects
   * @throws {Error} When network errors occur during endpoint testing
   * @example
   * const feeds = await seeker.blindSearch();
   * console.log(feeds); // [{ url: '...', type: 'rss', title: '...' }]
   */
  async blindSearch() {
    return await this.initialize(), Le(this);
  }
  /**
   * Performs a deep search by crawling the website
   * This method recursively crawls pages to find feeds, respecting depth and link limits
   * @returns {Promise<Feed[]>} A promise that resolves to an array of found feed objects
   * @throws {Error} When network errors occur during crawling
   * @example
   * const feeds = await seeker.deepSearch();
   * console.log(feeds); // [{ url: '...', type: 'json', title: '...' }]
   */
  async deepSearch() {
    return await this.initialize(), Me(this.site, this.options, this);
  }
  /**
   * Starts a comprehensive feed search using multiple strategies
   * Automatically deduplicates feeds found by multiple strategies
   * @returns {Promise<Feed[]>} A promise that resolves to an array of unique found feed objects
   * @example
   * const seeker = new FeedSeeker('https://example.com', { maxFeeds: 10 });
   * const feeds = await seeker.startSearch();
   * console.log('All feeds:', feeds);
   */
  async startSearch() {
    const e = await this.handleSingleStrategyMode();
    if (e)
      return e;
    const t = /* @__PURE__ */ new Map();
    await this.collectFeedsFromStrategies(t), await this.handleDeepSearch(t);
    const s = this.getFeedsWithLimit(t);
    return this.emit("end", { module: "all", feeds: s }), s;
  }
  /**
   * Handles single strategy search modes (deepsearchOnly, metasearch, blindsearch, anchorsonly)
   * @returns {Promise<Feed[] | null>} Results if a single strategy mode is active, null otherwise
   * @private
   */
  async handleSingleStrategyMode() {
    const { deepsearchOnly: e, metasearch: t, blindsearch: s, anchorsonly: o } = this.options;
    return e ? this.deepSearch() : t ? this.metaLinks() : s ? this.blindSearch() : o ? this.checkAllAnchors() : null;
  }
  /**
   * Collects feeds from multiple search strategies
   * @param {Map<string, Feed>} feedMap - Map to store deduplicated feeds
   * @returns {Promise<void>}
   * @private
   */
  async collectFeedsFromStrategies(e) {
    const t = [this.metaLinks, this.checkAllAnchors, this.blindSearch];
    for (const s of t) {
      const o = await s.call(this);
      if (this.addFeedsToMap(e, o), this.hasReachedLimit(e))
        break;
    }
  }
  /**
   * Adds feeds to the feed map, deduplicating by URL
   * @param {Map<string, Feed>} feedMap - Map to store feeds
   * @param {Feed[]} feeds - Feeds to add
   * @returns {void}
   * @private
   */
  addFeedsToMap(e, t) {
    if (!(!t || t.length === 0))
      for (const s of t)
        e.has(s.url) || e.set(s.url, s);
  }
  /**
   * Checks if the feed limit has been reached
   * @param {Map<string, Feed>} feedMap - Current feed map
   * @returns {boolean} True if limit is reached, false otherwise
   * @private
   */
  hasReachedLimit(e) {
    const { all: t, maxFeeds: s } = this.options;
    return !t && s !== void 0 && s > 0 && e.size >= s;
  }
  /**
   * Handles deep search if enabled
   * @param {Map<string, Feed>} feedMap - Map to store feeds
   * @returns {Promise<void>}
   * @private
   */
  async handleDeepSearch(e) {
    const { deepsearch: t, maxFeeds: s } = this.options;
    if (!t || s && e.size >= s)
      return;
    const o = await this.deepSearch();
    if (!(!o || o.length === 0)) {
      for (const i of o)
        if (e.has(i.url) || e.set(i.url, i), this.hasReachedLimit(e))
          break;
    }
  }
  /**
   * Gets feeds from the map with limit applied
   * @param {Map<string, Feed>} feedMap - Map containing feeds
   * @returns {Feed[]} Feeds with limit applied
   * @private
   */
  getFeedsWithLimit(e) {
    const t = Array.from(e.values()), { maxFeeds: s } = this.options;
    return s !== void 0 && s > 0 && t.length > s ? t.slice(0, s) : t;
  }
}
const Fe = `___________               .____________              __                 
_   _____/___   ____   __| _/   _____/ ____   ____ |  | __ ___________ 
 |    __)/ __ _/ __  / __ |_____  _/ __ _/ __ |  |/ // __ _  __  |     \\  ___/  ___// /_/ |/          ___/  ___/|    <  ___/|  | /
 ___  / ___  >___  >____ /_______  /___  >___  >__|_ \\___  >__|   
     /      /     /     /       /     /     /     /    /       `;
let _ = 0, w = [], O = !1;
function Ie(...r) {
  const e = r[0];
  _ = 0, process.stdout.write(`Starting ${e.niceName} `);
}
function Oe(...r) {
  const e = r[0];
  O ? e.feeds.length === 0 ? process.stdout.write(u("yellow", ` No feeds found.
`)) : (process.stdout.write(u("green", ` Found ${e.feeds.length} feeds.
`)), console.log(JSON.stringify(e.feeds, null, 2)), w = w.concat(e.feeds)) : e.feeds.length === 0 ? process.stdout.write(u("yellow", ` No feeds found.
`)) : process.stdout.write(u("green", ` Found ${e.feeds.length} feeds.
`));
}
async function De(...r) {
  const e = r[0];
  if (e.module === "metalinks" && process.stdout.write("."), (e.module === "blindsearch" || e.module === "anchors") && "totalCount" in e && "totalEndpoints" in e) {
    _ > 0 && process.stdout.write(`\x1B[${_}D`);
    const t = ` (${e.totalCount}/${e.totalEndpoints})`;
    process.stdout.write(t), _ = t.length;
  }
  if (e.module === "deepSearch" && "url" in e && "depth" in e && "progress" in e) {
    const t = e.progress, s = t.processed || 0, o = t.remaining || 0, i = s + o;
    try {
      const n = new URL(e.url), l = n.hostname, a = n.pathname.length > 30 ? n.pathname.substring(0, 27) + "..." : n.pathname, d = `${l}${a}`;
      process.stdout.write(`  [depth:${e.depth} ${s}/${i}] ${d}
`);
    } catch {
      process.stdout.write(`  [depth:${e.depth} ${s}/${i}]
`);
    }
  }
}
function ze(r, e) {
  const t = new Ce(r, e);
  return t.site = r, t.options = e, t.initializationError = !1, t.on("start", Ie), t.on("log", De), t.on("end", Oe), t.on("error", (...s) => {
    const o = s[0];
    if (typeof o == "object" && o !== null && o.module === "FeedSeeker" && (t.initializationError = !0), o instanceof Error)
      console.error(u("red", `
Error for ${r}: ${o.message}`));
    else if (typeof o == "object" && o !== null) {
      const i = o, n = typeof i.error == "string" ? i.error : String(o);
      console.error(u("red", `
Error for ${r}: ${n}`));
    } else
      console.error(u("red", `
Error for ${r}: ${String(o)}`));
  }), t;
}
async function Pe(r, e) {
  r.includes("://") || (r = `https://${r}`);
  const t = ze(r, e);
  if (await t.initialize(), t.initializationError)
    return [];
  const s = [];
  return e.metasearch ? s.push(() => t.metaLinks()) : e.anchorsonly ? s.push(() => t.checkAllAnchors()) : e.blindsearch ? s.push(() => t.blindSearch()) : e.deepsearchOnly ? s.push(() => t.deepSearch()) : e.all ? s.push(
    () => t.metaLinks(),
    () => t.checkAllAnchors(),
    () => t.blindSearch(),
    () => t.deepSearch()
  ) : s.push(
    () => t.metaLinks(),
    () => t.checkAllAnchors(),
    () => t.blindSearch(),
    ...e.deepsearch ? [() => t.deepSearch()] : []
  ), await (async () => {
    if (e.all) {
      const n = [];
      for (const l of s) {
        const a = await l();
        a.length > 0 && n.push(...a);
      }
      return n;
    } else {
      for (const n of s) {
        const l = await n();
        if (l.length > 0) return l;
      }
      return [];
    }
  })();
}
function qe(r) {
  const e = new Y();
  return e.name("feed-seeker").description("Find RSS, Atom, and JSON feeds on any website with FeedSeeker."), e.command("version").description("Get version").action(async () => {
    const s = (await import("./package-BcdWRwEt.js")).default;
    process.stdout.write(`${s.version}
`);
  }), e.argument("[site]", "The website URL to search for feeds").option("-m, --metasearch", "Meta search only").option("-b, --blindsearch", "Blind search only").option("-a, --anchorsonly", "Anchors search only").option("-d, --deepsearch", "Enable deep search").option("--all", "Execute all strategies and combine results").option("--deepsearch-only", "Deep search only").option(
    "--depth <number>",
    "Depth of deep search",
    (t) => {
      const s = parseInt(t, 10);
      if (Number.isNaN(s) || s < 1)
        throw new Error("Depth must be a positive number (minimum 1)");
      return s;
    },
    3
  ).option(
    "--max-links <number>",
    "Maximum number of links to process during deep search",
    (t) => {
      const s = parseInt(t, 10);
      if (Number.isNaN(s) || s < 1)
        throw new Error("Max links must be a positive number (minimum 1)");
      return s;
    },
    1e3
  ).option(
    "--timeout <seconds>",
    "Timeout for fetch requests in seconds",
    (t) => {
      const s = parseInt(t, 10);
      if (Number.isNaN(s) || s < 1)
        throw new Error("Timeout must be a positive number (minimum 1 second)");
      return s;
    },
    5
  ).option("--keep-query-params", "Keep query parameters from the original URL when searching").option("--check-foreign-feeds", "Check if foreign domain URLs are feeds (but don't crawl them)").option(
    "--max-errors <number>",
    "Stop after a certain number of errors",
    (t) => {
      const s = parseInt(t, 10);
      if (Number.isNaN(s) || s < 0)
        throw new Error("Max errors must be a non-negative number");
      return s;
    },
    5
  ).option(
    "--max-feeds <number>",
    "Stop search after finding a certain number of feeds",
    (t) => {
      const s = parseInt(t, 10);
      if (Number.isNaN(s) || s < 0)
        throw new Error("Max feeds must be a non-negative number");
      return s;
    },
    0
  ).option(
    "--search-mode <mode>",
    "Search mode for blind search: fast (~25), standard (~100), or full (~350+)",
    "standard"
  ).description(`Find feeds for site
`).action(async (t, s) => {
    t || (e.help(), process.exit(0));
    try {
      s.all && (O = !0, w = []), e.feeds = await Pe(t, s);
    } catch (o) {
      s.displayErrors ? console.error(`
Error details:`, o) : console.error(u("red", `
Error: ${o.message}`)), process.exit(1);
    }
  }), e.addOption(new J("--display-errors", "Display errors").hideHelp()), e;
}
async function je(r = process.argv) {
  console.log(`${Fe}
`);
  const e = qe();
  await e.parseAsync(r), e.feeds !== void 0 && (O && w.length > 0 ? (console.log(u("yellow", `
=== All Strategies Complete ===`)), console.log(
    u(
      "green",
      `Total: ${w.length} ${w.length === 1 ? "feed" : "feeds"} found from all strategies
`
    )
  ), console.log(JSON.stringify(w, null, 2))) : e.feeds.length > 0 && console.log(JSON.stringify(e.feeds, null, 2)));
}
import.meta.url === `file://${process.argv[1]}` && je().catch((r) => {
  console.error(u("red", `
Error: ${r.message}`)), process.exit(1);
});
export {
  qe as createProgram,
  je as run
};

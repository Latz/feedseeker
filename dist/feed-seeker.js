#!/usr/bin/env node
import { parseHTML as R } from "linkedom";
import { Agent as H } from "undici";
import $ from "tldts";
import X from "async";
async function N(t, e = {}) {
  let r, s, i = !1;
  if (typeof e == "number")
    r = e, s = {};
  else {
    const { timeout: l = 5e3, insecure: m = !1, ...h } = e;
    r = l, i = m, s = h;
  }
  try {
    const l = new URL(t);
    if (!["http:", "https:"].includes(l.protocol))
      throw new Error(`Invalid URL protocol: ${l.protocol}. Only http: and https: are allowed.`);
  } catch (l) {
    throw l instanceof TypeError ? new Error(`Invalid URL: ${t}`) : l;
  }
  if (r <= 0)
    throw new TypeError(`Invalid timeout: ${r}. Timeout must be a positive number.`);
  if (!Number.isFinite(r))
    throw new TypeError(`Invalid timeout: ${r}. Timeout must be a finite number.`);
  const n = new AbortController(), o = setTimeout(() => n.abort(), r), c = {
    ...{
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate, br",
      Connection: "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-CH-UA": '"Chromium";v="132", "Google Chrome";v="132", "Not-A.Brand";v="99"',
      "Sec-CH-UA-Mobile": "?0",
      "Sec-CH-UA-Platform": '"Windows"',
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Cache-Control": "max-age=0"
    },
    ...s.headers
  }, d = i ? new H({ connect: { rejectUnauthorized: !1 } }) : void 0;
  try {
    const l = await fetch(t, {
      ...s,
      signal: n.signal,
      headers: c,
      ...d ? { dispatcher: d } : {}
    });
    return clearTimeout(o), l;
  } catch (l) {
    throw clearTimeout(o), l instanceof Error && l.name === "AbortError" ? new Error(`Request to ${t} timed out after ${r}ms`) : l;
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
}, M = {
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
    VERSION: /<rss\s[^>]*version\s*=\s*["'][\d.]+["']/i,
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
    FEED_START: /<feed[\s>]/i,
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
function W(t) {
  let e;
  try {
    e = new URL(t);
  } catch {
    throw new Error(`Invalid URL: ${t}`);
  }
  if (!["http:", "https:"].includes(e.protocol))
    throw new Error(
      `Invalid protocol: ${e.protocol}. Only http: and https: protocols are allowed.`
    );
}
function Y(t) {
  if (t.length > p.MAX_CONTENT_SIZE)
    throw new Error(
      `Content too large: ${t.length} bytes. Maximum allowed: ${p.MAX_CONTENT_SIZE} bytes.`
    );
}
function V(t) {
  return t == null ? p.DEFAULT_TIMEOUT : !Number.isFinite(t) || t < p.MIN_TIMEOUT ? (console.warn(
    `Invalid timeout value ${t}. Using minimum: ${p.MIN_TIMEOUT} seconds.`
  ), p.MIN_TIMEOUT) : t > p.MAX_TIMEOUT ? (console.warn(
    `Timeout value ${t} exceeds maximum. Clamping to ${p.MAX_TIMEOUT} seconds.`
  ), p.MAX_TIMEOUT) : Math.floor(t);
}
function B(t) {
  return M.URL_PATTERNS.some((e) => t.includes(e));
}
function G(t) {
  return !!(t.type && M.TYPES.includes(t.type) && M.VERSIONS.includes(t.version) || t.type && t.version && t.html);
}
function C(t) {
  return t.replaceAll(f.CDATA, "$1");
}
function S(t) {
  return t ? t.replaceAll(/\s+/g, " ").trim() : null;
}
async function y(t, e = "", r) {
  if (W(t), B(t))
    return null;
  if (!e) {
    if (!r)
      throw new Error("Instance parameter is required when content is not provided");
    const n = V(r.options.timeout) * 1e3, o = await N(t, { timeout: n, insecure: r.options.insecure });
    if (!o.ok)
      throw new Error(`Failed to fetch ${t}: ${o.status} ${o.statusText}`);
    e = await o.text();
  }
  return Y(e), Q(e) || Z(e) || K(e) || null;
}
function J(t) {
  const e = f.RSS.CHANNEL_CONTENT.exec(t);
  if (e) {
    const i = e[1], n = f.RSS.TITLE.exec(i);
    return n ? S(C(n[1])) : null;
  }
  const r = f.RSS.TITLE.exec(t);
  return r ? S(C(r[1])) : null;
}
function Q(t) {
  if (f.RSS.VERSION.test(t)) {
    const e = f.RSS.CHANNEL.test(t), r = f.RSS.ITEM.test(t), s = f.RSS.DESCRIPTION.test(t);
    if (e && s && (r || f.RSS.CHANNEL_END.test(t)))
      return { type: "rss", title: J(t) };
  }
  return null;
}
function Z(t) {
  const e = f.ATOM.NAMESPACE_XMLNS.test(t) || f.ATOM.NAMESPACE_XMLNS_ATOM.test(t) || f.ATOM.NAMESPACE_ATOM_PREFIX.test(t);
  if (f.ATOM.FEED_START.test(t) && e) {
    const r = f.ATOM.ENTRY.test(t), s = f.ATOM.TITLE_TAG.test(t);
    if (r && s) {
      const i = f.ATOM.TITLE_CONTENT.exec(t);
      return { type: "atom", title: i ? S(C(i[1])) : null };
    }
  }
  return null;
}
function K(t) {
  try {
    const e = JSON.parse(t);
    if (G(e))
      return null;
    if (e.version && typeof e.version == "string" && e.version.includes("jsonfeed") || e.items && Array.isArray(e.items) || e.feed_url) {
      const r = e.title || e.name || null;
      return { type: "json", title: typeof r == "string" ? S(r) : null };
    }
    return null;
  } catch {
    return null;
  }
}
const ee = ["feed+json", "rss+xml", "atom+xml", "xml", "rdf+xml"], te = ["/rss", "/feed", "/atom", ".rss", ".atom", ".xml", ".json"];
function re(t) {
  return t ? t.replaceAll(/\s+/g, " ").trim() : null;
}
async function L(t, e, r, s, i = 5) {
  const n = e.options?.maxFeeds || 0;
  for (let o = 0; o < t.length; o += i) {
    if (n > 0 && r.length >= n)
      return !0;
    const a = t.slice(o, o + i);
    await Promise.allSettled(
      a.map(async (c) => {
        n > 0 && r.length >= n || await ne(c, e, r, s);
      })
    );
  }
  return n > 0 && r.length >= n;
}
function se(t, e) {
  if (!t.href) return null;
  try {
    return new URL(t.href, e.site).href;
  } catch (r) {
    if (e.options?.showErrors) {
      const s = r instanceof Error ? r : new Error(String(r));
      e.emit("error", {
        module: "metalinks",
        error: s.message,
        explanation: `Invalid URL found in meta link: ${t.href}. Unable to construct a valid URL.`,
        suggestion: "Check the meta link href attribute for malformed URLs."
      });
    }
    return null;
  }
}
function ie(t, e, r, s, i, n) {
  s.push({
    url: t,
    title: re(e.title),
    type: r.type,
    feedTitle: r.title
  }), i.add(t);
  const o = n.options?.maxFeeds || 0;
  return o > 0 && s.length >= o ? (n.emit("log", {
    module: "metalinks",
    message: `Stopped due to reaching maximum feeds limit: ${s.length} feeds found (max ${o} allowed).`
  }), !0) : !1;
}
async function ne(t, e, r, s) {
  const i = se(t, e);
  if (!(!i || s.has(i))) {
    e.emit("log", { module: "metalinks", message: `Checking feed: ${i}` });
    try {
      const n = await y(i, "", e);
      n && ie(i, t, n, r, s, e);
    } catch (n) {
      if (e.options?.showErrors) {
        const o = n instanceof Error ? n : new Error(String(n));
        e.emit("error", {
          module: "metalinks",
          error: o.message,
          explanation: "An error occurred while trying to fetch and validate a feed URL found in a meta link tag. This could be due to network issues, server problems, or invalid feed content.",
          suggestion: "Check if the meta link URL is accessible and returns valid feed content. The search will continue with other meta links."
        });
      }
    }
  }
}
async function oe(t) {
  t.emit("start", { module: "metalinks", niceName: "Meta Links" });
  const e = [], r = /* @__PURE__ */ new Set();
  try {
    const s = ee.map((d) => `link[type="application/${d}"]`).join(", "), i = Array.from(
      t.document.querySelectorAll(s)
    );
    if (await L(i, t, e, r))
      return e;
    const o = Array.from(
      t.document.querySelectorAll('link[rel="alternate"][type*="rss"], link[rel="alternate"][type*="xml"], link[rel="alternate"][type*="atom"], link[rel="alternate"][type*="json"]')
    );
    if (await L(o, t, e, r))
      return e;
    const c = Array.from(
      t.document.querySelectorAll('link[rel="alternate"]')
    ).filter(
      (d) => d.href && te.some((l) => d.href.toLowerCase().includes(l))
    );
    return await L(c, t, e, r), e;
  } finally {
    t.emit("end", { module: "metalinks", feeds: e });
  }
}
function T(t, e) {
  try {
    return new URL(t, e);
  } catch {
    return null;
  }
}
function ae(t) {
  const e = T(t);
  return e ? e.protocol === "http:" || e.protocol === "https:" : !1;
}
function le(t) {
  return T(t) ? !1 : !t.includes("://");
}
const I = /* @__PURE__ */ new Set([
  "feedburner.com",
  "feeds.feedburner.com",
  "feedproxy.google.com",
  "feeds2.feedburner.com"
]);
function O(t, e) {
  const r = T(t);
  return !r || r.hostname === e.hostname ? !0 : I.has(r.hostname) || [...I].some((s) => r.hostname.endsWith("." + s));
}
function ce(t) {
  if (t.options.followMetaRefresh && t.document && typeof t.document.querySelector == "function") {
    const e = t.document.querySelector('meta[http-equiv="refresh"]')?.getAttribute("content");
    if (e) {
      const r = /url=(.*)/i.exec(e);
      if (r?.[1]) {
        const s = new URL(r[1], t.site).href;
        return t.emit("log", {
          module: "anchors",
          message: `Following meta refresh redirect to ${s}`
        }), D({ ...t, site: s });
      }
    }
  }
  return null;
}
function de(t, e, r) {
  if (!t.href)
    return null;
  if (ae(t.href))
    return t.href;
  if (le(t.href)) {
    const s = T(t.href, e);
    return s ? s.href : (r.emit("error", {
      module: "anchors",
      error: `Invalid relative URL: ${t.href}`,
      explanation: "A relative URL found in an anchor tag could not be resolved against the base URL. This may be due to malformed relative path syntax.",
      suggestion: 'Check the anchor href attribute for proper relative path format (e.g., "./feed.xml", "../rss.xml", or "/feed").'
    }), null);
  }
  return null;
}
function he(t) {
  const e = /https?:\/\/[^\s"'<>)]+/gi, r = t.match(e);
  if (!r)
    return [];
  const s = /* @__PURE__ */ new Set();
  for (const i of r) {
    let n = i;
    for (; n.length > 0 && ".,;:!?".includes(n.at(-1)); )
      n = n.slice(0, -1);
    s.add(n);
  }
  return Array.from(s);
}
async function fe(t, e, r) {
  const { instance: s, feedUrls: i } = r;
  try {
    const n = await y(e, "", s);
    n && i.push({
      url: e,
      title: t.textContent?.trim() || null,
      type: n.type,
      feedTitle: n.title
    });
  } catch (n) {
    if (s.options?.showErrors) {
      const o = n instanceof Error ? n : new Error(String(n));
      s.emit("error", {
        module: "anchors",
        error: `Error checking feed at ${e}: ${o.message}`,
        explanation: "An error occurred while trying to fetch and validate a potential feed URL found in an anchor tag. This could be due to network timeouts, server errors, or invalid feed content.",
        suggestion: "Check if the URL is accessible and returns valid feed content. Network connectivity issues or server problems may cause this error."
      });
    }
  }
}
function _(t, e, r) {
  t.emit("log", {
    module: "anchors",
    message: `Stopped due to reaching maximum feeds limit: ${e} feeds found (max ${r} allowed).`
  });
}
async function ue(t, e, r, s) {
  let i = 0;
  for (let n = 0; n < t.length; n += r) {
    if (s > 0 && e.feedUrls.length >= s) {
      _(e.instance, e.feedUrls.length, s);
      break;
    }
    const o = t.slice(n, n + r);
    await Promise.allSettled(
      o.map(async ({ anchor: a, url: c }) => {
        s > 0 && e.feedUrls.length >= s || (i++, e.instance.emit("log", { module: "anchors", totalCount: i, totalEndpoints: t.length }), await fe(a, c, e));
      })
    );
  }
  return i;
}
async function me(t, e, r, s, i, n) {
  const o = t.instance.document.body?.innerHTML || "", a = he(o), c = new Set(t.feedUrls.map((h) => h.url)), d = [];
  for (const h of a)
    !c.has(h) && O(h, e) && (d.push(h), c.add(h));
  let l = s;
  const m = r + d.length;
  for (let h = 0; h < d.length; h += i) {
    if (n > 0 && t.feedUrls.length >= n) {
      _(t.instance, t.feedUrls.length, n);
      break;
    }
    const x = d.slice(h, h + i);
    await Promise.allSettled(
      x.map(async (w) => {
        if (!(n > 0 && t.feedUrls.length >= n)) {
          t.instance.emit("log", { module: "anchors", totalCount: l++, totalEndpoints: m });
          try {
            const u = await y(w, "", t.instance);
            u && t.feedUrls.push({ url: w, title: null, type: u.type, feedTitle: u.title });
          } catch (u) {
            if (t.instance.options?.showErrors) {
              const j = u instanceof Error ? u : new Error(String(u));
              t.instance.emit("error", {
                module: "anchors",
                error: `Error checking feed at ${w}: ${j.message}`,
                explanation: "An error occurred while trying to fetch and validate a potential feed URL found in page text. This could be due to network timeouts, server errors, or invalid feed content.",
                suggestion: "Check if the URL is accessible and returns valid feed content. Network connectivity issues or server problems may cause this error."
              });
            }
          }
        }
      })
    );
  }
}
async function D(t) {
  const e = ce(t);
  if (e)
    return e;
  const r = new URL(t.site), s = t.document.querySelectorAll("a"), i = [];
  for (const d of s) {
    const l = de(d, r, t);
    l && O(l, r) && i.push({ anchor: d, url: l });
  }
  const n = t.options?.maxFeeds || 0, o = t.options?.concurrency ?? 3, a = { instance: t, baseUrl: r, feedUrls: [] }, c = await ue(i, a, o, n);
  return (n === 0 || a.feedUrls.length < n) && await me(a, r, i.length, c + 1, o, n), a.feedUrls;
}
async function pe(t) {
  t.emit("start", {
    module: "anchors",
    niceName: "Check All Anchors"
  });
  const e = await D(t);
  return t.emit("end", { module: "anchors", feeds: e }), e;
}
const ge = ["feed", "rss", "atom", "feed.xml", "rss.xml", "atom.xml", "index.xml", "feeds", ".rss", ".atom", ".xml", "?feed=rss2", "?feed=atom", "feed/rss/", "feed/atom/", "blog/feed", "blog/rss", "feed.json", "rss.php", "feed.php", "news/rss", "latest/feed", "?format=rss", "?format=feed"], we = ["rssfeed.xml", "feed.rss", "feed.atom", "feeds/", "rss/", "index.rss", "index.atom", "rss/index.xml", "atom/index.xml", "syndication/", "rssfeed.rdf", "&_rss=1", "blog/atom", "blog/feeds", "blog?format=rss", "blog-feed.xml", "weblog/atom", "weblog/rss", "?format=feed", "feed/rdf/", "feed/rss2/", "wp-atom.php", "wp-feed.php", "wp-rdf.php", "wp-rss.php", "wp-rss2.php", "index.php?format=feed", "articles/feed", "atom/news/", "latest.rss", "news.xml", "news/atom", "rss/articles/", "rss/latest/", "rss/news/", "rss/news/rss.xml", "rss/rss.php", "api/feed", "api/rss", "api/atom", "api/rss.xml", "api/feed.xml", "api/v1/feed", "api/v2/feed", "v1/feed", "v2/feed", "feed.aspx", "rss.aspx", "rss.cfm", "feed.jsp", "feed.pl", "feed.py", "feed.rb", "feed/atom", "feed/rdf", "feed/atom.rss", "feed/atom.xml", "feed/rss.xml", "feed/rss2", "posts.rss", "_site/feed.xml", "build/feed.xml", "dist/feed.xml", "out/feed.xml", "?atom=1", "?rss=1", "?feed=atom", "?feed=rss", "?format=atom", "?output=rss", "?output=atom", "?type=rss", "?type=atom", "?view=feed", "?view=rss"], Ee = ["atomfeed", "jsonfeed", "newsfeed", "rssfeed", "feeds.json", "feeds.php", "feeds.xml", ".json", ".opml", ".rdf", "opml", "opml/", "rdf", "rdf/", "feed.cml", "feed.csv", "feed.txt", "feed.yaml", "feed.yml", "?download=atom", "?download=rss", "?export=atom", "?export=rss", "?syndicate=atom", "?syndicate=rss", "export/rss.xml", "extern.php?action=feed&type=atom", "external?type=rss2", "index.php?action=.xml;type=rss", "public/feed.xml", "spip.php?page=backend", "spip.php?page=backend-breve", "spip.php?page=backend-sites", "syndicate/rss.xml", "syndication.php", "xml", "sitenews", "api/mobile/feed", "catalog.xml", "catalog/feed", "deals.xml", "deals/feed", "inventory.rss", "inventory/feed", "products.rss", "products/atom", "products/rss", "promotions/feed", "specials/feed", "audio/feed", "episodes.rss", "episodes/feed", "gallery.rss", "media/feed", "podcast.rss", "podcast/atom", "podcast/rss", "podcasts/feed", "shows/feed", "video/feed", "videos.rss", "comments/feed", "community/feed", "discussions/feed", "forum.rss", "forum/atom", "forum/rss", "reviews/feed", "agenda/feed", "calendar/feed", "events.rss", "events/feed", "schedule/feed", "careers/feed", "jobs.rss", "jobs/feed", "opportunities/feed", "vacancies/feed", "content/feed", "documents/feed", "pages/feed", "resources/feed", "emails/feed", "mailinglist/feed", "newsletter/feed", "subscription/feed", "category/*/feed", "tag/*/feed", "tags/feed", "topics/feed", "author/*/feed", "profile/*/feed", "user/*/feed", "archive/feed", "daily/feed", "monthly/feed", "weekly/feed", "yearly/feed", "announcements/feed", "changelog/feed", "press/feed", "updates/feed", "revisions/feed", "app/feed", "mobile/feed", "international/feed", "local/feed", "national/feed", "regional/feed", "education/feed", "entertainment/feed", "finance/feed", "health/feed", "industry/feed", "market/feed", "science/feed", "sector/feed", "sports/feed", "technology/feed", "aggregate/feed", "all/feed", "combined/feed", "compilation/feed", "everything/feed", "actualites/feed", "nachrichten/feed", "nieuws/feed", "noticias/feed", "novosti/feed", "cms/feed", "contentful/feed", "sanity/feed", "strapi/feed", "docs/feed", "documentation/feed", "help/feed", "kb/feed", "support/feed", "wiki/feed", "branches/feed", "commits/feed", "issues/feed", "pull-requests/feed", "releases/feed", "tags/feed", "analytics/feed", "metrics/feed", "reports/feed", "stats/feed", "de/feed", "en/feed", "es/feed", "fr/feed", "it/feed", "ja/feed", "ko/feed", "pt/feed", "ru/feed", "zh/feed", "drupal/feed", "joomla/feed", "magento/feed", "opencart/feed", "prestashop/feed", "shopify/feed", "typo3/feed", "woocommerce/feed", "discourse/feed", "invision/feed", "phpbb/feed", "vbulletin/feed", "xenforo/feed"], g = {
  essential: ge,
  standard: we,
  comprehensive: Ee
}, ye = 0, b = 0, Se = 3, A = "standard", P = 2083, v = 10, U = 1, F = 1e4, k = 6e4;
function Te(t) {
  switch (t) {
    case "fast":
      return g.essential;
    case "standard":
      return [...g.essential, ...g.standard];
    case "exhaustive":
    case "full":
      return [
        ...g.essential,
        ...g.standard,
        ...g.comprehensive
      ];
    default:
      return [...g.essential, ...g.standard];
  }
}
function xe(t) {
  return t ? ["fast", "standard", "exhaustive", "full"].includes(t) ? t : (console.warn(`Invalid search mode "${t}". Falling back to "${A}".`), A) : A;
}
function Le(t) {
  return t == null ? Se : !Number.isFinite(t) || t < U ? (console.warn(`Invalid concurrency value ${t}. Using minimum: ${U}.`), U) : t > v ? (console.warn(
    `Concurrency value ${t} exceeds maximum. Clamping to ${v}.`
  ), v) : Math.floor(t);
}
function be(t) {
  return t == null ? b : !Number.isFinite(t) || t < 0 ? (console.warn(`Invalid request delay ${t}. Using default: ${b}.`), b) : t > k ? (console.warn(`Request delay ${t}ms exceeds maximum. Clamping to ${k}ms.`), k) : Math.floor(t);
}
function z(t) {
  return t.length <= P;
}
function Ae(t) {
  let e;
  try {
    e = new URL(t);
  } catch {
    throw new Error(`Invalid URL provided to blindSearch: ${t}`);
  }
  if (!z(t))
    throw new Error(
      `URL too long (${t.length} chars). Maximum allowed: ${P} characters.`
    );
  if (!["http:", "https:"].includes(e.protocol))
    throw new Error(`Invalid protocol "${e.protocol}". Only http: and https: are allowed.`);
  return e;
}
function ve(t, e, r, s) {
  for (const i of e) {
    if (s.length >= F)
      return console.warn(
        `URL generation limit reached (${F} URLs). Stopping to prevent resource exhaustion.`
      ), !1;
    const n = r ? `${t}/${i}${r}` : `${t}/${i}`;
    z(n) ? s.push(n) : console.warn(`Skipping URL (too long): ${n.substring(0, 100)}...`);
  }
  return !0;
}
function Ue(t, e, r) {
  const s = Ae(t), i = s.origin, n = e ? s.search : "";
  let o = t;
  const a = [];
  for (; o.length >= i.length; ) {
    const c = o.endsWith("/") ? o.slice(0, -1) : o;
    if (!ve(c, r, n, a)) break;
    o = o.slice(0, o.lastIndexOf("/"));
  }
  return a;
}
function ke(t, e, r, s, i) {
  return t.type === "rss" ? s = !0 : t.type === "atom" && (i = !0), r.push({
    url: e,
    title: null,
    // No link element title in blind search (unlike metaLinks)
    type: t.type,
    feedTitle: t.title
    // Actual feed title from parsing the feed
  }), { rssFound: s, atomFound: i };
}
function Re(t, e, r, s, i) {
  return t >= e ? !1 : i ? !0 : !(r && s);
}
async function Me(t, e) {
  const r = xe(t.options?.searchMode), s = Te(r), i = Ue(
    t.site,
    t.options?.keepQueryParams || !1,
    s
  );
  t.emit("start", {
    module: "blindsearch",
    niceName: "Blind Search",
    endpointUrls: i.length
  });
  const n = t.options?.all || !1, o = t.options?.maxFeeds ?? ye, a = Le(t.options?.concurrency), c = await Ce(
    i,
    n,
    o,
    a,
    t
  );
  return t.emit("end", { module: "blindsearch", feeds: c.feeds }), c.feeds;
}
async function Ce(t, e, r, s, i, n) {
  const o = [], a = /* @__PURE__ */ new Set();
  let c = !1, d = !1, l = 0;
  const m = be(i.options?.requestDelay);
  for (; Re(l, t.length, c, d, e); ) {
    if (r > 0 && o.length >= r) {
      await q(i, o, r);
      break;
    }
    const h = Math.min(s, t.length - l), x = t.slice(l, l + h), w = await Promise.allSettled(
      x.map((u) => $e(u, i, a, o, c, d))
    );
    ({ rssFound: c, atomFound: d, i: l } = await Ne(
      w,
      o,
      c,
      d,
      { maxFeeds: r, totalUrls: t.length, i: l },
      i
    )), l += h, i.emit("log", {
      module: "blindsearch",
      totalEndpoints: t.length,
      totalCount: l,
      feedsFound: o.length
    }), m > 0 && l < t.length && await new Promise((u) => setTimeout(u, m));
  }
  return { feeds: o, rssFound: c, atomFound: d };
}
async function Ne(t, e, r, s, i, n) {
  let { i: o } = i;
  const { maxFeeds: a, totalUrls: c } = i;
  for (const d of t)
    if (d.status === "fulfilled" && d.value.found && (r = d.value.rssFound, s = d.value.atomFound, a > 0 && e.length >= a)) {
      await q(n, e, a), o = c;
      break;
    }
  return { rssFound: r, atomFound: s, i: o };
}
async function $e(t, e, r, s, i, n) {
  if (r.has(t))
    return { found: !1, rssFound: i, atomFound: n };
  r.add(t);
  try {
    const o = await y(t, "", e);
    if (o) {
      const a = ke(o, t, s, i, n);
      return i = a.rssFound, n = a.atomFound, { found: !0, rssFound: i, atomFound: n };
    }
  } catch (o) {
    const a = o instanceof Error ? o : new Error(String(o));
    await Ie(e, t, a);
  }
  return { found: !1, rssFound: i, atomFound: n };
}
async function q(t, e, r) {
  t.emit("log", {
    module: "blindsearch",
    message: `Stopped due to reaching maximum feeds limit: ${e.length} feeds found (max ${r} allowed).`
  });
}
async function Ie(t, e, r) {
  t.options?.showErrors && t.emit("error", {
    module: "blindsearch",
    error: `Error fetching ${e}: ${r.message}`,
    explanation: "An error occurred while trying to fetch a potential feed URL during blind search. This could be due to network timeouts, server errors, 404 not found, or invalid content.",
    suggestion: "This is normal during blind search as many URLs are tested. The search will continue with other potential feed endpoints."
  });
}
class E {
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
  #i;
  /**
   * Default max listeners for all instances
   * @private
   */
  static #n = 10;
  /**
   * Creates a new EventEmitter instance
   * @param {EventEmitterOptions} options - Configuration options
   */
  constructor(e = {}) {
    this.#t = e.maxListeners ?? E.#n, this.#i = e.captureAsyncErrors ?? !0;
  }
  /**
   * Sets the default maximum number of listeners for all new EventEmitter instances
   * @param {number} n - The maximum number of listeners (0 = unlimited)
   */
  static setDefaultMaxListeners(e) {
    if (typeof e != "number" || e < 0 || !Number.isInteger(e))
      throw new TypeError("Max listeners must be a non-negative integer");
    E.#n = e;
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
  #o(e) {
    if (this.#t > 0) {
      const r = this.listenerCount(e);
      r > this.#t && console.warn(
        `Warning: Possible EventEmitter memory leak detected. ${r} ${e} listeners added. Use emitter.setMaxListeners() to increase limit`
      );
    }
  }
  /**
   * Converts an error to a string representation
   * Handles Error objects, plain objects with error properties, and other types
   * @private
   */
  #a(e) {
    if (e instanceof Error)
      return e.message;
    if (typeof e == "object" && e !== null) {
      const r = e;
      if (typeof r.error == "string") return r.error;
      if (typeof r.message == "string") return r.message;
      try {
        return JSON.stringify(r);
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
  #l(e, r) {
    if (r === "error")
      throw console.error("Error in error event listener:", this.#a(e)), e;
    const s = this.#e.get("error");
    if (s && s.size > 0)
      this.emit("error", e, r);
    else
      throw console.error(`Unhandled error in event listener for '${r}':`, e), e;
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
  on(e, r) {
    this.#r(e), this.#s(r);
    const s = this.#e.get(e);
    return s ? s.add(r) : this.#e.set(e, /* @__PURE__ */ new Set([r])), this.#o(e), this;
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
  prependListener(e, r) {
    this.#r(e), this.#s(r);
    const s = this.#e.get(e);
    if (s) {
      const i = /* @__PURE__ */ new Set([r, ...s]);
      this.#e.set(e, i);
    } else
      this.#e.set(e, /* @__PURE__ */ new Set([r]));
    return this.#o(e), this;
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
  once(e, r) {
    this.#r(e), this.#s(r);
    const s = ((...i) => {
      this.off(e, s), r(...i);
    });
    return s.originalListener = r, this.on(e, s);
  }
  /**
   * Adds a one-time event listener to the beginning of the listeners array
   * @param {string} event - The name of the event to listen for
   * @param {EventListener} listener - The function to call when the event is emitted
   * @returns {EventEmitter} The instance for method chaining
   * @throws {TypeError} When event is not a non-empty string or listener is not a function
   */
  prependOnceListener(e, r) {
    this.#r(e), this.#s(r);
    const s = ((...i) => {
      this.off(e, s), r(...i);
    });
    return s.originalListener = r, this.prependListener(e, s);
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
  emit(e, ...r) {
    const s = this.#e.get(e);
    if (!s || s.size === 0) {
      if (e === "error") {
        const i = r[0];
        if (i instanceof Error)
          throw i;
        {
          const n = this.#a(i);
          throw new Error(`Unhandled error event: ${n}`);
        }
      }
      return !1;
    }
    return [...s].forEach((i) => {
      try {
        const n = i(...r);
        this.#i && n instanceof Promise && n.catch((o) => {
          this.#l(o, e);
        });
      } catch (n) {
        this.#l(n, e);
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
  off(e, r) {
    const s = this.#e.get(e);
    return s ? ([...s].forEach((i) => {
      (i === r || i.originalListener === r) && s.delete(i);
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
    const r = this.#e.get(e);
    return r ? r.size : 0;
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
    const r = this.#e.get(e);
    return r ? [...r].map((s) => s.originalListener || s) : [];
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
    const r = this.#e.get(e);
    return r ? [...r] : [];
  }
  /**
   * Returns an array of event names that have listeners
   * @returns {Array<string>} Array of event names
   */
  eventNames() {
    return Array.from(this.#e.keys());
  }
}
const { queue: Fe } = X, Oe = /* @__PURE__ */ new Set([
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
]);
function _e(t) {
  const e = t.lastIndexOf(".");
  return e !== -1 && Oe.has(t.slice(e).toLowerCase());
}
class De extends E {
  constructor(e, r = {}) {
    const {
      maxDepth: s = 3,
      concurrency: i = 5,
      maxLinks: n = 1e3,
      checkForeignFeeds: o = !1,
      maxErrors: a = 5,
      maxFeeds: c = 0,
      instance: d = null,
      insecure: l = !1
    } = r;
    super();
    try {
      const m = new URL(e);
      this.startUrl = m.href;
    } catch {
      throw new Error(`Invalid start URL: ${e}`);
    }
    this.maxDepth = s, this.concurrency = i, this.maxLinks = n, this.mainDomain = $.getDomain(this.startUrl), this.checkForeignFeeds = o, this.maxErrors = a, this.maxFeeds = c, this.errorCount = 0, this.instance = d, this.queue = Fe(this.crawlPage.bind(this), this.concurrency), this.visitedUrls = /* @__PURE__ */ new Set(), this.timeout = 5e3, this.insecure = l, this.maxLinksReachedMessageEmitted = !1, this.feeds = [], this.queue.error((m) => {
      this.emit("error", {
        module: "deepSearch",
        error: `Async error: ${m}`,
        explanation: "An error occurred in the async queue while processing a crawling task. This could be due to network issues, invalid URLs, or server problems.",
        suggestion: "Check network connectivity and ensure the target website is accessible. The crawler will continue with other URLs."
      }), this.incrementError();
    });
  }
  /**
   * Increments the error counter and kills the queue if the limit is reached.
   * @returns {boolean} True if the error limit has been reached, false otherwise.
   * @private
   */
  incrementError() {
    return this.errorCount >= this.maxErrors ? !0 : (this.errorCount++, this.errorCount >= this.maxErrors ? (this.queue.kill(), this.emit("log", {
      module: "deepSearch",
      message: `Stopped due to ${this.errorCount} errors (max ${this.maxErrors} allowed).`
    }), !0) : !1);
  }
  /**
   * Starts the crawling process
   */
  start() {
    this.queue.push({ url: this.startUrl, depth: 0 }), this.emit("start", { module: "deepSearch", niceName: "Deep Search" });
  }
  /**
   * Checks if a URL is valid (same domain, not excluded file type)
   * @param {string} url - The URL to validate
   * @returns {boolean} True if the URL is valid, false otherwise
   */
  isValidUrl(e) {
    try {
      const r = $.getDomain(e) === this.mainDomain, s = !_e(e);
      return r && s;
    } catch {
      return this.emit("error", {
        module: "deepSearch",
        error: `Invalid URL: ${e}`,
        explanation: "A URL encountered during crawling could not be parsed or validated. This may be due to malformed URL syntax or unsupported URL schemes.",
        suggestion: "This is usually caused by broken links on the website. The crawler will skip this URL and continue with others."
      }), this.incrementError(), !1;
    }
  }
  /**
   * Emits the max links reached message and sets the flag to avoid duplicate messages.
   * @private
   */
  emitMaxLinksReached() {
    this.maxLinksReachedMessageEmitted || (this.emit("log", {
      module: "deepSearch",
      message: `Max links limit of ${this.maxLinks} reached. Stopping deep search.`
    }), this.maxLinksReachedMessageEmitted = !0);
  }
  /**
   * Handles pre-crawl checks and validations for a given URL.
   * @param {string} url - The URL to check.
   * @param {number} depth - The current crawl depth.
   * @returns {boolean} True if the crawl should continue, false otherwise.
   * @private
   */
  shouldCrawl(e, r) {
    return r > this.maxDepth || this.visitedUrls.has(e) ? !1 : this.visitedUrls.size >= this.maxLinks ? (this.emitMaxLinksReached(), !1) : this.isValidUrl(e);
  }
  /**
   * Handles fetch errors and increments the error counter.
   * @param {string} url - The URL that failed to fetch.
   * @param {number} depth - The crawl depth at which the error occurred.
   * @param {string} error - The error message.
   * @returns {boolean} True if the crawl should stop, false otherwise.
   * @private
   */
  handleFetchError(e, r, s) {
    return this.emit("log", { module: "deepSearch", url: e, depth: r, error: s }), this.incrementError();
  }
  /**
   * Processes a single link found on a page, checking if it's a feed.
   * @param {string} url - The absolute URL of the link to process.
   * @param {number} depth - The current crawl depth.
   * @returns {Promise<boolean>} True if the crawl should stop, false otherwise.
   * @private
   */
  /**
   * Records a found feed and returns true if the max feeds limit has been reached.
   */
  recordFeed(e, r, s) {
    return this.feeds.some((i) => i.url === e) ? !1 : (this.feeds.push({ url: e, type: s.type, title: s.title, feedTitle: s.title }), this.emit("log", { module: "deepSearch", url: e, depth: r + 1, feedCheck: { isFeed: !0, type: s.type } }), this.maxFeeds > 0 && this.feeds.length >= this.maxFeeds ? (this.queue.kill(), this.emit("log", {
      module: "deepSearch",
      message: `Stopped due to reaching maximum feeds limit: ${this.feeds.length} feeds found (max ${this.maxFeeds} allowed).`
    }), !0) : !1);
  }
  async processLink(e, r) {
    if (this.visitedUrls.has(e)) return !1;
    if (this.visitedUrls.size >= this.maxLinks)
      return this.emitMaxLinksReached(), !0;
    const s = this.isValidUrl(e);
    if (!s && !this.checkForeignFeeds) return !1;
    this.emit("log", {
      module: "deepSearch",
      url: e,
      depth: r,
      progress: { processed: this.visitedUrls.size, remaining: this.queue.length() }
    });
    try {
      const i = await y(e, "", this.instance || void 0);
      if (i) {
        if (this.recordFeed(e, r, i)) return !0;
      } else
        this.emit("log", { module: "deepSearch", url: e, depth: r + 1, feedCheck: { isFeed: !1 } });
    } catch (i) {
      const n = i instanceof Error ? i : new Error(String(i));
      return this.handleFetchError(e, r + 1, `Error checking feed: ${n.message}`);
    }
    return r + 1 <= this.maxDepth && s && this.queue.push({ url: e, depth: r + 1 }), !1;
  }
  /**
   * Crawls a single page, extracting links and checking for feeds
   * @param {CrawlTask} task - The task object containing the URL and depth
   * @returns {Promise<void>} A promise that resolves when the page has been crawled
   */
  async crawlPage(e) {
    let { url: r, depth: s } = e;
    if (!this.shouldCrawl(r, s)) return;
    this.visitedUrls.add(r);
    const i = await N(r, { timeout: this.timeout, insecure: this.insecure });
    if (!i) {
      this.handleFetchError(r, s, "Failed to fetch URL - timeout or network error");
      return;
    }
    if (!i.ok) {
      this.handleFetchError(r, s, `HTTP ${i.status} ${i.statusText}`);
      return;
    }
    const n = await i.text(), { document: o } = R(n), a = [];
    for (const c of o.querySelectorAll("a"))
      try {
        a.push(new URL(c.href, this.startUrl).href);
      } catch {
      }
    await Promise.allSettled(a.map((c) => this.processLink(c, s)));
  }
}
async function Pe(t, e = {}, r = null) {
  const s = new De(t, {
    maxDepth: e.depth || 3,
    maxLinks: e.maxLinks || 1e3,
    checkForeignFeeds: !!e.checkForeignFeeds,
    maxErrors: e.maxErrors || 5,
    maxFeeds: e.maxFeeds || 0,
    instance: r,
    insecure: !!e.insecure
  });
  return s.timeout = (e.timeout || 5) * 1e3, r?.emit && (s.on("start", (i) => r.emit("start", i)), s.on("log", (i) => r.emit("log", i)), s.on("error", (i) => r.emit("error", i)), s.on("end", (i) => r.emit("end", i))), s.start(), await new Promise((i) => {
    s.queue.drain(() => {
      s.emit("end", { module: "deepSearch", feeds: s.feeds, visitedUrls: s.visitedUrls.size }), i();
    });
  }), s.feeds;
}
class Xe extends E {
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
  constructor(e, r = {}) {
    super(), this.initStatus = "pending", this.rawSite = e;
    let s = e;
    s.includes("://") || (s = `https://${s}`);
    try {
      const i = new URL(s);
      this.site = i.pathname === "/" ? i.origin : i.href;
    } catch {
      this.site = s;
    }
    this.options = {
      timeout: 5,
      // Default timeout of 5 seconds
      ...r
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
    const { document: e } = R("<!DOCTYPE html><html><head></head><body></body></html>");
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
   * Handles initialization failure by setting error state and emitting events
   * @param {string} errorMessage - The error message to emit
   * @param {unknown} [cause] - Optional error cause
   * @private
   */
  handleInitError(e, r) {
    this.initStatus = "error", this.emit("error", {
      module: "FeedSeeker",
      error: e,
      ...r !== void 0 && { cause: r }
    }), this.setEmptyState(), this.emit("initialized");
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
          this.handleInitError("Site parameter must be a non-empty string");
          return;
        }
        try {
          new URL(this.site);
        } catch {
          this.handleInitError(`Invalid URL: ${this.site}`);
          return;
        }
        const e = (this.options.timeout ?? 5) * 1e3, r = await N(this.site, { timeout: e, insecure: this.options.insecure });
        if (!r.ok) {
          this.content = "", this.document = this.createEmptyDocument(), this.initStatus = "success", this.emit("initialized");
          return;
        }
        this.content = await r.text();
        const { document: s } = R(this.content);
        this.document = s, this.initStatus = "success", this.emit("initialized");
      } catch (e) {
        const r = e instanceof Error ? e : new Error(String(e)), s = this.buildErrorMessage(r), i = r.cause;
        this.handleInitError(s, i);
      }
    })(), this.initPromise;
  }
  /**
   * Builds an error message from an error object
   * @param {Error} err - The error to build a message from
   * @returns {string} The formatted error message
   * @private
   */
  buildErrorMessage(e) {
    let r = `Failed to fetch ${this.site}`;
    if (e.name === "AbortError")
      return r + ": Request timed out";
    r += `: ${e.message}`;
    const s = e.cause;
    return s && (r += ` (cause: ${s.code || s.message})`), r;
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
    return await this.initialize(), oe(this);
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
    return await this.initialize(), Me(this);
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
    return await this.initialize(), Pe(this.site, this.options, this);
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
    const r = /* @__PURE__ */ new Map();
    await this.collectFeedsFromStrategies(r), await this.handleDeepSearch(r);
    const s = this.getFeedsWithLimit(r);
    return this.emit("end", { module: "all", feeds: s }), s;
  }
  /**
   * Handles single strategy search modes (deepsearchOnly, metasearch, blindsearch, anchorsonly)
   * @returns {Promise<Feed[] | null>} Results if a single strategy mode is active, null otherwise
   * @private
   */
  async handleSingleStrategyMode() {
    const { deepsearchOnly: e, metasearch: r, blindsearch: s, anchorsonly: i } = this.options;
    return e ? this.deepSearch() : r ? this.metaLinks() : s ? this.blindSearch() : i ? this.checkAllAnchors() : null;
  }
  /**
   * Collects feeds from multiple search strategies
   * @param {Map<string, Feed>} feedMap - Map to store deduplicated feeds
   * @returns {Promise<void>}
   * @private
   */
  async collectFeedsFromStrategies(e) {
    const r = [this.metaLinks, this.checkAllAnchors, this.blindSearch];
    for (const s of r) {
      const i = await s.call(this);
      if (this.addFeedsToMap(e, i), this.hasReachedLimit(e))
        break;
    }
  }
  /**
   * Adds feeds to the feed map, deduplicating by URL
   * @param {Map<string, Feed>} feedMap - Map to store feeds
   * @param {Feed[]} feeds - Feeds to add
   * @private
   */
  addFeedsToMap(e, r) {
    for (const s of r ?? [])
      e.has(s.url) || e.set(s.url, s);
  }
  /**
   * Checks if the feed limit has been reached
   * @param {Map<string, Feed>} feedMap - Current feed map
   * @returns {boolean} True if limit is reached, false otherwise
   * @private
   */
  hasReachedLimit(e) {
    const { all: r, maxFeeds: s } = this.options;
    return !r && s !== void 0 && s > 0 && e.size >= s;
  }
  /**
   * Handles deep search if enabled
   * @param {Map<string, Feed>} feedMap - Map to store feeds
   * @private
   */
  async handleDeepSearch(e) {
    const { deepsearch: r, maxFeeds: s } = this.options;
    if (!r || s && e.size >= s)
      return;
    const i = await this.deepSearch();
    for (const n of i ?? [])
      if (e.has(n.url) || e.set(n.url, n), this.hasReachedLimit(e))
        break;
  }
  /**
   * Gets feeds from the map with limit applied
   * @param {Map<string, Feed>} feedMap - Map containing feeds
   * @returns {Feed[]} Feeds with limit applied
   * @private
   */
  getFeedsWithLimit(e) {
    const r = Array.from(e.values()), { maxFeeds: s } = this.options;
    return s !== void 0 && s > 0 && r.length > s ? r.slice(0, s) : r;
  }
}
export {
  Xe as default
};

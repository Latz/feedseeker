#!/usr/bin/env node
import { Command as Y, Option as C } from "commander";
import { parseHTML as R } from "linkedom";
import { Agent as V } from "undici";
import F from "tldts";
import G from "async";
import { styleText as B } from "node:util";
async function $(t, e = {}) {
  let r, s, n = !1;
  if (typeof e == "number")
    r = e, s = {};
  else {
    const { timeout: l = 5e3, insecure: u = !1, ...c } = e;
    r = l, n = u, s = c;
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
  const i = new AbortController(), o = setTimeout(() => i.abort(), r), a = {
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
  }, x = n ? new V({ connect: { rejectUnauthorized: !1 } }) : void 0;
  try {
    const l = await fetch(t, {
      ...s,
      signal: i.signal,
      headers: a,
      ...x ? { dispatcher: x } : {}
    });
    return clearTimeout(o), l;
  } catch (l) {
    throw clearTimeout(o), l instanceof Error && l.name === "AbortError" ? new Error(`Request to ${t} timed out after ${r}ms`) : l;
  }
}
const h = {
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
}, d = {
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
function J(t) {
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
function K(t) {
  if (t.length > h.MAX_CONTENT_SIZE)
    throw new Error(
      `Content too large: ${t.length} bytes. Maximum allowed: ${h.MAX_CONTENT_SIZE} bytes.`
    );
}
function Q(t) {
  return t == null ? h.DEFAULT_TIMEOUT : !Number.isFinite(t) || t < h.MIN_TIMEOUT ? (console.warn(
    `Invalid timeout value ${t}. Using minimum: ${h.MIN_TIMEOUT} seconds.`
  ), h.MIN_TIMEOUT) : t > h.MAX_TIMEOUT ? (console.warn(
    `Timeout value ${t} exceeds maximum. Clamping to ${h.MAX_TIMEOUT} seconds.`
  ), h.MAX_TIMEOUT) : Math.floor(t);
}
function Z(t) {
  return M.URL_PATTERNS.some((e) => t.includes(e));
}
function ee(t) {
  return !!(t.type && M.TYPES.includes(t.type) && M.VERSIONS.includes(t.version) || t.type && t.version && t.html);
}
function N(t) {
  return t.replaceAll(d.CDATA, "$1");
}
function _(t) {
  return t ? t.replaceAll(/\s+/g, " ").trim() : null;
}
async function y(t, e = "", r) {
  if (J(t), Z(t))
    return null;
  if (!e) {
    if (!r)
      throw new Error("Instance parameter is required when content is not provided");
    const i = Q(r.options.timeout) * 1e3, o = await $(t, { timeout: i, insecure: r.options.insecure });
    if (!o.ok)
      throw new Error(`Failed to fetch ${t}: ${o.status} ${o.statusText}`);
    e = await o.text();
  }
  return K(e), re(e) || se(e) || ne(e) || null;
}
function te(t) {
  const e = d.RSS.CHANNEL_CONTENT.exec(t);
  if (e) {
    const n = e[1], i = d.RSS.TITLE.exec(n);
    return i ? _(N(i[1])) : null;
  }
  const r = d.RSS.TITLE.exec(t);
  return r ? _(N(r[1])) : null;
}
function re(t) {
  if (d.RSS.VERSION.test(t)) {
    const e = d.RSS.CHANNEL.test(t), r = d.RSS.ITEM.test(t), s = d.RSS.DESCRIPTION.test(t);
    if (e && s && (r || d.RSS.CHANNEL_END.test(t)))
      return { type: "rss", title: te(t) };
  }
  return null;
}
function se(t) {
  const e = d.ATOM.NAMESPACE_XMLNS.test(t) || d.ATOM.NAMESPACE_XMLNS_ATOM.test(t) || d.ATOM.NAMESPACE_ATOM_PREFIX.test(t);
  if (d.ATOM.FEED_START.test(t) && e) {
    const r = d.ATOM.ENTRY.test(t), s = d.ATOM.TITLE_TAG.test(t);
    if (r && s) {
      const n = d.ATOM.TITLE_CONTENT.exec(t);
      return { type: "atom", title: n ? _(N(n[1])) : null };
    }
  }
  return null;
}
function ne(t) {
  try {
    const e = JSON.parse(t);
    if (ee(e))
      return null;
    if (e.version && typeof e.version == "string" && e.version.includes("jsonfeed") || e.items && Array.isArray(e.items) || e.feed_url) {
      const r = e.title || e.name || null;
      return { type: "json", title: typeof r == "string" ? _(r) : null };
    }
    return null;
  } catch {
    return null;
  }
}
const ie = ["feed+json", "rss+xml", "atom+xml", "xml", "rdf+xml"], oe = ["/rss", "/feed", "/atom", ".rss", ".atom", ".xml", ".json"];
function me(t) {
  return t ? t.replaceAll(/\s+/g, " ").trim() : null;
}
async function T(t, e, r, s, n = 5) {
  const i = e.options?.maxFeeds || 0;
  for (let o = 0; o < t.length; o += n) {
    if (i > 0 && r.length >= i)
      return !0;
    const m = t.slice(o, o + n);
    await Promise.allSettled(
      m.map(async (a) => {
        i > 0 && r.length >= i || await xe(a, e, r, s);
      })
    );
  }
  return i > 0 && r.length >= i;
}
function ae(t, e) {
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
function le(t, e, r, s, n, i) {
  s.push({
    url: t,
    title: me(e.title),
    type: r.type,
    feedTitle: r.title
  }), n.add(t);
  const o = i.options?.maxFeeds || 0;
  return o > 0 && s.length >= o ? (i.emit("log", {
    module: "metalinks",
    message: `Stopped due to reaching maximum feeds limit: ${s.length} feeds found (max ${o} allowed).`
  }), !0) : !1;
}
async function xe(t, e, r, s) {
  const n = ae(t, e);
  if (!(!n || s.has(n))) {
    e.emit("log", { module: "metalinks", message: `Checking feed: ${n}` });
    try {
      const i = await y(n, "", e);
      i && le(n, t, i, r, s, e);
    } catch (i) {
      if (e.options?.showErrors) {
        const o = i instanceof Error ? i : new Error(String(i));
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
async function ce(t) {
  t.emit("start", { module: "metalinks", niceName: "Meta Links" });
  const e = [], r = /* @__PURE__ */ new Set();
  try {
    const s = ie.map((x) => `link[type="application/${x}"]`).join(", "), n = Array.from(
      t.document.querySelectorAll(s)
    );
    if (await T(n, t, e, r))
      return e;
    const o = Array.from(
      t.document.querySelectorAll('link[rel="alternate"][type*="rss"], link[rel="alternate"][type*="xml"], link[rel="alternate"][type*="atom"], link[rel="alternate"][type*="json"]')
    );
    if (await T(o, t, e, r))
      return e;
    const a = Array.from(
      t.document.querySelectorAll('link[rel="alternate"]')
    ).filter(
      (x) => x.href && oe.some((l) => x.href.toLowerCase().includes(l))
    );
    return await T(a, t, e, r), e;
  } finally {
    t.emit("end", { module: "metalinks", feeds: e });
  }
}
function S(t, e) {
  try {
    return new URL(t, e);
  } catch {
    return null;
  }
}
function de(t) {
  const e = S(t);
  return e ? e.protocol === "http:" || e.protocol === "https:" : !1;
}
function Be(t) {
  return S(t) ? !1 : !t.includes("://");
}
const I = /* @__PURE__ */ new Set([
  "feedburner.com",
  "feeds.feedburner.com",
  "feedproxy.google.com",
  "feeds2.feedburner.com"
]);
function z(t, e) {
  const r = S(t);
  return !r || r.hostname === e.hostname ? !0 : I.has(r.hostname) || [...I].some((s) => r.hostname.endsWith("." + s));
}
function fe(t) {
  if (t.options.followMetaRefresh && t.document && typeof t.document.querySelector == "function") {
    const e = t.document.querySelector('meta[http-equiv="refresh"]')?.getAttribute("content");
    if (e) {
      const r = /url=(.*)/i.exec(e);
      if (r?.[1]) {
        const s = new URL(r[1], t.site).href;
        return t.emit("log", {
          module: "anchors",
          message: `Following meta refresh redirect to ${s}`
        }), q({ ...t, site: s });
      }
    }
  }
  return null;
}
function ue(t, e, r) {
  if (!t.href)
    return null;
  if (de(t.href))
    return t.href;
  if (Be(t.href)) {
    const s = S(t.href, e);
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
  for (const n of r) {
    let i = n;
    for (; i.length > 0 && ".,;:!?".includes(i.at(-1)); )
      i = i.slice(0, -1);
    s.add(i);
  }
  return Array.from(s);
}
async function pe(t, e, r) {
  const { instance: s, feedUrls: n } = r;
  try {
    const i = await y(e, "", s);
    i && n.push({
      url: e,
      title: t.textContent?.trim() || null,
      type: i.type,
      feedTitle: i.title
    });
  } catch (i) {
    if (s.options?.showErrors) {
      const o = i instanceof Error ? i : new Error(String(i));
      s.emit("error", {
        module: "anchors",
        error: `Error checking feed at ${e}: ${o.message}`,
        explanation: "An error occurred while trying to fetch and validate a potential feed URL found in an anchor tag. This could be due to network timeouts, server errors, or invalid feed content.",
        suggestion: "Check if the URL is accessible and returns valid feed content. Network connectivity issues or server problems may cause this error."
      });
    }
  }
}
function P(t, e, r) {
  t.emit("log", {
    module: "anchors",
    message: `Stopped due to reaching maximum feeds limit: ${e} feeds found (max ${r} allowed).`
  });
}
async function ge(t, e, r, s) {
  let n = 0;
  for (let i = 0; i < t.length; i += r) {
    if (s > 0 && e.feedUrls.length >= s) {
      P(e.instance, e.feedUrls.length, s);
      break;
    }
    const o = t.slice(i, i + r);
    await Promise.allSettled(
      o.map(async ({ anchor: m, url: a }) => {
        s > 0 && e.feedUrls.length >= s || (n++, e.instance.emit("log", { module: "anchors", totalCount: n, totalEndpoints: t.length }), await pe(m, a, e));
      })
    );
  }
  return n;
}
async function we(t, e, r, s, n, i) {
  const o = t.instance.document.body?.innerHTML || "", m = he(o), a = new Set(t.feedUrls.map((c) => c.url)), x = [];
  for (const c of m)
    !a.has(c) && z(c, e) && (x.push(c), a.add(c));
  let l = s;
  const u = r + x.length;
  for (let c = 0; c < x.length; c += n) {
    if (i > 0 && t.feedUrls.length >= i) {
      P(t.instance, t.feedUrls.length, i);
      break;
    }
    const b = x.slice(c, c + n);
    await Promise.allSettled(
      b.map(async (g) => {
        if (!(i > 0 && t.feedUrls.length >= i)) {
          t.instance.emit("log", { module: "anchors", totalCount: l++, totalEndpoints: u });
          try {
            const f = await y(g, "", t.instance);
            f && t.feedUrls.push({ url: g, title: null, type: f.type, feedTitle: f.title });
          } catch (f) {
            if (t.instance.options?.showErrors) {
              const W = f instanceof Error ? f : new Error(String(f));
              t.instance.emit("error", {
                module: "anchors",
                error: `Error checking feed at ${g}: ${W.message}`,
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
async function q(t) {
  const e = fe(t);
  if (e)
    return e;
  const r = new URL(t.site), s = t.document.querySelectorAll("a"), n = [];
  for (const x of s) {
    const l = ue(x, r, t);
    l && z(l, r) && n.push({ anchor: x, url: l });
  }
  const i = t.options?.maxFeeds || 0, o = t.options?.concurrency ?? 3, m = { instance: t, baseUrl: r, feedUrls: [] }, a = await ge(n, m, o, i);
  return (i === 0 || m.feedUrls.length < i) && await we(m, r, n.length, a + 1, o, i), m.feedUrls;
}
async function ye(t) {
  t.emit("start", {
    module: "anchors",
    niceName: "Check All Anchors"
  });
  const e = await q(t);
  return t.emit("end", { module: "anchors", feeds: e }), e;
}
const Ee = ["feed", "rss", "atom", "feed.xml", "rss.xml", "atom.xml", "index.xml", "feeds", ".rss", ".atom", ".xml", "?feed=rss2", "?feed=atom", "feed/rss/", "feed/atom/", "blog/feed", "blog/rss", "feed.json", "rss.php", "feed.php", "news/rss", "latest/feed", "?format=rss", "?format=feed"], _e = ["rssfeed.xml", "feed.rss", "feed.atom", "feeds/", "rss/", "index.rss", "index.atom", "rss/index.xml", "atom/index.xml", "syndication/", "rssfeed.rdf", "&_rss=1", "blog/atom", "blog/feeds", "blog?format=rss", "blog-feed.xml", "weblog/atom", "weblog/rss", "?format=feed", "feed/rdf/", "feed/rss2/", "wp-atom.php", "wp-feed.php", "wp-rdf.php", "wp-rss.php", "wp-rss2.php", "index.php?format=feed", "articles/feed", "atom/news/", "latest.rss", "news.xml", "news/atom", "rss/articles/", "rss/latest/", "rss/news/", "rss/news/rss.xml", "rss/rss.php", "api/feed", "api/rss", "api/atom", "api/rss.xml", "api/feed.xml", "api/v1/feed", "api/v2/feed", "v1/feed", "v2/feed", "feed.aspx", "rss.aspx", "rss.cfm", "feed.jsp", "feed.pl", "feed.py", "feed.rb", "feed/atom", "feed/rdf", "feed/atom.rss", "feed/atom.xml", "feed/rss.xml", "feed/rss2", "posts.rss", "_site/feed.xml", "build/feed.xml", "dist/feed.xml", "out/feed.xml", "?atom=1", "?rss=1", "?feed=atom", "?feed=rss", "?format=atom", "?output=rss", "?output=atom", "?type=rss", "?type=atom", "?view=feed", "?view=rss"], Se = ["atomfeed", "jsonfeed", "newsfeed", "rssfeed", "feeds.json", "feeds.php", "feeds.xml", ".json", ".opml", ".rdf", "opml", "opml/", "rdf", "rdf/", "feed.cml", "feed.csv", "feed.txt", "feed.yaml", "feed.yml", "?download=atom", "?download=rss", "?export=atom", "?export=rss", "?syndicate=atom", "?syndicate=rss", "export/rss.xml", "extern.php?action=feed&type=atom", "external?type=rss2", "index.php?action=.xml;type=rss", "public/feed.xml", "spip.php?page=backend", "spip.php?page=backend-breve", "spip.php?page=backend-sites", "syndicate/rss.xml", "syndication.php", "xml", "sitenews", "api/mobile/feed", "catalog.xml", "catalog/feed", "deals.xml", "deals/feed", "inventory.rss", "inventory/feed", "products.rss", "products/atom", "products/rss", "promotions/feed", "specials/feed", "audio/feed", "episodes.rss", "episodes/feed", "gallery.rss", "media/feed", "podcast.rss", "podcast/atom", "podcast/rss", "podcasts/feed", "shows/feed", "video/feed", "videos.rss", "comments/feed", "community/feed", "discussions/feed", "forum.rss", "forum/atom", "forum/rss", "reviews/feed", "agenda/feed", "calendar/feed", "events.rss", "events/feed", "schedule/feed", "careers/feed", "jobs.rss", "jobs/feed", "opportunities/feed", "vacancies/feed", "content/feed", "documents/feed", "pages/feed", "resources/feed", "emails/feed", "mailinglist/feed", "newsletter/feed", "subscription/feed", "category/*/feed", "tag/*/feed", "tags/feed", "topics/feed", "author/*/feed", "profile/*/feed", "user/*/feed", "archive/feed", "daily/feed", "monthly/feed", "weekly/feed", "yearly/feed", "announcements/feed", "changelog/feed", "press/feed", "updates/feed", "revisions/feed", "app/feed", "mobile/feed", "international/feed", "local/feed", "national/feed", "regional/feed", "education/feed", "entertainment/feed", "finance/feed", "health/feed", "industry/feed", "market/feed", "science/feed", "sector/feed", "sports/feed", "technology/feed", "aggregate/feed", "all/feed", "combined/feed", "compilation/feed", "everything/feed", "actualites/feed", "nachrichten/feed", "nieuws/feed", "noticias/feed", "novosti/feed", "cms/feed", "contentful/feed", "sanity/feed", "strapi/feed", "docs/feed", "documentation/feed", "help/feed", "kb/feed", "support/feed", "wiki/feed", "branches/feed", "commits/feed", "issues/feed", "pull-requests/feed", "releases/feed", "tags/feed", "analytics/feed", "metrics/feed", "reports/feed", "stats/feed", "de/feed", "en/feed", "es/feed", "fr/feed", "it/feed", "ja/feed", "ko/feed", "pt/feed", "ru/feed", "zh/feed", "drupal/feed", "joomla/feed", "magento/feed", "opencart/feed", "prestashop/feed", "shopify/feed", "typo3/feed", "woocommerce/feed", "discourse/feed", "invision/feed", "phpbb/feed", "vbulletin/feed", "xenforo/feed"], p = {
  essential: Ee,
  standard: _e,
  comprehensive: Se
}, be = 0, L = 0, Te = 3, A = "standard", j = 2083, k = 10, v = 1, O = 1e4, U = 6e4;
function Le(t) {
  switch (t) {
    case "fast":
      return p.essential;
    case "standard":
      return [...p.essential, ...p.standard];
    case "exhaustive":
    case "full":
      return [
        ...p.essential,
        ...p.standard,
        ...p.comprehensive
      ];
    default:
      return [...p.essential, ...p.standard];
  }
}
function Ae(t) {
  return t ? ["fast", "standard", "exhaustive", "full"].includes(t) ? t : (console.warn(`Invalid search mode "${t}". Falling back to "${A}".`), A) : A;
}
function ke(t) {
  return t == null ? Te : !Number.isFinite(t) || t < v ? (console.warn(`Invalid concurrency value ${t}. Using minimum: ${v}.`), v) : t > k ? (console.warn(
    `Concurrency value ${t} exceeds maximum. Clamping to ${k}.`
  ), k) : Math.floor(t);
}
function ve(t) {
  return t == null ? L : !Number.isFinite(t) || t < 0 ? (console.warn(`Invalid request delay ${t}. Using default: ${L}.`), L) : t > U ? (console.warn(`Request delay ${t}ms exceeds maximum. Clamping to ${U}ms.`), U) : Math.floor(t);
}
function H(t) {
  return t.length <= j;
}
function Ue(t) {
  let e;
  try {
    e = new URL(t);
  } catch {
    throw new Error(`Invalid URL provided to blindSearch: ${t}`);
  }
  if (!H(t))
    throw new Error(
      `URL too long (${t.length} chars). Maximum allowed: ${j} characters.`
    );
  if (!["http:", "https:"].includes(e.protocol))
    throw new Error(`Invalid protocol "${e.protocol}". Only http: and https: are allowed.`);
  return e;
}
function Re(t, e, r, s) {
  for (const n of e) {
    if (s.length >= O)
      return console.warn(
        `URL generation limit reached (${O} URLs). Stopping to prevent resource exhaustion.`
      ), !1;
    const i = r ? `${t}/${n}${r}` : `${t}/${n}`;
    H(i) ? s.push(i) : console.warn(`Skipping URL (too long): ${i.substring(0, 100)}...`);
  }
  return !0;
}
function Me(t, e, r) {
  const s = Ue(t), n = s.origin, i = e ? s.search : "";
  let o = t;
  const m = [];
  for (; o.length >= n.length; ) {
    const a = o.endsWith("/") ? o.slice(0, -1) : o;
    if (!Re(a, r, i, m)) break;
    o = o.slice(0, o.lastIndexOf("/"));
  }
  return m;
}
function Ne(t, e, r, s, n) {
  return t.type === "rss" ? s = !0 : t.type === "atom" && (n = !0), r.push({
    url: e,
    title: null,
    // No link element title in blind search (unlike metaLinks)
    type: t.type,
    feedTitle: t.title
    // Actual feed title from parsing the feed
  }), { rssFound: s, atomFound: n };
}
function $e(t, e, r, s, n) {
  return t >= e ? !1 : n ? !0 : !(r && s);
}
async function Ce(t, e) {
  const r = Ae(t.options?.searchMode), s = Le(r), n = Me(
    t.site,
    t.options?.keepQueryParams || !1,
    s
  );
  t.emit("start", {
    module: "blindsearch",
    niceName: "Blind Search",
    endpointUrls: n.length
  });
  const i = t.options?.all || !1, o = t.options?.maxFeeds ?? be, m = ke(t.options?.concurrency), a = await Fe(
    n,
    i,
    o,
    m,
    t
  );
  return t.emit("end", { module: "blindsearch", feeds: a.feeds }), a.feeds;
}
async function Fe(t, e, r, s, n, i) {
  const o = [], m = /* @__PURE__ */ new Set();
  let a = !1, x = !1, l = 0;
  const u = ve(n.options?.requestDelay);
  for (; $e(l, t.length, a, x, e); ) {
    if (r > 0 && o.length >= r) {
      await X(n, o, r);
      break;
    }
    const c = Math.min(s, t.length - l), b = t.slice(l, l + c), g = await Promise.allSettled(
      b.map((f) => Oe(f, n, m, o, a, x))
    );
    ({ rssFound: a, atomFound: x, i: l } = await Ie(
      g,
      o,
      a,
      x,
      { maxFeeds: r, totalUrls: t.length, i: l },
      n
    )), l += c, n.emit("log", {
      module: "blindsearch",
      totalEndpoints: t.length,
      totalCount: l,
      feedsFound: o.length
    }), u > 0 && l < t.length && await new Promise((f) => setTimeout(f, u));
  }
  return { feeds: o, rssFound: a, atomFound: x };
}
async function Ie(t, e, r, s, n, i) {
  let { i: o } = n;
  const { maxFeeds: m, totalUrls: a } = n;
  for (const x of t)
    if (x.status === "fulfilled" && x.value.found && (r = x.value.rssFound, s = x.value.atomFound, m > 0 && e.length >= m)) {
      await X(i, e, m), o = a;
      break;
    }
  return { rssFound: r, atomFound: s, i: o };
}
async function Oe(t, e, r, s, n, i) {
  if (r.has(t))
    return { found: !1, rssFound: n, atomFound: i };
  r.add(t);
  try {
    const o = await y(t, "", e);
    if (o) {
      const m = Ne(o, t, s, n, i);
      return n = m.rssFound, i = m.atomFound, { found: !0, rssFound: n, atomFound: i };
    }
  } catch (o) {
    const m = o instanceof Error ? o : new Error(String(o));
    await De(e, t, m);
  }
  return { found: !1, rssFound: n, atomFound: i };
}
async function X(t, e, r) {
  t.emit("log", {
    module: "blindsearch",
    message: `Stopped due to reaching maximum feeds limit: ${e.length} feeds found (max ${r} allowed).`
  });
}
async function De(t, e, r) {
  t.options?.showErrors && t.emit("error", {
    module: "blindsearch",
    error: `Error fetching ${e}: ${r.message}`,
    explanation: "An error occurred while trying to fetch a potential feed URL during blind search. This could be due to network timeouts, server errors, 404 not found, or invalid content.",
    suggestion: "This is normal during blind search as many URLs are tested. The search will continue with other potential feed endpoints."
  });
}
class w {
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
  #n;
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
    this.#t = e.maxListeners ?? w.#i, this.#n = e.captureAsyncErrors ?? !0;
  }
  /**
   * Sets the default maximum number of listeners for all new EventEmitter instances
   * @param {number} n - The maximum number of listeners (0 = unlimited)
   */
  static setDefaultMaxListeners(e) {
    if (typeof e != "number" || e < 0 || !Number.isInteger(e))
      throw new TypeError("Max listeners must be a non-negative integer");
    w.#i = e;
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
  #m(e) {
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
  #a(e, r) {
    if (r === "error")
      throw console.error("Error in error event listener:", this.#m(e)), e;
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
      const n = /* @__PURE__ */ new Set([r, ...s]);
      this.#e.set(e, n);
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
    const s = ((...n) => {
      this.off(e, s), r(...n);
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
    const s = ((...n) => {
      this.off(e, s), r(...n);
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
        const n = r[0];
        if (n instanceof Error)
          throw n;
        {
          const i = this.#m(n);
          throw new Error(`Unhandled error event: ${i}`);
        }
      }
      return !1;
    }
    return [...s].forEach((n) => {
      try {
        const i = n(...r);
        this.#n && i instanceof Promise && i.catch((o) => {
          this.#a(o, e);
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
  off(e, r) {
    const s = this.#e.get(e);
    return s ? ([...s].forEach((n) => {
      (n === r || n.originalListener === r) && s.delete(n);
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
const { queue: ze } = G, Pe = /* @__PURE__ */ new Set([
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
function qe(t) {
  const e = t.lastIndexOf(".");
  return e !== -1 && Pe.has(t.slice(e).toLowerCase());
}
class je extends w {
  constructor(e, r = {}) {
    const {
      maxDepth: s = 3,
      concurrency: n = 5,
      maxLinks: i = 1e3,
      checkForeignFeeds: o = !1,
      maxErrors: m = 5,
      maxFeeds: a = 0,
      instance: x = null,
      insecure: l = !1
    } = r;
    super();
    try {
      const u = new URL(e);
      this.startUrl = u.href;
    } catch {
      throw new Error(`Invalid start URL: ${e}`);
    }
    this.maxDepth = s, this.concurrency = n, this.maxLinks = i, this.mainDomain = F.getDomain(this.startUrl), this.checkForeignFeeds = o, this.maxErrors = m, this.maxFeeds = a, this.errorCount = 0, this.instance = x, this.queue = ze(this.crawlPage.bind(this), this.concurrency), this.visitedUrls = /* @__PURE__ */ new Set(), this.timeout = 5e3, this.insecure = l, this.maxLinksReachedMessageEmitted = !1, this.feeds = [], this.queue.error((u) => {
      this.emit("error", {
        module: "deepSearch",
        error: `Async error: ${u}`,
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
      const r = F.getDomain(e) === this.mainDomain, s = !qe(e);
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
    return this.feeds.some((n) => n.url === e) ? !1 : (this.feeds.push({ url: e, type: s.type, title: s.title, feedTitle: s.title }), this.emit("log", { module: "deepSearch", url: e, depth: r + 1, feedCheck: { isFeed: !0, type: s.type } }), this.maxFeeds > 0 && this.feeds.length >= this.maxFeeds ? (this.queue.kill(), this.emit("log", {
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
      const n = await y(e, "", this.instance || void 0);
      if (n) {
        if (this.recordFeed(e, r, n)) return !0;
      } else
        this.emit("log", { module: "deepSearch", url: e, depth: r + 1, feedCheck: { isFeed: !1 } });
    } catch (n) {
      const i = n instanceof Error ? n : new Error(String(n));
      return this.handleFetchError(e, r + 1, `Error checking feed: ${i.message}`);
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
    const n = await $(r, { timeout: this.timeout, insecure: this.insecure });
    if (!n) {
      this.handleFetchError(r, s, "Failed to fetch URL - timeout or network error");
      return;
    }
    if (!n.ok) {
      this.handleFetchError(r, s, `HTTP ${n.status} ${n.statusText}`);
      return;
    }
    const i = await n.text(), { document: o } = R(i), m = [];
    for (const a of o.querySelectorAll("a"))
      try {
        m.push(new URL(a.href, this.startUrl).href);
      } catch {
      }
    await Promise.allSettled(m.map((a) => this.processLink(a, s)));
  }
}
async function He(t, e = {}, r = null) {
  const s = new je(t, {
    maxDepth: e.depth || 3,
    maxLinks: e.maxLinks || 1e3,
    checkForeignFeeds: !!e.checkForeignFeeds,
    maxErrors: e.maxErrors || 5,
    maxFeeds: e.maxFeeds || 0,
    instance: r,
    insecure: !!e.insecure
  });
  return s.timeout = (e.timeout || 5) * 1e3, r?.emit && (s.on("start", (n) => r.emit("start", n)), s.on("log", (n) => r.emit("log", n)), s.on("error", (n) => r.emit("error", n)), s.on("end", (n) => r.emit("end", n))), s.start(), await new Promise((n) => {
    s.queue.drain(() => {
      s.emit("end", { module: "deepSearch", feeds: s.feeds, visitedUrls: s.visitedUrls.size }), n();
    });
  }), s.feeds;
}
class Xe extends w {
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
      const n = new URL(s);
      this.site = n.pathname === "/" ? n.origin : n.href;
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
        const e = (this.options.timeout ?? 5) * 1e3, r = await $(this.site, { timeout: e, insecure: this.options.insecure });
        if (!r.ok) {
          this.content = "", this.document = this.createEmptyDocument(), this.initStatus = "success", this.emit("initialized");
          return;
        }
        this.content = await r.text();
        const { document: s } = R(this.content);
        this.document = s, this.initStatus = "success", this.emit("initialized");
      } catch (e) {
        const r = e instanceof Error ? e : new Error(String(e)), s = this.buildErrorMessage(r), n = r.cause;
        this.handleInitError(s, n);
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
    return await this.initialize(), ce(this);
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
    return await this.initialize(), ye(this);
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
    return await this.initialize(), Ce(this);
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
    return await this.initialize(), He(this.site, this.options, this);
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
    const { deepsearchOnly: e, metasearch: r, blindsearch: s, anchorsonly: n } = this.options;
    return e ? this.deepSearch() : r ? this.metaLinks() : s ? this.blindSearch() : n ? this.checkAllAnchors() : null;
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
      const n = await s.call(this);
      if (this.addFeedsToMap(e, n), this.hasReachedLimit(e))
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
    const n = await this.deepSearch();
    for (const i of n ?? [])
      if (e.has(i.url) || e.set(i.url, i), this.hasReachedLimit(e))
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
const We = `\x1B[38;5;39m_\x1B[39m\x1B[38;5;39m_\x1B[39m\x1B[38;5;39m_\x1B[39m\x1B[38;5;39m_\x1B[39m\x1B[38;5;39m_\x1B[39m\x1B[38;5;39m_\x1B[39m\x1B[38;5;39m_\x1B[39m\x1B[38;5;39m_\x1B[39m\x1B[38;5;39m_\x1B[39m\x1B[38;5;38m_\x1B[39m\x1B[38;5;44m_\x1B[39m\x1B[38;5;44m_\x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;43m \x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m.\x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;84m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;119m \x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m_\x1B[39m\x1B[38;5;118m_\x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;148m \x1B[39m\x1B[38;5;184m\x1B[39m\r
\x1B[38;5;39m\\\x1B[39m\x1B[38;5;39m_\x1B[39m\x1B[38;5;39m \x1B[39m\x1B[38;5;39m \x1B[39m\x1B[38;5;39m \x1B[39m\x1B[38;5;38m_\x1B[39m\x1B[38;5;44m_\x1B[39m\x1B[38;5;44m_\x1B[39m\x1B[38;5;44m_\x1B[39m\x1B[38;5;44m_\x1B[39m\x1B[38;5;44m/\x1B[39m\x1B[38;5;44m_\x1B[39m\x1B[38;5;44m_\x1B[39m\x1B[38;5;44m_\x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;43m_\x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;49m|\x1B[39m\x1B[38;5;48m \x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m/\x1B[39m\x1B[38;5;48m \x1B[39m\x1B[38;5;48m \x1B[39m\x1B[38;5;48m \x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;84m_\x1B[39m\x1B[38;5;83m_\x1B[39m\x1B[38;5;83m/\x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m_\x1B[39m\x1B[38;5;83m_\x1B[39m\x1B[38;5;83m_\x1B[39m\x1B[38;5;83m_\x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m_\x1B[39m\x1B[38;5;119m_\x1B[39m\x1B[38;5;118m_\x1B[39m\x1B[38;5;118m_\x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m|\x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m|\x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m_\x1B[39m\x1B[38;5;154m_\x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m_\x1B[39m\x1B[38;5;154m_\x1B[39m\x1B[38;5;154m_\x1B[39m\x1B[38;5;154m_\x1B[39m\x1B[38;5;154m_\x1B[39m\x1B[38;5;154m_\x1B[39m\x1B[38;5;154m_\x1B[39m\x1B[38;5;154m_\x1B[39m\x1B[38;5;148m_\x1B[39m\x1B[38;5;184m_\x1B[39m\x1B[38;5;184m_\x1B[39m\x1B[38;5;184m \x1B[39m\x1B[38;5;184m\x1B[39m\r
\x1B[38;5;39m \x1B[39m\x1B[38;5;39m|\x1B[39m\x1B[38;5;38m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m_\x1B[39m\x1B[38;5;44m_\x1B[39m\x1B[38;5;44m)\x1B[39m\x1B[38;5;44m/\x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m_\x1B[39m\x1B[38;5;44m_\x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;43m\\\x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;49m/\x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m\\\x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m/\x1B[39m\x1B[38;5;48m \x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m \x1B[39m\x1B[38;5;48m|\x1B[39m\x1B[38;5;48m\\\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;84m_\x1B[39m\x1B[38;5;83m_\x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m\\\x1B[39m\x1B[38;5;83m_\x1B[39m\x1B[38;5;83m/\x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m_\x1B[39m\x1B[38;5;83m_\x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m\\\x1B[39m\x1B[38;5;119m_\x1B[39m\x1B[38;5;118m/\x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m_\x1B[39m\x1B[38;5;118m_\x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m\\\x1B[39m\x1B[38;5;118m|\x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;154m|\x1B[39m\x1B[38;5;154m/\x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m/\x1B[39m\x1B[38;5;154m/\x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m_\x1B[39m\x1B[38;5;154m_\x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m\\\x1B[39m\x1B[38;5;148m_\x1B[39m\x1B[38;5;184m \x1B[39m\x1B[38;5;184m \x1B[39m\x1B[38;5;184m_\x1B[39m\x1B[38;5;184m_\x1B[39m\x1B[38;5;184m \x1B[39m\x1B[38;5;184m\\\x1B[39m\x1B[38;5;184m\x1B[39m\r
\x1B[38;5;44m \x1B[39m\x1B[38;5;44m|\x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m\\\x1B[39m\x1B[38;5;44m\\\x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;43m_\x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;49m/\x1B[39m\x1B[38;5;49m\\\x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;48m/\x1B[39m\x1B[38;5;48m/\x1B[39m\x1B[38;5;48m \x1B[39m\x1B[38;5;48m/\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m/\x1B[39m\x1B[38;5;48m \x1B[39m\x1B[38;5;48m|\x1B[39m\x1B[38;5;48m/\x1B[39m\x1B[38;5;84m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m\\\x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m_\x1B[39m\x1B[38;5;119m_\x1B[39m\x1B[38;5;118m_\x1B[39m\x1B[38;5;118m/\x1B[39m\x1B[38;5;118m\\\x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m_\x1B[39m\x1B[38;5;118m_\x1B[39m\x1B[38;5;118m_\x1B[39m\x1B[38;5;118m/\x1B[39m\x1B[38;5;154m|\x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m<\x1B[39m\x1B[38;5;154m\\\x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m_\x1B[39m\x1B[38;5;148m_\x1B[39m\x1B[38;5;184m_\x1B[39m\x1B[38;5;184m/\x1B[39m\x1B[38;5;184m|\x1B[39m\x1B[38;5;184m \x1B[39m\x1B[38;5;184m \x1B[39m\x1B[38;5;184m|\x1B[39m\x1B[38;5;184m \x1B[39m\x1B[38;5;184m\\\x1B[39m\x1B[38;5;184m/\x1B[39m\x1B[38;5;184m\x1B[39m\r
\x1B[38;5;44m \x1B[39m\x1B[38;5;44m\\\x1B[39m\x1B[38;5;44m_\x1B[39m\x1B[38;5;44m_\x1B[39m\x1B[38;5;44m_\x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m/\x1B[39m\x1B[38;5;43m \x1B[39m\x1B[38;5;49m\\\x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m>\x1B[39m\x1B[38;5;49m\\\x1B[39m\x1B[38;5;49m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m \x1B[39m\x1B[38;5;48m \x1B[39m\x1B[38;5;48m>\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;48m_\x1B[39m\x1B[38;5;84m \x1B[39m\x1B[38;5;83m/\x1B[39m\x1B[38;5;83m_\x1B[39m\x1B[38;5;83m_\x1B[39m\x1B[38;5;83m_\x1B[39m\x1B[38;5;83m_\x1B[39m\x1B[38;5;83m_\x1B[39m\x1B[38;5;83m_\x1B[39m\x1B[38;5;83m_\x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m/\x1B[39m\x1B[38;5;119m\\\x1B[39m\x1B[38;5;118m_\x1B[39m\x1B[38;5;118m_\x1B[39m\x1B[38;5;118m_\x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m>\x1B[39m\x1B[38;5;118m\\\x1B[39m\x1B[38;5;118m_\x1B[39m\x1B[38;5;118m_\x1B[39m\x1B[38;5;154m_\x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m>\x1B[39m\x1B[38;5;154m_\x1B[39m\x1B[38;5;154m_\x1B[39m\x1B[38;5;154m|\x1B[39m\x1B[38;5;154m_\x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m\\\x1B[39m\x1B[38;5;148m\\\x1B[39m\x1B[38;5;184m_\x1B[39m\x1B[38;5;184m_\x1B[39m\x1B[38;5;184m_\x1B[39m\x1B[38;5;184m \x1B[39m\x1B[38;5;184m \x1B[39m\x1B[38;5;184m>\x1B[39m\x1B[38;5;184m_\x1B[39m\x1B[38;5;184m_\x1B[39m\x1B[38;5;184m|\x1B[39m\x1B[38;5;184m \x1B[39m\x1B[38;5;184m \x1B[39m\x1B[38;5;178m \x1B[39m\x1B[38;5;214m\x1B[39m\r
\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;44m \x1B[39m\x1B[38;5;43m\\\x1B[39m\x1B[38;5;49m/\x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m \x1B[39m\x1B[38;5;49m\\\x1B[39m\x1B[38;5;49m/\x1B[39m\x1B[38;5;48m \x1B[39m\x1B[38;5;48m \x1B[39m\x1B[38;5;48m \x1B[39m\x1B[38;5;48m \x1B[39m\x1B[38;5;48m \x1B[39m\x1B[38;5;48m\\\x1B[39m\x1B[38;5;48m/\x1B[39m\x1B[38;5;48m \x1B[39m\x1B[38;5;48m \x1B[39m\x1B[38;5;84m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m\\\x1B[39m\x1B[38;5;83m/\x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;83m \x1B[39m\x1B[38;5;119m\\\x1B[39m\x1B[38;5;118m/\x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;118m\\\x1B[39m\x1B[38;5;118m/\x1B[39m\x1B[38;5;118m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m\\\x1B[39m\x1B[38;5;154m/\x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;154m \x1B[39m\x1B[38;5;148m \x1B[39m\x1B[38;5;184m\\\x1B[39m\x1B[38;5;184m/\x1B[39m\x1B[38;5;184m \x1B[39m\x1B[38;5;184m \x1B[39m\x1B[38;5;184m \x1B[39m\x1B[38;5;184m \x1B[39m\x1B[38;5;184m\\\x1B[39m\x1B[38;5;184m/\x1B[39m\x1B[38;5;184m \x1B[39m\x1B[38;5;184m \x1B[39m\x1B[38;5;184m \x1B[39m\x1B[38;5;178m \x1B[39m\x1B[38;5;214m \x1B[39m\x1B[38;5;214m \x1B[39m\x1B[38;5;214m \x1B[39m\x1B[38;5;214m\x1B[39m`;
let E = 0;
function Ye(...t) {
  const e = t[0];
  E = 0, process.stdout.write(`Starting ${e.niceName} `);
}
function Ve(t) {
  return function(...r) {
    const s = r[0];
    t.isAllMode ? s.feeds.length === 0 ? process.stdout.write(B("yellow", ` No feeds found.
`)) : (process.stdout.write(B("green", ` Found ${s.feeds.length} feeds.
`)), console.log(JSON.stringify(s.feeds, null, 2))) : s.feeds.length === 0 ? process.stdout.write(B("yellow", ` No feeds found.
`)) : process.stdout.write(B("green", ` Found ${s.feeds.length} feeds.
`));
  };
}
async function Ge(...t) {
  const e = t[0];
  if (e.module === "metalinks" && process.stdout.write("."), (e.module === "blindsearch" || e.module === "anchors") && "totalCount" in e && "totalEndpoints" in e) {
    E > 0 && process.stdout.write(`\x1B[${E}D`);
    const r = ` (${e.totalCount}/${e.totalEndpoints})`;
    process.stdout.write(r), E = r.length;
  }
  if (e.module === "deepSearch" && "url" in e && "depth" in e && "progress" in e) {
    const r = e.progress, s = r.processed || 0, n = r.remaining || 0, i = s + n;
    try {
      const o = new URL(e.url), m = o.hostname, a = o.pathname.length > 30 ? o.pathname.substring(0, 27) + "..." : o.pathname, x = `${m}${a}`;
      process.stdout.write(`  [depth:${e.depth} ${s}/${i}] ${x}
`);
    } catch {
      process.stdout.write(`  [depth:${e.depth} ${s}/${i}]
`);
    }
  }
}
function Je(t, e, r) {
  const s = new Xe(t, e);
  return s.site = t, s.initializationError = !1, e.json || (s.on("start", Ye), s.on("log", Ge), s.on("end", Ve(r))), s.on("error", (...n) => {
    const i = n[0];
    if (typeof i == "object" && i !== null && i.module === "FeedSeeker" && (s.initializationError = !0), !e.json || e.displayErrors)
      if (i instanceof Error)
        console.error(B("red", `
Error for ${t}: ${i.message}`));
      else if (typeof i == "object" && i !== null) {
        const o = typeof i.error == "string" ? i.error : String(i);
        console.error(B("red", `
Error for ${t}: ${o}`));
      } else
        console.error(B("red", `
Error for ${t}: ${String(i)}`));
  }), s;
}
async function Ke(t, e, r) {
  t.includes("://") || (t = `https://${t}`);
  const s = Je(t, e, r);
  if (await s.initialize(), s.initializationError)
    return [];
  const n = [];
  return e.metasearch ? n.push(() => s.metaLinks()) : e.anchorsonly ? n.push(() => s.checkAllAnchors()) : e.blindsearch ? n.push(() => s.blindSearch()) : e.deepsearchOnly ? n.push(() => s.deepSearch()) : e.all ? n.push(
    () => s.metaLinks(),
    () => s.checkAllAnchors(),
    () => s.blindSearch(),
    () => s.deepSearch()
  ) : n.push(
    () => s.metaLinks(),
    () => s.checkAllAnchors(),
    () => s.blindSearch(),
    ...e.deepsearch ? [() => s.deepSearch()] : []
  ), await (async () => {
    if (e.all) {
      const m = [];
      for (const x of n) {
        const l = await x();
        l.length > 0 && m.push(...l);
      }
      return [...new Map(m.map((x) => [x.url, x])).values()];
    } else {
      for (const m of n) {
        const a = await m();
        if (a.length > 0) return a;
      }
      return [];
    }
  })();
}
function Qe(t) {
  const e = new Y();
  return e.name("feed-seeker").description("Find RSS, Atom, and JSON feeds on any website with FeedSeeker."), e.command("version").description("Get version").action(async () => {
    const s = (await import("./package-DxC7lVBq.js")).default;
    process.stdout.write(`${s.version}
`);
  }), e.argument("[site]", "The website URL to search for feeds").option("-m, --metasearch", "Meta search only").option("-b, --blindsearch", "Blind search only").option("-a, --anchorsonly", "Anchors search only").option("-d, --deepsearch", "Enable deep search").option("--all", "Execute all strategies and combine results").option("--json", "Output feeds as JSON only (suppresses logging)").option("--deepsearch-only", "Deep search only").option(
    "--depth <number>",
    "Depth of deep search",
    (r) => {
      const s = parseInt(r, 10);
      if (Number.isNaN(s) || s < 1)
        throw new Error("Depth must be a positive number (minimum 1)");
      return s;
    },
    3
  ).option(
    "--max-links <number>",
    "Maximum number of links to process during deep search",
    (r) => {
      const s = parseInt(r, 10);
      if (Number.isNaN(s) || s < 1)
        throw new Error("Max links must be a positive number (minimum 1)");
      return s;
    },
    1e3
  ).option(
    "--timeout <seconds>",
    "Timeout for fetch requests in seconds",
    (r) => {
      const s = parseInt(r, 10);
      if (Number.isNaN(s) || s < 1)
        throw new Error("Timeout must be a positive number (minimum 1 second)");
      return s;
    },
    5
  ).option("--keep-query-params", "Keep query parameters from the original URL when searching").option(
    "--check-foreign-feeds",
    "Check if foreign domain URLs are feeds (but don't crawl them)"
  ).option(
    "--max-errors <number>",
    "Stop after a certain number of errors",
    (r) => {
      const s = parseInt(r, 10);
      if (Number.isNaN(s) || s < 0)
        throw new Error("Max errors must be a non-negative number");
      return s;
    },
    5
  ).option(
    "--max-feeds <number>",
    "Stop search after finding a certain number of feeds",
    (r) => {
      const s = parseInt(r, 10);
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
`).action(async (r, s) => {
    r || (e.help(), process.exit(0));
    try {
      const n = {
        isAllMode: !!s.all
      };
      e.feeds = await Ke(r, s, n), e.ctx = n;
    } catch (n) {
      s.displayErrors ? console.error(`
Error details:`, n) : console.error(B("red", `
Error: ${n.message}`)), process.exit(1);
    }
  }), e.addOption(new C("--display-errors", "Display errors").hideHelp()), e.addOption(new C("--insecure", "Disable TLS certificate verification (like curl -k)").hideHelp()), e;
}
function D(t) {
  t.forEach((e, r) => {
    const s = e.feedTitle ?? e.title;
    s && console.log(B("cyan", s)), console.log(e.url), r < t.length - 1 && console.log("");
  });
}
async function Ze(t = process.argv) {
  t.includes("--json") || console.log(`${We}
`);
  const e = Qe();
  await e.parseAsync(t);
  const r = e.opts();
  e.feeds !== void 0 && (r.json ? console.log(JSON.stringify(e.feeds, null, 2)) : r.all ? (console.log(B("yellow", `
=== All Strategies Complete ===`)), console.log(B("green", `Total unique feeds found: ${e.feeds.length}
`)), D(e.feeds)) : e.feeds.length > 0 && D(e.feeds), e.feeds.length === 0 && process.exit(2));
}
import.meta.url === `file://${process.argv[1]}` && Ze().catch((t) => {
  console.error(B("red", `
Error: ${t.message}`)), process.exit(1);
});
export {
  Qe as createProgram,
  Ze as run
};

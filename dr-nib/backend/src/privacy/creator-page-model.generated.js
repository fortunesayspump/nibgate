// jev/src/decide.ts
function optionValue(option, policy) {
  const penalty = policy.costPenalty ?? 1;
  let value = 0;
  for (const [signal, weight] of Object.entries(policy.weights)) {
    const score = option.scores[signal] ?? 0;
    value += weight * Math.min(1, Math.max(0, score));
  }
  return value - penalty * Math.max(0, option.cost);
}
function reasonsFor(option, policy, value) {
  const penalty = policy.costPenalty ?? 1;
  const parts = Object.entries(policy.weights).map(([signal, weight]) => {
    const score = option.scores[signal] ?? 0;
    return { signal, contribution: weight * score, score };
  }).filter((p) => p.contribution !== 0).sort((a, b) => b.contribution - a.contribution).slice(0, 3).map((p) => `${p.signal} ${p.score.toFixed(2)} (weight ${policy.weights[p.signal]})`);
  const out = [`value ${value.toFixed(3)} vs cost ${option.cost}`];
  if (parts.length) out.push(...parts);
  return out;
}
function selectMany(options, policy, maxPicks = Infinity) {
  const cap = policy.maxCost ?? policy.budgetRemaining;
  const minConfidence = policy.minConfidence ?? 0;
  const slate = { picks: [], skipped: [], escalated: [], budgetAfter: policy.budgetRemaining };
  const ranked = options.map((o) => ({ o, value: optionValue(o, policy) })).sort((a, b) => b.value - a.value || (a.o.id < b.o.id ? -1 : 1));
  for (const { o, value } of ranked) {
    if (slate.picks.length >= maxPicks) {
      slate.skipped.push({ option: o, reason: "beyond max picks" });
      continue;
    }
    if (o.cost < 0 || o.cost > Math.min(cap, slate.budgetAfter)) {
      slate.skipped.push({ option: o, reason: `unaffordable (cost ${o.cost}, remaining ${slate.budgetAfter})` });
      continue;
    }
    const confidence = o.scores["confidence"] ?? 1;
    if (confidence < minConfidence) {
      slate.escalated.push({ option: o, reason: `confidence ${confidence.toFixed(2)} below ${minConfidence}` });
      continue;
    }
    if (value <= 0) {
      slate.skipped.push({ option: o, reason: `value ${value.toFixed(3)} not worth it` });
      continue;
    }
    slate.budgetAfter -= o.cost;
    slate.picks.push({ option: o, value, reasons: reasonsFor(o, policy, value), budgetAfter: slate.budgetAfter });
  }
  return slate;
}
function decide(options, policy) {
  const cap = policy.maxCost ?? policy.budgetRemaining;
  const minConfidence = policy.minConfidence ?? 0;
  const eligible = options.filter((o) => o.cost >= 0 && o.cost <= Math.min(cap, policy.budgetRemaining));
  if (!eligible.length) {
    return {
      kind: "skip_all",
      optionId: null,
      action: "skip",
      value: 0,
      reasons: ["no affordable options within budget"],
      budgetAfter: policy.budgetRemaining,
      escalated: false
    };
  }
  const ranked = eligible.map((o) => ({ o, value: optionValue(o, policy) })).sort((a, b) => b.value - a.value || (a.o.id < b.o.id ? -1 : 1));
  const winner = ranked[0];
  const confidence = winner.o.scores["confidence"] ?? 1;
  if (confidence < minConfidence) {
    return {
      kind: "escalate",
      optionId: winner.o.id,
      action: "escalate",
      value: winner.value,
      reasons: [`confidence ${confidence.toFixed(2)} below threshold ${minConfidence} \u2014 human decides`],
      budgetAfter: policy.budgetRemaining,
      escalated: true
    };
  }
  if (winner.value <= 0) {
    return {
      kind: "skip_all",
      optionId: null,
      action: "skip",
      value: 0,
      reasons: [`best option value ${winner.value.toFixed(3)} not worth it`],
      budgetAfter: policy.budgetRemaining,
      escalated: false
    };
  }
  return {
    kind: "select",
    optionId: winner.o.id,
    action: winner.o.kind,
    value: winner.value,
    reasons: reasonsFor(winner.o, policy, winner.value),
    budgetAfter: policy.budgetRemaining - winner.o.cost,
    escalated: false
  };
}

// jev/src/trace.ts
function renderTrace(decision, options, policy) {
  const lines = ["DECISION"];
  const byId = new Map(options.map((o) => [o.id, o]));
  if (decision.kind === "select" && decision.optionId) {
    const o = byId.get(decision.optionId);
    lines.push(`Action \u2192 ${decision.action.toUpperCase()} (${decision.optionId})`);
    if (o) {
      lines.push(`Cost: ${o.cost}`);
      const scored = Object.entries(o.scores).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${Number(v).toFixed(2)}`).join(" \xB7 ");
      if (scored) lines.push(`Signals: ${scored}`);
    }
    lines.push(`Budget: ${policy.budgetRemaining} \u2192 ${decision.budgetAfter}`);
  } else if (decision.kind === "escalate") {
    lines.push(`Action \u2192 ESCALATE${decision.optionId ? ` (${decision.optionId})` : ""}`);
    lines.push(`Budget untouched: ${policy.budgetRemaining}`);
  } else {
    lines.push("Action \u2192 SKIP (nothing worth it)");
    lines.push(`Budget untouched: ${policy.budgetRemaining}`);
  }
  lines.push("Reason");
  decision.reasons.forEach((r) => lines.push(r));
  return lines.join("\n");
}

// extension/src/content/extract.ts
import { Readability, isProbablyReaderable } from "@mozilla/readability";

// extension/src/content/canonical-url.ts
function isLocalHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  return host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "0.0.0.0" || /^127(?:\.\d{1,3}){3}$/.test(host);
}
function canonicalContentUrl(canonical, pageUrl) {
  try {
    const page = new URL(pageUrl);
    page.hash = "";
    if (!canonical) return page.href;
    const target = new URL(canonical, page);
    if (isLocalHost(target.hostname) && !isLocalHost(page.hostname)) return page.href;
    target.hash = "";
    return target.href;
  } catch {
    return pageUrl.split("#")[0];
  }
}

// extension/src/content/extract.ts
function metaContent(names) {
  for (const name of names) {
    const el = document.querySelector(`meta[property="${name}"]`) || document.querySelector(`meta[name="${name}"]`);
    const content = el?.getAttribute("content")?.trim();
    if (content) return content;
  }
  return "";
}
function authorFromPage() {
  return metaContent(["article:author", "author", "twitter:creator"]) || document.querySelector('[rel="author"]')?.textContent?.trim() || document.querySelector('[itemprop="author"]')?.textContent?.trim() || "";
}
function fingerprint(text) {
  let h = 2166136261;
  const norm = text.toLowerCase().replace(/\s+/g, " ").slice(0, 8e3);
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ("0000000" + (h >>> 0).toString(16)).slice(-8);
}
var BOILERPLATE_SELECTORS = 'header, nav, footer, aside, form, dialog, [role="navigation"], [role="complementary"], [role="contentinfo"], [aria-hidden="true"], .comments, .comment, #comments, .sidebar, .widget, .related, .webring, .footer';
var UNLIKELY_CANDIDATE_PATTERN = /combx|comment|community|disqus|extra|foot|header|menu|remark|rss|shoutbox|sidebar|sponsor|ad-break|agegate|pagination|pager|popup|tweet|twitter|widget|related|footer/i;
var LIKELY_CANDIDATE_PATTERN = /and|article|body|column|content|main|post|text|blog|story|shadow/i;
function hasBoilerplateName(start) {
  const haystack = `${start.id || ""} ${start.getAttribute("class") || ""}`.trim();
  if (haystack.length < 2) return false;
  return UNLIKELY_CANDIDATE_PATTERN.test(haystack) && !LIKELY_CANDIDATE_PATTERN.test(haystack);
}
function isBoilerplateZone(start) {
  if (!start) return false;
  if (hasBoilerplateName(start)) return true;
  return Boolean(start.closest(BOILERPLATE_SELECTORS));
}
function proseLength(element) {
  let score = 0;
  element.querySelectorAll("p, blockquote, li").forEach((paragraph) => {
    if (isBoilerplateZone(paragraph)) return;
    score += Math.min((paragraph.textContent || "").trim().length, 2e3);
  });
  return score;
}
function contentContainer(root = document) {
  const doc = root;
  const candidates = Array.from(
    doc.querySelectorAll?.('article, main, [role="main"], section, div') ?? []
  );
  const depthOf = (el) => {
    let d = 0;
    let n = el;
    while (n?.parentElement) {
      d++;
      n = n.parentElement;
    }
    return d;
  };
  let best = null;
  let bestScore = -1;
  let bestDepth = -1;
  for (const el of candidates) {
    if (isBoilerplateZone(el)) continue;
    const paras = el.querySelectorAll("p, blockquote, li");
    const isContentTag = el.tagName === "ARTICLE" || el.tagName === "MAIN" || el.getAttribute("role") === "main" || el.matches(".h-entry,.hentry,.entry-content,.post-content,.article-body,.post-body");
    if (paras.length < 2 && !isContentTag) continue;
    const score = proseLength(el);
    const depth = depthOf(el);
    if (score > bestScore || score === bestScore && depth > bestDepth) {
      best = el;
      bestScore = score;
      bestDepth = depth;
    }
  }
  return best || doc.body || document.body;
}
function extractContent() {
  let readerable = false;
  try {
    readerable = isProbablyReaderable(document, { minContentLength: 140, minScore: 10 });
  } catch {
    return null;
  }
  if (!readerable) return null;
  let parsed = null;
  try {
    parsed = new Readability(document.cloneNode(true)).parse();
  } catch {
    return null;
  }
  if (!parsed || !parsed.textContent || (parsed.length ?? 0) < 200) return null;
  const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute("href") || window.location.href.split("#")[0];
  const text = parsed.textContent.trim();
  const words = text.split(/\s+/).filter(Boolean);
  return {
    url: window.location.href.split("#")[0],
    canonicalUrl: canonicalContentUrl(canonical, window.location.href),
    title: parsed.title || metaContent(["og:title", "twitter:title"]) || document.title || "Untitled",
    author: parsed.byline || authorFromPage(),
    siteName: parsed.siteName || metaContent(["og:site_name"]) || window.location.hostname.replace(/^www\./, ""),
    fingerprint: fingerprint((parsed.title || "") + "\n" + text),
    wordCount: words.length,
    // Last words of the canonical reader text. These anchor the live
    // placement marker to the real ending, not a visually similar sidebar,
    // code block, or footer.
    excerptTail: words.slice(-120).join(" ")
  };
}

// extension/src/content/page-model.ts
var BOILER = 'header,nav,footer,aside,[role="navigation"],[role="complementary"],[role="contentinfo"],[aria-hidden="true"]';
var CHROME_HINT = /(^|[-_\s])(share|shared|social|related|recommend|comment|comments|webmention|webmentions|disqus|tag|tags|subscribe|newsletter|cookie|consent|breadcrumb|author-bio|bio|promo|advert|ad|sponsor|sidebar|menu|nav|footer|widget|meta|pagination|pager|more-posts|back|prev|next)([-_\s]|$)/i;
var READ_MORE = /(read more|continue reading|read the rest|full story|keep reading|read on)\b/i;
var BLOCK_SEL = "h1,h2,h3,h4,h5,h6,p,blockquote,pre,figure";
var POST_ROOT_SEL = 'article,[role="article"],.h-entry,.hentry,.entry-content,.post-content,.article-body,.post-body';
var schemaCache = /* @__PURE__ */ new WeakMap();
var postRootCache = /* @__PURE__ */ new WeakMap();
var wordSegmenter = new Intl.Segmenter(void 0, { granularity: "word" });
function postRootsOf(doc) {
  let roots = postRootCache.get(doc);
  if (!roots) {
    roots = Array.from(doc.querySelectorAll(POST_ROOT_SEL)).filter((el) => !el.parentElement?.closest(POST_ROOT_SEL));
    postRootCache.set(doc, roots);
  }
  return roots;
}
function clamp01(n) {
  return Math.min(1, Math.max(0, n));
}
function wordsOf(el) {
  if (!el) return 0;
  const text = (el.textContent || "").trim();
  if (!text) return 0;
  if (/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u.test(text)) {
    return Array.from(wordSegmenter.segment(text)).filter((part) => part.isWordLike).length;
  }
  return text.split(/\s+/).length;
}
function hintOf(el) {
  return `${el.className || ""} ${el.id || ""}`.toString().toLowerCase();
}
function chromeZone(el) {
  if (el.matches('html, body, main, article, [role="main"], [role="article"], .h-entry, .hentry, .entry-content, .post-content, .article-body, .widget.Blog') || el.id === "__next") return false;
  return CHROME_HINT.test(hintOf(el));
}
function isBoiler(el) {
  if (!el) return false;
  try {
    if (el.closest(BOILER)) return true;
    for (let node = el; node; node = node.parentElement) {
      if (chromeZone(node)) return true;
    }
    return false;
  } catch {
    return false;
  }
}
function proseWords(el) {
  let total = 0;
  el.querySelectorAll("p, blockquote, pre, li").forEach((p) => {
    if (isBoiler(p)) return;
    if (p.tagName === "LI" && p.querySelector("p,blockquote,pre")) return;
    total += Math.min(wordsOf(p), 2e3);
  });
  if (total < 120 && el.matches(POST_ROOT_SEL) && !isBoiler(el)) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll('script,style,template,noscript,nav,header,footer,aside,form,.comments,#comments,.webmentions,.related,[hidden],[aria-hidden="true"]').forEach((node) => node.remove());
    total = Math.max(total, wordsOf(clone));
  }
  return total;
}
function linkWords(el) {
  let total = 0;
  el.querySelectorAll("a").forEach((a) => {
    total += wordsOf(a);
  });
  return total;
}
function metaContent2(doc, names) {
  for (const name of names) {
    const el = doc.querySelector(`meta[property="${name}"],meta[name="${name}"]`);
    const content = el?.getAttribute("content")?.trim();
    if (content) return content;
  }
  return "";
}
var DECOR_HINT = /(^|[-_\s])(avatar|icon|logo|emoji|sprite|badge|gravatar|favicon|spinner|placeholder|advert|ad|banner|pixel|tracking)([-_\s]|$)/i;
function isContentImage(img, ogImage) {
  if (DECOR_HINT.test(hintOf(img))) return false;
  if (img.parentElement && DECOR_HINT.test(hintOf(img.parentElement))) return false;
  const src = img.src || img.getAttribute("src") || "";
  const ogTail = ogImage ? ogImage.replace(/^https?:\/\//, "").split("?")[0] : "";
  if (ogTail && src && src.replace(/^https?:\/\//, "").startsWith(ogTail)) return true;
  if (img.closest("figure")) return true;
  if (/image/i.test(img.getAttribute("itemprop") || "")) return true;
  const width = Number(img.naturalWidth) || Number(img.getAttribute("width")) || 0;
  if (width && width < 120) return false;
  if (width >= 300) return true;
  if ((img.getAttribute("alt") || "").trim().length >= 15) return true;
  return false;
}
function contentImageCount(scope, ogImage) {
  return Array.from(scope.querySelectorAll("img")).filter((im) => !isBoiler(im) && isContentImage(im, ogImage)).length;
}
function mediaWorkScore(doc, scope) {
  const types = schemaTypes(doc).join(" ");
  if (/product|offer|softwareapplication/.test(types)) return 0;
  const images = contentImageCount(scope, metaContent2(doc, ["og:image"]));
  const explicitNibgateCreator = Boolean(doc.querySelector(
    'script[data-nibgate-site][data-nibgate-api], script[src*="nibgate"][data-nibgate-site]'
  ));
  const creator = /person|musicgroup/.test(types) || Boolean(
    metaContent2(doc, ["author", "article:author", "dc.creator", "fediverse:creator", "twitter:creator"]) || doc.querySelector('[rel~="author"], [rel~="me"], .h-card .p-name, [itemprop="author"]') || explicitNibgateCreator
  );
  const galleryRegion = scope.querySelector('[aria-label*="photograph" i], [aria-label*="photo gallery" i], [class*="gallery-masonry" i], [class*="gallery-story" i]');
  const galleryStory = scope.querySelector('[class*="gallery-story" i], [aria-labelledby*="gallery" i]');
  const publishedGallery = images >= 6 && Boolean(galleryRegion && galleryStory);
  const published = Boolean(scope.matches(".h-entry") || scope.querySelector(".h-entry, time[datetime], .dt-published") || metaContent2(doc, ["article:published_time"]) || Array.from(scope.querySelectorAll("h1")).some((h) => /\b20\d{2}[-/]\d{2}[-/]\d{2}\b/.test(h.textContent || "")) || /videoobject|audioobject|musicrecording|podcastepisode|imagegallery|photograph/.test(types) || publishedGallery);
  const titled = Boolean(scope.querySelector("h1, h2, .p-name") || metaContent2(doc, ["og:title"]));
  const media = pickMedia(doc, scope);
  return creator && published && titled && (media || images > 0) ? 1 : 0;
}
function publishedTextScore(doc, scope) {
  const types = schemaTypes(doc).join(" ");
  if (/product|offer|softwareapplication/.test(types) || wordsOf(scope) < 40) return 0;
  const roots = postRootsOf(doc);
  if (roots.length > 1) return 0;
  const declared = metaContent2(doc, ["og:type"]) === "article" || /article|blogposting/.test(types);
  const named = Boolean(metaContent2(doc, ["author", "article:author"]) || /person/.test(types) || scope.querySelector('[rel~="author"], [itemprop="author"], .p-author'));
  const dated = Boolean(metaContent2(doc, ["article:published_time"]) || scope.querySelector("time[datetime], .dt-published, .published"));
  const titled = Boolean(scope.querySelector("h1,h2"));
  const region = scope.matches(`main,[role="main"],${POST_ROOT_SEL}`);
  return named && dated && titled && (declared || region && roots.length === 1) ? 1 : 0;
}
function numericPagination(doc) {
  if (doc.querySelector('.pagination, .page-numbers, [class*="pagination" i], nav[aria-label*="pag" i]')) return true;
  const nums = Array.from(doc.querySelectorAll('nav a, [class*="pagination" i] a')).filter(
    (a) => /^\d{1,3}$/.test((a.textContent || "").trim())
  );
  return nums.length >= 2;
}
function repeatedCards(doc) {
  let best = 0;
  doc.querySelectorAll('main, [role="main"], section, ul, ol, div').forEach((parent) => {
    if (isBoiler(parent)) return;
    const cards = Array.from(parent.children).filter((kid) => {
      if (isBoiler(kid)) return false;
      const w = wordsOf(kid);
      if (w < 8 || w > 320) return false;
      const hasHeading = Boolean(kid.querySelector("h2,h3,h4"));
      const hasMedia = Boolean(kid.querySelector("img, picture, video"));
      const titledLink = Array.from(kid.querySelectorAll("a")).some((a) => (a.textContent || "").trim().length >= 15);
      return (hasHeading || titledLink) && (hasMedia || titledLink);
    });
    if (cards.length > best) best = cards.length;
  });
  return best;
}
function organizationScore(doc) {
  const typeStr = schemaTypes(doc).join(" ");
  const articleType = /article|blogposting|newsarticle|techarticle|scholarlyarticle/.test(typeStr) || metaContent2(doc, ["og:type"]).toLowerCase() === "article" || Boolean(doc.querySelector('article h1, [role="article"] h1, .post-content, .entry-content, .article-body'));
  if (articleType) return 0;
  let score = 0;
  if (!articleType && /organization|corporation|localbusiness|professionalservice/.test(typeStr)) score += 0.5;
  const ogType = metaContent2(doc, ["og:type"]).toLowerCase();
  if (ogType === "website") score += 0.2;
  const footer = (doc.querySelector("footer")?.textContent || "").toLowerCase();
  if (/\b(llc|inc|corp|corporation|company|gmbh|ltd|limited|studio|agency|consulting|solutions|software development|enterprises)\b/i.test(footer)) {
    score += 0.4;
  }
  const navText = Array.from(doc.querySelectorAll("nav a, header a")).map((a) => (a.textContent || "").toLowerCase()).join(" ");
  if (/(portfolio|pricing|services|careers|case study|clients|our work|solutions)/.test(navText)) score += 0.3;
  if (/person/.test(typeStr) || doc.querySelector('[rel="author"], [itemprop="author"]')) score -= 0.4;
  if (doc.querySelector('link[type="application/rss+xml"], link[type="application/atom+xml"]')) score -= 0.1;
  return clamp01(score);
}
function previewPenalty(el) {
  let penalty = 0;
  const readMore = el.querySelector("a");
  el.querySelectorAll("a").forEach((a) => {
    if (READ_MORE.test((a.textContent || "").trim())) penalty = Math.max(penalty, 0.8);
  });
  void readMore;
  const parent = el.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter((c) => {
      if (c === el || isBoiler(c)) return false;
      const w = wordsOf(c);
      const titled = Boolean(c.querySelector("h2,h3,h4")) || Array.from(c.querySelectorAll("a")).some((a) => (a.textContent || "").trim().length >= 20);
      return w >= 15 && w <= 500 && titled && Boolean(c.querySelector("a"));
    });
    if (siblings.length >= 2) penalty = Math.max(penalty, 0.6);
  }
  return penalty;
}
function elementValue(option, weights) {
  let value = 0;
  for (const [signal, weight] of Object.entries(weights)) value += weight * (option.scores[signal] ?? 0);
  return value;
}
function classify(doc) {
  let pageProse = 0;
  doc.querySelectorAll("p, blockquote, pre, li").forEach((p) => {
    if (p.tagName === "LI" && p.querySelector("p,blockquote,pre")) return;
    if (!isBoiler(p)) pageProse += Math.min(wordsOf(p), 2e3);
  });
  const postRoots = postRootsOf(doc);
  pageProse = Math.max(pageProse, postRoots.reduce((total, el) => total + proseWords(el), 0));
  const best = contentContainer(doc);
  const bestProse = proseWords(best);
  const singleFocus = clamp01(bestProse / Math.max(1, pageProse));
  const substance = clamp01(pageProse / 350);
  const ogArticle = metaContent2(doc, ["og:type"]) === "article" ? 1 : 0;
  const articleTag = doc.querySelector("article") ? 1 : 0;
  const profilePage = metaContent2(doc, ["og:type"]).toLowerCase() === "profile";
  const articleCount = doc.querySelectorAll("article").length;
  const main = doc.querySelector('main, [role="main"]');
  const mediaWork = Math.max(mediaWorkScore(doc, best), main ? mediaWorkScore(doc, main) : 0);
  const publishedText = Math.max(
    publishedTextScore(doc, best),
    main ? publishedTextScore(doc, main) : 0,
    ...postRoots.map((el) => publishedTextScore(doc, el))
  );
  const feedCards = clamp01((repeatedCards(doc) - 1) / 3);
  const pagination = numericPagination(doc) ? 1 : 0;
  const linkDensity = (() => {
    const total = wordsOf(doc.body);
    return total ? linkWords(doc.body) / total : 1;
  })();
  const navHeavy = clamp01(linkDensity * 2);
  const lowSubstance = 1 - substance;
  const title = metaContent2(doc, ["og:title", "twitter:title"]) || (doc.querySelector("h1")?.textContent || "").trim();
  const titleAlign = title ? Array.from(doc.querySelectorAll("h1")).some((h) => (h.textContent || "").trim().toLowerCase() === title.toLowerCase()) ? 1 : 0 : 0;
  const mainRegion = doc.querySelector('main, [role="main"]') ?? doc.body ?? doc.documentElement;
  const readMore = clamp01(
    Array.from(mainRegion.querySelectorAll("a")).filter((a) => !isBoiler(a) && READ_MORE.test((a.textContent || "").trim())).length / 2
  );
  const linkedHeadings = clamp01(Array.from(mainRegion.querySelectorAll("h2 a, h3 a, h4 a")).filter((a) => {
    const href = a.getAttribute("href") || "";
    if (isBoiler(a) || !href || href.startsWith("#")) return false;
    try {
      const target = new URL(href, doc.location?.href);
      return target.pathname !== doc.location?.pathname;
    } catch {
      return false;
    }
  }).length / 4);
  const articles = Array.from(doc.querySelectorAll("article"));
  const dominantArticle = pageProse > 0 && articles.length ? clamp01(Math.max(...articles.map((a) => proseWords(a))) / pageProse) : 0;
  const controlCount = doc.querySelectorAll(
    'input, textarea, select, button, [role="button"], [contenteditable="true"]'
  ).length;
  const paragraphCount = doc.querySelectorAll("p").length;
  const controlHeavy = clamp01(controlCount / Math.max(1, controlCount + paragraphCount));
  const org = organizationScore(doc);
  const bodyVisibleWords = (doc.body?.innerText || "").trim().split(/\s+/).filter(Boolean).length;
  const textBody = doc.body?.cloneNode(true);
  textBody?.querySelectorAll('script, style, template, noscript, [hidden], [aria-hidden="true"]').forEach((el) => el.remove());
  const bodyTextWords = (textBody?.textContent || "").trim().split(/\s+/).filter(Boolean).length;
  const visibleRatio = bodyTextWords > 0 ? clamp01(bodyVisibleWords / bodyTextWords) : 1;
  const weights = {
    substance: 0.3,
    singleFocus: 0.25,
    titleAlign: 0.15,
    ogArticle: 0.15,
    articleTag: 0.15,
    feedCards: 0.5,
    pagination: 0.4,
    manyArticles: 0.4,
    readMore: 0.45,
    linkedHeadings: 0.3,
    lowSubstance: 0.35,
    navHeavy: 0.3,
    manyExternals: 0.2,
    controlHeavy: 0.5,
    organization: 0.5,
    hiddenContent: 0.5,
    dominantArticle: 0.4,
    mediaWork: 0.9,
    publishedText: 0.55
  };
  const mk = (kind, scores) => {
    const confidence = clamp01(elementValue({ id: kind, kind, cost: 0, scores }, weights));
    return { id: kind, kind, cost: 0, scores: { ...scores, confidence } };
  };
  const options = [
    // A short page (bio card, landing) or a brand/organization page cannot be
    // "the content", however well titled its single block is.
    (pageProse >= 200 || mediaWork || publishedText || pageProse >= 120 && titleAlign && (articleTag || ogArticle)) && org < 0.5 && !profilePage && visibleRatio >= 0.5 ? mk("content", { substance, singleFocus, titleAlign, ogArticle, articleTag, dominantArticle, mediaWork, publishedText }) : mk("content", { substance: 0, singleFocus: 0, titleAlign: 0, ogArticle: 0, articleTag: 0, dominantArticle: 0 }),
    mk("feed", { feedCards, pagination, manyArticles: clamp01((articleCount - 1) / 3), readMore, linkedHeadings }),
    mk("landing", { lowSubstance, navHeavy, manyExternals: navHeavy, controlHeavy, organization: org, hiddenContent: 1 - visibleRatio }),
    mk("app", { lowSubstance, manyExternals: navHeavy, controlHeavy, hiddenContent: 1 - visibleRatio }),
    mk("brand", { organization: org, lowSubstance })
  ];
  const policy = { budgetRemaining: 1, maxCost: 0, minConfidence: 0.35, weights };
  return { decision: decide(options, policy), options, policy };
}
function pickRoot(doc, tailWords = []) {
  const sels = [
    "article",
    '[role="article"]',
    "main",
    '[role="main"]',
    ".post-content",
    ".entry-content",
    ".article-body",
    ".h-entry",
    ".hentry",
    ".post-body",
    '[itemtype*="Article"]'
  ];
  const seen = /* @__PURE__ */ new Set();
  const ogImage = metaContent2(doc, ["og:image"]);
  const entries = [];
  const add = (el) => {
    if (!el || seen.has(el) || isBoiler(el)) return;
    if (el.matches("body,html") && doc.querySelector(`main,[role="main"],${POST_ROOT_SEL}`)) return;
    seen.add(el);
    const w = proseWords(el);
    const mediaWork = mediaWorkScore(doc, el);
    const publishedText = publishedTextScore(doc, el);
    if (w < 120 && !mediaWork && !publishedText) return;
    const total = wordsOf(el);
    const ld = total ? linkWords(el) / total : 1;
    const parentProse = el.parentElement ? Math.max(1, proseWords(el.parentElement)) : w;
    const hasTitle = Boolean(el.querySelector("h1,h2"));
    let readableTail = 0;
    if (tailWords.length) {
      const text = (el.textContent || "").toLowerCase();
      let hit = 0;
      for (const word of tailWords) if (text.includes(word)) hit += 1;
      readableTail = hit / tailWords.length;
    }
    const contentImages = contentImageCount(el, ogImage);
    const totalImages = el.querySelectorAll("img").length;
    const scores = {
      substance: clamp01(w / 900),
      focus: clamp01(w / parentProse),
      linkClean: 1 - clamp01(ld * 2),
      titleAlign: hasTitle ? 1 : 0,
      notPreview: 1 - previewPenalty(el),
      readableTail,
      contentMedia: contentImages > 0 || Boolean(el.querySelector("video,audio")) ? 1 : 0,
      imageClean: totalImages ? contentImages / totalImages : 1,
      mediaWork,
      publishedText
    };
    entries.push({
      el,
      option: {
        id: `root-${entries.length}`,
        kind: "content-root",
        cost: 0,
        scores
      }
    });
  };
  sels.forEach((sel) => doc.querySelectorAll(sel).forEach((el) => add(el)));
  let generic = contentContainer(doc);
  for (let i = 0; i < 3 && generic; i++) {
    add(generic);
    generic = generic.parentElement;
  }
  const weights = {
    substance: 0.22,
    focus: 0.22,
    linkClean: 0.18,
    titleAlign: 0.13,
    notPreview: 0.25,
    readableTail: 0.3,
    contentMedia: 0.12,
    imageClean: 0.08,
    mediaWork: 0.45,
    publishedText: 0.35
  };
  const options = entries.map(({ option }) => {
    const confidence = clamp01(elementValue(option, weights));
    return { ...option, scores: { ...option.scores, confidence } };
  });
  const byId = new Map(entries.map((e, i) => [options[i].id, e.el]));
  const policy = { budgetRemaining: 1, maxCost: 0, minConfidence: 0.45, weights };
  const decision = decide(options, policy);
  const element = decision.kind === "select" && decision.optionId ? byId.get(decision.optionId) : void 0;
  return { decision, option: element ? { ...options.find((o) => o.id === decision.optionId), element } : void 0, options, policy };
}
function blockScore(el) {
  const tag = el.tagName.toLowerCase();
  const words = wordsOf(el);
  const ld = words ? linkWords(el) / words : 1;
  const hint = hintOf(el);
  let score = 0.35;
  if (/^h[1-6]$/.test(tag) && words >= 2) score += 0.1;
  if (tag === "p" || tag === "blockquote" || tag === "pre" || tag === "figure") score += 0.2;
  score += Math.min(0.5, words / 120);
  score -= Math.min(0.6, ld);
  if (CHROME_HINT.test(hint)) score -= 0.6;
  if (READ_MORE.test((el.textContent || "").trim()) && words < 30) score -= 0.5;
  return clamp01(score);
}
function boundaries(root) {
  const blocks = Array.from(root.querySelectorAll(BLOCK_SEL)).filter((b) => {
    if (isBoiler(b)) return false;
    const parent = b.parentElement;
    if (parent && parent.closest("blockquote, figure, li")) return false;
    return wordsOf(b) > 0;
  });
  const options = blocks.map((el, i) => {
    const score = blockScore(el);
    return { id: `b${i}`, kind: "content-block", cost: 0, scores: { content: score, confidence: score } };
  });
  const policy = { budgetRemaining: 1, maxCost: 0, minConfidence: 0.45, weights: { content: 1 } };
  const slate = selectMany(options, policy, options.length);
  const kept = new Set(slate.picks.map((p) => p.option.id));
  const keptEls = blocks.filter((_, i) => kept.has(`b${i}`));
  const decision = {
    kind: keptEls.length ? "select" : "skip_all",
    optionId: keptEls.length ? `b${blocks.indexOf(keptEls[0])}` : null,
    action: keptEls.length ? "content-block" : "skip",
    value: slate.picks[0]?.value ?? 0,
    reasons: slate.picks.length ? [`kept ${keptEls.length}/${blocks.length} content blocks`, ...slate.picks[0]?.reasons ?? []] : ["no block met the content threshold"],
    budgetAfter: 1,
    escalated: false
  };
  let endEl = keptEls[keptEls.length - 1] ?? blocks[blocks.length - 1] ?? null;
  if (endEl) {
    const startIdx = blocks.indexOf(endEl);
    for (let i = startIdx + 1; i < blocks.length && i <= startIdx + 6; i++) {
      const block = blocks[i];
      const tag = block.tagName.toLowerCase();
      if (/^h[1-6]$/.test(tag)) break;
      if (isBoiler(block) || CHROME_HINT.test(hintOf(block))) break;
      const words = wordsOf(block);
      const density = words ? linkWords(block) / words : 1;
      if (words < 8 || density > 0.25) break;
      endEl = block;
    }
  }
  return { start: keptEls[0] ?? blocks[0] ?? null, end: endEl, decision, policy, kept: keptEls.length, total: blocks.length };
}
function authorCandidates(doc, root) {
  const out = [];
  const push = (value, score = 0, source = "") => {
    const v = (value || "").trim();
    if (!v || v.length > 120) return;
    out.push({ value: v, score, source });
  };
  push(metaContent2(doc, ["article:author", "author"]), 0.95, "meta-author");
  push(doc.querySelector('[itemprop="author"] [itemprop="name"], [itemprop="author"]')?.textContent, 0.85, "itemprop-author");
  push(doc.querySelector('[rel="author"]')?.textContent, 0.8, "rel-author");
  if (root) {
    const byline = root.querySelector('[class*="author" i], [class*="byline" i], [class*="written-by" i]');
    push(byline?.textContent, 0.7, "byline");
  }
  const meta = doc.querySelector('[class*="author" i], [class*="byline" i]');
  push(meta?.textContent, 0.5, "page-author-element");
  return out;
}
function pickAuthor(doc, root) {
  const candidates = authorCandidates(doc, root);
  if (!candidates.length) return { value: "", decision: null, policy: null };
  const options = candidates.map((c, i) => ({
    id: `author-${i}`,
    kind: "author",
    cost: 0,
    scores: { signal: c.score, confidence: c.score },
    meta: { value: c.value, source: c.source }
  }));
  const policy = { budgetRemaining: 1, maxCost: 0, minConfidence: 0.4, weights: { signal: 1 } };
  const decision = decide(options, policy);
  const winner = decision.kind === "select" ? options.find((o) => o.id === decision.optionId)?.meta : void 0;
  return { value: winner?.value ?? "", decision, policy };
}
function fingerprint2(title, text) {
  let h = 2166136261;
  const norm = (title + "\n" + text).toLowerCase().replace(/\s+/g, " ").slice(0, 8e3);
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ("0000000" + (h >>> 0).toString(16)).slice(-8);
}
function schemaTypes(doc) {
  const cached = schemaCache.get(doc);
  if (cached) return cached;
  const out = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
    let data;
    try {
      data = JSON.parse(node.textContent || "null");
    } catch {
      return;
    }
    const walk = (value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (typeof value !== "object") return;
      const record = value;
      const t = record["@type"];
      if (typeof t === "string") out.push(t.toLowerCase());
      else if (Array.isArray(t)) t.forEach((x) => typeof x === "string" && out.push(x.toLowerCase()));
      for (const nested of Object.values(record)) walk(nested);
    };
    walk(data);
  });
  schemaCache.set(doc, out);
  return out;
}
function pickType(doc, root) {
  const types = schemaTypes(doc);
  const has = (re) => types.some((t) => re.test(t)) ? 1 : 0;
  const og = metaContent2(doc, ["og:type"]).toLowerCase();
  const hEntry = Boolean(doc.querySelector('.h-entry, [class~="h-entry"], article.h-entry'));
  const hasVideo = Boolean(
    doc.querySelector('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="player"], [itemprop="video"], meta[property="og:video"]')
  );
  const hasAudio = Boolean(
    doc.querySelector('audio, [itemprop="audio"], meta[property*="audio"], iframe[src*="spotify"], iframe[src*="anchor.fm"], iframe[src*="podcast"]')
  );
  const scope = root ?? doc;
  const ogImage = metaContent2(doc, ["og:image"]);
  const contentImgs = contentImageCount(scope, ogImage);
  const paraCount = scope.querySelectorAll("p").length;
  const hasCode = Boolean(scope.querySelector("pre, pre code, code"));
  const hasDiscussion = Boolean(doc.querySelector('form, textarea, [class*="comment" i]'));
  const weights = { schema: 0.7, og: 0.4, media: 0.4, gallery: 0.3, code: 0.3, discussion: 0.3 };
  const mk = (type2, scores) => {
    const confidence = clamp01(elementValue({ id: type2, kind: type2, cost: 0, scores }, weights));
    return { id: type2, kind: type2, cost: 0, scores: { ...scores, confidence } };
  };
  const options = [
    mk("article", { schema: has(/article|blogposting|newsarticle|techarticle/) ? 1 : hEntry ? 0.8 : 0, og: og.startsWith("article") ? 1 : 0 }),
    mk("paper", { schema: has(/scholarlyarticle|report|thesis/) ? 1 : 0, og: og === "book" ? 1 : 0 }),
    mk("video", { schema: has(/videoobject/) ? 1 : 0, og: og.startsWith("video") ? 1 : 0, media: hasVideo ? 1 : 0 }),
    mk("audio", { schema: has(/audioobject|podcastepisode|podcastseries/) ? 1 : 0, og: og.startsWith("music") ? 1 : 0, media: hasAudio ? 1 : 0 }),
    mk("gallery", { schema: has(/imagegallery|photograph/) || contentImgs > 0 && proseWords(scope) < 120 && mediaWorkScore(doc, scope) ? 1 : 0, gallery: contentImgs >= 1 && paraCount <= 4 && !hasVideo && !hasAudio ? 1 : 0, media: contentImgs > 0 && mediaWorkScore(doc, scope) ? 1 : 0 }),
    mk("code", { schema: has(/softwaresourcecode|softwareapplication/) ? 1 : 0, code: hasCode ? 1 : 0 }),
    mk("discussion", { schema: has(/discussionforumposting|question/) ? 1 : 0, discussion: hasDiscussion ? 1 : 0 })
  ];
  const policy = { budgetRemaining: 1, maxCost: 0, minConfidence: 0.35, weights };
  const decision = decide(options, policy);
  const type = decision.kind === "select" ? decision.action : "article";
  return { decision, policy, options, type };
}
function pickMedia(doc, root) {
  const sel = 'video, audio, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="player"], iframe[src*="spotify"], iframe[src*="anchor.fm"], [itemprop="video"], [itemprop="audio"]';
  return (root ?? doc).querySelector(sel);
}
function lastContentFigure(root, ogImage) {
  const figures = Array.from(root.querySelectorAll("figure")).filter((f) => contentImageCount(f, ogImage) > 0);
  return figures.length ? figures[figures.length - 1] : null;
}
function eligibility(input) {
  const weights = {
    kindConfidence: 0.25,
    rootConfidence: 0.25,
    boundRatio: 0.2,
    substance: 0.2,
    author: 0.05,
    media: 0.05
  };
  const scores = {
    kindConfidence: input.kindConfidence,
    rootConfidence: input.rootConfidence,
    boundRatio: input.boundRatio,
    substance: input.substance,
    author: input.authorPresent,
    media: input.mediaPresent
  };
  const confidence = clamp01(elementValue({ id: "render", kind: "tip", cost: 0, scores }, weights));
  const options = [{ id: "render", kind: "tip", cost: 0, scores: { ...scores, confidence } }];
  const policy = { budgetRemaining: 1, maxCost: 0, minConfidence: 0.45, weights };
  return { decision: decide(options, policy), policy, options };
}
function mapPage(rootNode = document) {
  const doc = rootNode.documentElement ? rootNode : document;
  schemaCache.delete(doc);
  postRootCache.delete(doc);
  const classified = classify(doc);
  const kind = classified.decision.kind === "select" ? classified.decision.action : "unknown";
  const lines = [`PAGE KIND \u2192 ${kind.toUpperCase()}`, ...classified.decision.reasons.map((r) => `  ${r}`)];
  const empty = {
    kind,
    kindDecision: classified.decision,
    contentType: "unknown",
    typeDecision: null,
    eligibility: null,
    root: null,
    rootDecision: null,
    start: null,
    end: null,
    media: null,
    anchor: null,
    author: "",
    authorDecision: null,
    title: "",
    canonical: "",
    siteName: "",
    wordCount: 0,
    fingerprint: "",
    links: [],
    candidates: classified.options.map((o) => ({ id: o.id, kind: o.kind, cost: o.cost, context: o.id, scores: o.scores })),
    trace: lines.join("\n")
  };
  const kindConfidence = clamp01(classified.decision.value);
  if (kind !== "content") return empty;
  const reader = extractContent();
  const tailWords = (reader?.excerptTail || "").toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 3).slice(-120);
  const picked = pickRoot(doc, tailWords);
  const root = picked.option?.element ?? null;
  if (picked.decision.kind === "select" && picked.policy) {
    lines.push("");
    lines.push(renderTrace(picked.decision, picked.options, picked.policy));
  }
  const effectiveRoot = root ?? contentContainer(doc);
  const bounds = boundaries(effectiveRoot);
  lines.push("");
  lines.push(`CONTENT BOUNDS \u2192 ${bounds.start?.tagName.toLowerCase() ?? "none"} \u2026 ${bounds.end?.tagName.toLowerCase() ?? "none"}`);
  bounds.decision.reasons.forEach((r) => lines.push(`  ${r}`));
  const author = pickAuthor(doc, effectiveRoot);
  if (author.decision && author.policy) {
    lines.push("");
    lines.push(renderTrace(author.decision, [], author.policy).split("\n")[0]);
    author.decision.reasons.forEach((r) => lines.push(`  author: ${r}`));
  }
  const media = pickMedia(doc, effectiveRoot);
  const type = pickType(doc, effectiveRoot);
  const galleryFigure = lastContentFigure(effectiveRoot, metaContent2(doc, ["og:image"]));
  const anchor = (type.type === "video" || type.type === "audio") && media ? media : type.type === "gallery" && galleryFigure ? galleryFigure : bounds.end;
  lines.push("");
  lines.push(`CONTENT TYPE \u2192 ${type.type.toUpperCase()}`);
  type.decision.reasons.forEach((r) => lines.push(`  ${r}`));
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute("href") || doc.location?.href || "";
  const title = metaContent2(doc, ["og:title", "twitter:title"]) || (effectiveRoot.querySelector("h1,h2")?.textContent || "").trim() || (doc.querySelector("h1")?.textContent || "").trim() || doc.title || "Untitled";
  const text = (effectiveRoot.textContent || "").trim();
  const wordCount = wordsOf(effectiveRoot);
  const elig = eligibility({
    kindConfidence,
    rootConfidence: clamp01(picked.decision.value),
    boundRatio: bounds.total ? bounds.kept / bounds.total : 0,
    substance: Math.max(clamp01(wordCount / 600), mediaWorkScore(doc, effectiveRoot)),
    authorPresent: author.value ? 1 : 0,
    mediaPresent: media ? 1 : 0
  });
  lines.push("");
  lines.push(renderTrace(elig.decision, elig.options, elig.policy));
  const links = Array.from(effectiveRoot.querySelectorAll("a[href]")).map((a) => a.href).filter((href) => /^https?:/.test(href)).filter((href, i, all) => all.indexOf(href) === i).slice(0, 50);
  return {
    ...empty,
    contentType: type.type,
    typeDecision: type.decision,
    eligibility: elig.decision,
    root: effectiveRoot,
    rootDecision: picked.decision,
    start: bounds.start,
    end: bounds.end,
    media,
    anchor,
    author: author.value,
    authorDecision: author.decision,
    title,
    canonical: canonicalContentUrl(canonical, doc.location?.href || ""),
    siteName: metaContent2(doc, ["og:site_name"]) || (doc.location?.hostname || "").replace(/^www\./, ""),
    wordCount,
    fingerprint: fingerprint2(title, text),
    links,
    candidates: picked.options.map((o) => ({
      id: o.id,
      kind: o.kind,
      cost: o.cost,
      context: `${o.id} words=?`,
      scores: o.scores
    })),
    trace: lines.join("\n")
  };
}
export {
  mapPage
};

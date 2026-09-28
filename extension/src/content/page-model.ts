// Deterministic page model: turns the raw DOM into a typed, explainable map of
// where the *actual content* is — page kind, content root, start/end blocks,
// author, canonical, links. Every judgment is a JEV decision over scored
// options (no LLM, no network), so each result is replayable and comes with a
// human-readable reasons[] trace.
//
// Decision chain:
//   1. classify()  — content | feed | landing | app, from page-level signals
//   2. pickRoot()  — the element holding the piece, not a preview/feed card
//   3. boundaries()— first/last real content block (cuts share/related/tags)
//   4. pickAuthor()— best declared author signal
//   5. eligibility()— final JEV gate: render the tip, or escalate/skip
import { decide, selectMany } from '../../../jev/src/decide.ts';
import { renderTrace } from '../../../jev/src/trace.ts';
import type { JevDecision, JevOption, JevPolicy } from '../../../jev/src/schema.ts';
import { contentContainer, extractContent } from './extract';

export type PageKind = 'content' | 'feed' | 'landing' | 'app' | 'brand' | 'unknown';
export type ContentType = 'article' | 'video' | 'audio' | 'gallery' | 'paper' | 'code' | 'discussion' | 'product' | 'unknown';

export type PageMap = {
  kind: PageKind;
  kindDecision: JevDecision;
  contentType: ContentType;
  typeDecision: JevDecision | null;
  eligibility: JevDecision | null;
  root: Element | null;
  rootDecision: JevDecision | null;
  start: Element | null;
  end: Element | null;
  media: Element | null;
  anchor: Element | null;
  author: string;
  authorDecision: JevDecision | null;
  title: string;
  canonical: string;
  siteName: string;
  wordCount: number;
  fingerprint: string;
  links: string[];
  candidates: Array<{ id: string; kind: string; cost: number; context: string; scores: Record<string, number> }>;
  trace: string;
};

const BOILER =
  'header,nav,footer,aside,[role="navigation"],[role="complementary"],[role="contentinfo"],[aria-hidden="true"]';
const CHROME_HINT =
  /(^|[-_\s])(share|shared|social|related|recommend|comment|comments|disqus|tag|tags|subscribe|newsletter|cookie|consent|breadcrumb|author-bio|bio|promo|advert|ad|sponsor|sidebar|menu|nav|footer|widget|meta|pagination|pager|more-posts|back|prev|next)([-_\s]|$)/i;
const READ_MORE = /(read more|continue reading|read the rest|full story|keep reading|read on)\b/i;
const BLOCK_SEL = 'h1,h2,h3,h4,h5,h6,p,blockquote,pre,figure';

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
function wordsOf(el: Element | null | undefined): number {
  if (!el) return 0;
  const text = (el.textContent || '').trim();
  return text ? text.split(/\s+/).length : 0;
}
function hintOf(el: Element): string {
  return `${el.className || ''} ${el.id || ''}`.toString().toLowerCase();
}
function isBoiler(el: Element | null): boolean {
  if (!el) return false;
  try {
    return Boolean(el.closest(BOILER)) || CHROME_HINT.test(hintOf(el));
  } catch {
    return false;
  }
}
function proseWords(el: Element): number {
  let total = 0;
  el.querySelectorAll('p, blockquote, pre').forEach((p) => {
    if (isBoiler(p)) return;
    total += Math.min(wordsOf(p), 2000);
  });
  return total;
}
function linkWords(el: Element): number {
  let total = 0;
  el.querySelectorAll('a').forEach((a) => {
    total += wordsOf(a);
  });
  return total;
}
function metaContent(doc: Document, names: string[]): string {
  for (const name of names) {
    const el = doc.querySelector(`meta[property="${name}"],meta[name="${name}"]`);
    const content = el?.getAttribute('content')?.trim();
    if (content) return content;
  }
  return '';
}

// Decorative media (logos, avatars, icons, ads, placeholders) is not content.
// Only images that carry the piece — large, captioned, in a <figure>, schema
// image, or matching og:image — count toward "this is the content".
const DECOR_HINT = /(^|[-_\s])(avatar|icon|logo|emoji|sprite|badge|gravatar|favicon|spinner|placeholder|advert|ad|banner|pixel|tracking)([-_\s]|$)/i;

function isContentImage(img: Element, ogImage: string): boolean {
  if (DECOR_HINT.test(hintOf(img))) return false;
  if (img.parentElement && DECOR_HINT.test(hintOf(img.parentElement))) return false;
  const src = (img as HTMLImageElement).src || img.getAttribute('src') || '';
  const ogTail = ogImage ? ogImage.replace(/^https?:\/\//, '').split('?')[0] : '';
  if (ogTail && src && src.replace(/^https?:\/\//, '').startsWith(ogTail)) return true;
  if (img.closest('figure')) return true;
  if (/image/i.test(img.getAttribute('itemprop') || '')) return true;
  const width = Number((img as HTMLImageElement).naturalWidth) || Number(img.getAttribute('width')) || 0;
  if (width && width < 120) return false;
  if (width >= 300) return true;
  if ((img.getAttribute('alt') || '').trim().length >= 15) return true;
  return false;
}

function contentImageCount(scope: ParentNode, ogImage: string): number {
  return Array.from(scope.querySelectorAll('img')).filter((im) => isContentImage(im, ogImage)).length;
}
function numericPagination(doc: Document): boolean {
  if (doc.querySelector('.pagination, .page-numbers, [class*="pagination" i], nav[aria-label*="pag" i]')) return true;
  const nums = Array.from(doc.querySelectorAll('nav a, [class*="pagination" i] a')).filter((a) =>
    /^\d{1,3}$/.test((a.textContent || '').trim()),
  );
  return nums.length >= 2;
}
function repeatedCards(doc: Document): number {
  let best = 0;
  doc.querySelectorAll('main, [role="main"], section, ul, ol, div').forEach((parent) => {
    if (isBoiler(parent)) return;
    const cards = Array.from(parent.children).filter((kid) => {
      if (isBoiler(kid)) return false;
      const w = wordsOf(kid);
      if (w < 8 || w > 320) return false;
      const hasHeading = Boolean(kid.querySelector('h2,h3,h4'));
      const hasMedia = Boolean(kid.querySelector('img, picture, video'));
      const titledLink = Array.from(kid.querySelectorAll('a')).some((a) => (a.textContent || '').trim().length >= 15);
      return (hasHeading || titledLink) && (hasMedia || titledLink);
    });
    if (cards.length > best) best = cards.length;
  });
  return best;
}

// Brand/organization pages (company sites, agencies, product marketing) are not
// personal creator content. Signals: schema.org Organization, website OG type,
// corporate footer, portfolio/services nav, and absence of a Person author.
function organizationScore(doc: Document): number {
  const typeStr = schemaTypes(doc).join(' ');
  const articleType = /article|blogposting|newsarticle|techarticle|scholarlyarticle/.test(typeStr);
  let score = 0;
  // Organization only counts when the page itself is an org page — not when it
  // is merely the publisher of an Article/BlogPosting.
  if (!articleType && /organization|corporation|localbusiness|professionalservice/.test(typeStr)) score += 0.5;
  const ogType = metaContent(doc, ['og:type']).toLowerCase();
  if (ogType === 'website') score += 0.2;
  const footer = (doc.querySelector('footer')?.textContent || '').toLowerCase();
  if (/\b(llc|inc|corp|corporation|company|gmbh|ltd|limited|studio|agency|consulting|solutions|software development|enterprises)\b/i.test(footer)) {
    score += 0.4;
  }
  const navText = Array.from(doc.querySelectorAll('nav a, header a'))
    .map((a) => (a.textContent || '').toLowerCase())
    .join(' ');
  if (/(portfolio|pricing|services|careers|case study|clients|our work|solutions)/.test(navText)) score += 0.3;
  if (/person/.test(typeStr) || doc.querySelector('[rel="author"], [itemprop="author"]')) score -= 0.4;
  if (doc.querySelector('link[type="application/rss+xml"], link[type="application/atom+xml"]')) score -= 0.1;
  return clamp01(score);
}
function previewPenalty(el: Element): number {
  let penalty = 0;
  const readMore = el.querySelector('a');
  el.querySelectorAll('a').forEach((a) => {
    if (READ_MORE.test((a.textContent || '').trim())) penalty = Math.max(penalty, 0.8);
  });
  void readMore;
  const parent = el.parentElement;
  if (parent) {
    const siblings = Array.from(parent.children).filter((c) => {
      if (c === el || isBoiler(c)) return false;
      const w = wordsOf(c);
      const titled =
        Boolean(c.querySelector('h2,h3,h4')) ||
        Array.from(c.querySelectorAll('a')).some((a) => (a.textContent || '').trim().length >= 20);
      return w >= 15 && w <= 500 && titled && Boolean(c.querySelector('a'));
    });
    if (siblings.length >= 2) penalty = Math.max(penalty, 0.6);
  }
  return penalty;
}
function elementValue(option: JevOption, weights: Record<string, number>): number {
  let value = 0;
  for (const [signal, weight] of Object.entries(weights)) value += weight * (option.scores[signal] ?? 0);
  return value;
}

// 1. Page kind. Signals are oriented per candidate kind; the kind with the
//    strongest evidence wins. Feeds/landings win their own signals and get cut.
function classify(doc: Document): { decision: JevDecision; options: JevOption[]; policy: JevPolicy } {
  let pageProse = 0;
  doc.querySelectorAll('p, blockquote, pre').forEach((p) => {
    if (!isBoiler(p)) pageProse += Math.min(wordsOf(p), 2000);
  });
  const best = contentContainer(doc);
  const bestProse = proseWords(best);
  const singleFocus = clamp01(bestProse / Math.max(1, pageProse));
  const substance = clamp01(pageProse / 600);
  const ogArticle = metaContent(doc, ['og:type']) === 'article' ? 1 : 0;
  const articleTag = doc.querySelector('article') ? 1 : 0;
  // A profile page is declared by OG type. (h-card alone is too common — many
  // articles embed one for the site/author — so it is not treated as a profile.)
  const profilePage = metaContent(doc, ['og:type']).toLowerCase() === 'profile';
  const articleCount = doc.querySelectorAll('article').length;
  const feedCards = clamp01((repeatedCards(doc) - 1) / 3);
  const pagination = numericPagination(doc) ? 1 : 0;
  const linkDensity = (() => {
    const total = wordsOf(doc.body);
    return total ? linkWords(doc.body) / total : 1;
  })();
  const navHeavy = clamp01(linkDensity * 2);
  const lowSubstance = 1 - substance;
  const title = metaContent(doc, ['og:title', 'twitter:title']) || (doc.querySelector('h1')?.textContent || '').trim();
  const titleAlign = title
    ? Array.from(doc.querySelectorAll('h1')).some((h) => (h.textContent || '').trim().toLowerCase() === title.toLowerCase())
      ? 1
      : 0
    : 0;
  // Scope feed signals to the main region: sidebar/related/footer links must
  // not make a single article look like a listing.
  const mainRegion: Element = doc.querySelector('main, [role="main"]') ?? doc.body ?? doc.documentElement;
  const readMore = clamp01(
    Array.from(mainRegion.querySelectorAll('a')).filter((a) => READ_MORE.test((a.textContent || '').trim())).length / 2,
  );
  const linkedHeadings = clamp01(mainRegion.querySelectorAll('h2 a, h3 a, h4 a').length / 4);
  // One dominant article holding most of the prose strongly indicates content.
  const articles = Array.from(doc.querySelectorAll('article'));
  const dominantArticle =
    pageProse > 0 && articles.length
      ? clamp01(Math.max(...articles.map((a) => proseWords(a))) / pageProse)
      : 0;
  const controlCount = doc.querySelectorAll(
    'input, textarea, select, button, [role="button"], [contenteditable="true"]',
  ).length;
  const paragraphCount = doc.querySelectorAll('p').length;
  const controlHeavy = clamp01(controlCount / Math.max(1, controlCount + paragraphCount));
  const org = organizationScore(doc);
  // Hidden-text apps (editors, games) carry prose in textContent that is not
  // actually visible. Compare visible text to raw text to tell them apart.
  const bodyVisibleWords = (doc.body?.innerText || '').trim().split(/\s+/).filter(Boolean).length;
  const bodyTextWords = (doc.body?.textContent || '').trim().split(/\s+/).filter(Boolean).length;
  const visibleRatio = bodyTextWords > 0 ? clamp01(bodyVisibleWords / bodyTextWords) : 1;

  const weights: Record<string, number> = {
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
  };

  const mk = (kind: PageKind, scores: Record<string, number>): JevOption => {
    const confidence = clamp01(elementValue({ id: kind, kind, cost: 0, scores }, weights));
    return { id: kind, kind, cost: 0, scores: { ...scores, confidence } };
  };
  const options: JevOption[] = [
    // A short page (bio card, landing) or a brand/organization page cannot be
    // "the content", however well titled its single block is.
    pageProse >= 200 && org < 0.5 && !profilePage && visibleRatio >= 0.5
      ? mk('content', { substance, singleFocus, titleAlign, ogArticle, articleTag, dominantArticle })
      : mk('content', { substance: 0, singleFocus: 0, titleAlign: 0, ogArticle: 0, articleTag: 0, dominantArticle: 0 }),
    mk('feed', { feedCards, pagination, manyArticles: clamp01((articleCount - 1) / 3), readMore, linkedHeadings }),
    mk('landing', { lowSubstance, navHeavy, manyExternals: navHeavy, controlHeavy, organization: org, hiddenContent: 1 - visibleRatio }),
    mk('app', { lowSubstance, manyExternals: navHeavy, controlHeavy, hiddenContent: 1 - visibleRatio }),
    mk('brand', { organization: org, lowSubstance }),
  ];
  const policy: JevPolicy = { budgetRemaining: 1, maxCost: 0, minConfidence: 0.35, weights };
  return { decision: decide(options, policy), options, policy };
}

// 2. Content root. Prefer the container holding most of the prose, titled,
//    low link density, and not a preview/feed card.
function pickRoot(
  doc: Document,
  tailWords: string[] = [],
): { decision: JevDecision; option?: JevOption & { element: Element }; options: JevOption[]; policy: JevPolicy } {
  const sels = [
    'article',
    '[role="article"]',
    'main',
    '[role="main"]',
    '.post-content',
    '.entry-content',
    '.article-body',
    '[itemtype*="Article"]',
  ];
  const seen = new Set<Element>();
  const ogImage = metaContent(doc, ['og:image']);
  const entries: Array<{ el: Element; option: JevOption }> = [];
  const add = (el: Element | null) => {
    if (!el || seen.has(el) || isBoiler(el)) return;
    seen.add(el);
    const w = proseWords(el);
    if (w < 160) return;
    const total = wordsOf(el);
    const ld = total ? linkWords(el) / total : 1;
    const parentProse = el.parentElement ? Math.max(1, proseWords(el.parentElement)) : w;
    const hasTitle = Boolean(el.querySelector('h1,h2'));
    // Second producer: how much of Readability's canonical article tail this
    // candidate actually contains. Fuses the library's judgment into JEV.
    let readableTail = 0;
    if (tailWords.length) {
      const text = (el.textContent || '').toLowerCase();
      let hit = 0;
      for (const word of tailWords) if (text.includes(word)) hit += 1;
      readableTail = hit / tailWords.length;
    }
    const contentImages = contentImageCount(el, ogImage);
    const totalImages = el.querySelectorAll('img').length;
    const scores = {
      substance: clamp01(w / 900),
      focus: clamp01(w / parentProse),
      linkClean: 1 - clamp01(ld * 2),
      titleAlign: hasTitle ? 1 : 0,
      notPreview: 1 - previewPenalty(el),
      readableTail,
      contentMedia: contentImages > 0 || Boolean(el.querySelector('video,audio')) ? 1 : 0,
      imageClean: totalImages ? contentImages / totalImages : 1,
    };
    entries.push({
      el,
      option: {
        id: `root-${entries.length}`,
        kind: 'content-root',
        cost: 0,
        scores,
      },
    });
  };

  sels.forEach((sel) => doc.querySelectorAll(sel).forEach((el) => add(el)));
  let generic: Element | null = contentContainer(doc);
  for (let i = 0; i < 3 && generic; i++) {
    add(generic);
    generic = generic.parentElement;
  }

  const weights: Record<string, number> = {
    substance: 0.22,
    focus: 0.22,
    linkClean: 0.18,
    titleAlign: 0.13,
    notPreview: 0.25,
    readableTail: 0.3,
    contentMedia: 0.12,
    imageClean: 0.08,
  };
  const options: JevOption[] = entries.map(({ option }) => {
    const confidence = clamp01(elementValue(option, weights));
    return { ...option, scores: { ...option.scores, confidence } };
  });
  const byId = new Map(entries.map((e, i) => [options[i].id, e.el]));
  const policy: JevPolicy = { budgetRemaining: 1, maxCost: 0, minConfidence: 0.45, weights };
  const decision = decide(options, policy);
  const element = decision.kind === 'select' && decision.optionId ? byId.get(decision.optionId) : undefined;
  return { decision, option: element ? { ...(options.find((o) => o.id === decision.optionId) as JevOption), element } : undefined, options, policy };
}

function blockScore(el: Element): number {
  const tag = el.tagName.toLowerCase();
  const words = wordsOf(el);
  const ld = words ? linkWords(el) / words : 1;
  const hint = hintOf(el);
  let score = 0.35;
  if (/^h[1-6]$/.test(tag) && words >= 2) score += 0.1;
  if (tag === 'p' || tag === 'blockquote' || tag === 'pre' || tag === 'figure') score += 0.2;
  score += Math.min(0.5, words / 120);
  score -= Math.min(0.6, ld);
  if (CHROME_HINT.test(hint)) score -= 0.6;
  if (READ_MORE.test((el.textContent || '').trim()) && words < 30) score -= 0.5;
  return clamp01(score);
}

// 3. Boundaries: selectMany over ordered blocks keeps only real content blocks;
//    start is the first kept block, end the last.
function boundaries(root: Element): { start: Element | null; end: Element | null; decision: JevDecision; policy: JevPolicy; kept: number; total: number } {
  const blocks = Array.from(root.querySelectorAll(BLOCK_SEL)).filter((b) => {
    if (isBoiler(b)) return false;
    const parent = b.parentElement;
    if (parent && parent.closest('blockquote, figure, li')) return false;
    return wordsOf(b) > 0;
  });
  const options: JevOption[] = blocks.map((el, i) => {
    const score = blockScore(el);
    return { id: `b${i}`, kind: 'content-block', cost: 0, scores: { content: score, confidence: score } };
  });
  const policy: JevPolicy = { budgetRemaining: 1, maxCost: 0, minConfidence: 0.45, weights: { content: 1 } };
  const slate = selectMany(options, policy, options.length);
  const kept = new Set(slate.picks.map((p) => p.option.id));
  const keptEls = blocks.filter((_, i) => kept.has(`b${i}`));
  const decision: JevDecision = {
    kind: keptEls.length ? 'select' : 'skip_all',
    optionId: keptEls.length ? `b${blocks.indexOf(keptEls[0])}` : null,
    action: keptEls.length ? 'content-block' : 'skip',
    value: slate.picks[0]?.value ?? 0,
    reasons: slate.picks.length
      ? [`kept ${keptEls.length}/${blocks.length} content blocks`, ...(slate.picks[0]?.reasons ?? [])]
      : ['no block met the content threshold'],
    budgetAfter: 1,
    escalated: false,
  };
  let endEl: Element | null = keptEls[keptEls.length - 1] ?? blocks[blocks.length - 1] ?? null;
  // A short concluding paragraph can score below the keep threshold and get
  // cut, dropping the tip above real content. Extend the end forward across a
  // few trailing prose blocks, stopping at any heading or chrome.
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

function authorCandidates(doc: Document, root: Element | null): Array<{ value: string; score: number; source: string }> {
  const out: Array<{ value: string; score: number; source: string }> = [];
  const push = (value?: string | null, score = 0, source = '') => {
    const v = (value || '').trim();
    if (!v || v.length > 120) return;
    out.push({ value: v, score, source });
  };
  push(metaContent(doc, ['article:author', 'author']), 0.95, 'meta-author');
  push(doc.querySelector('[itemprop="author"] [itemprop="name"], [itemprop="author"]')?.textContent, 0.85, 'itemprop-author');
  push(doc.querySelector('[rel="author"]')?.textContent, 0.8, 'rel-author');
  if (root) {
    const byline = root.querySelector('[class*="author" i], [class*="byline" i], [class*="written-by" i]');
    push(byline?.textContent, 0.7, 'byline');
  }
  const meta = doc.querySelector('[class*="author" i], [class*="byline" i]');
  push(meta?.textContent, 0.5, 'page-author-element');
  return out;
}

function pickAuthor(doc: Document, root: Element | null): { value: string; decision: JevDecision | null; policy: JevPolicy | null } {
  const candidates = authorCandidates(doc, root);
  if (!candidates.length) return { value: '', decision: null, policy: null };
  const options: JevOption[] = candidates.map((c, i) => ({
    id: `author-${i}`,
    kind: 'author',
    cost: 0,
    scores: { signal: c.score, confidence: c.score },
    meta: { value: c.value, source: c.source },
  }));
  const policy: JevPolicy = { budgetRemaining: 1, maxCost: 0, minConfidence: 0.4, weights: { signal: 1 } };
  const decision = decide(options, policy);
  const winner = decision.kind === 'select' ? (options.find((o) => o.id === decision.optionId)?.meta as { value: string } | undefined) : undefined;
  return { value: winner?.value ?? '', decision, policy };
}

function fingerprint(title: string, text: string): string {
  let h = 0x811c9dc5;
  const norm = (title + '\n' + text).toLowerCase().replace(/\s+/g, ' ').slice(0, 8000);
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8);
}

// Structured-data types (schema.org JSON-LD) map to the content kinds we tip.
function schemaTypes(doc: Document): string[] {
  const out: string[] = [];
  doc.querySelectorAll('script[type="application/ld+json"]').forEach((node) => {
    let data: unknown;
    try {
      data = JSON.parse(node.textContent || 'null');
    } catch {
      return;
    }
    const walk = (value: unknown): void => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(walk);
        return;
      }
      if (typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      const t = record['@type'];
      if (typeof t === 'string') out.push(t.toLowerCase());
      else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && out.push(x.toLowerCase()));
      for (const nested of Object.values(record)) walk(nested);
    };
    walk(data);
  });
  return out;
}

// 4b. Content type. Content is broad — articles, video, audio/podcasts,
//     galleries, papers, code, discussions — inferred from schema.org, OG, and
//     media elements, then decided by JEV.
function pickType(doc: Document, root: Element | null): { decision: JevDecision; policy: JevPolicy; options: JevOption[]; type: ContentType } {
  const types = schemaTypes(doc);
  const has = (re: RegExp): number => (types.some((t) => re.test(t)) ? 1 : 0);
  const og = metaContent(doc, ['og:type']).toLowerCase();
  const hEntry = Boolean(doc.querySelector('.h-entry, [class~="h-entry"], article.h-entry'));
  const hasVideo = Boolean(
    doc.querySelector('video, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="player"], [itemprop="video"], meta[property="og:video"]'),
  );
  const hasAudio = Boolean(
    doc.querySelector('audio, [itemprop="audio"], meta[property*="audio"], iframe[src*="spotify"], iframe[src*="anchor.fm"], iframe[src*="podcast"]'),
  );
  const scope = root ?? doc;
  const ogImage = metaContent(doc, ['og:image']);
  const contentImgs = contentImageCount(scope, ogImage);
  const paraCount = scope.querySelectorAll('p').length;
  const hasCode = Boolean(scope.querySelector('pre, pre code, code'));
  const hasDiscussion = Boolean(doc.querySelector('form, textarea, [class*="comment" i]'));

  const weights: Record<string, number> = { schema: 0.7, og: 0.4, media: 0.4, gallery: 0.3, code: 0.3, discussion: 0.3 };
  const mk = (type: ContentType, scores: Record<string, number>): JevOption => {
    const confidence = clamp01(elementValue({ id: type, kind: type, cost: 0, scores }, weights));
    return { id: type, kind: type, cost: 0, scores: { ...scores, confidence } };
  };
  const options: JevOption[] = [
    mk('article', { schema: has(/article|blogposting|newsarticle|techarticle/) ? 1 : hEntry ? 0.8 : 0, og: og.startsWith('article') ? 1 : 0 }),
    mk('paper', { schema: has(/scholarlyarticle|report|thesis/) ? 1 : 0, og: og === 'book' ? 1 : 0 }),
    mk('video', { schema: has(/videoobject/) ? 1 : 0, og: og.startsWith('video') ? 1 : 0, media: hasVideo ? 1 : 0 }),
    mk('audio', { schema: has(/audioobject|podcastepisode|podcastseries/) ? 1 : 0, og: og.startsWith('music') ? 1 : 0, media: hasAudio ? 1 : 0 }),
    mk('gallery', { schema: has(/imagegallery|imageobject/) ? 1 : 0, gallery: contentImgs >= 4 && paraCount <= 4 ? 1 : 0 }),
    mk('code', { schema: has(/softwaresourcecode|softwareapplication/) ? 1 : 0, code: hasCode ? 1 : 0 }),
    mk('discussion', { schema: has(/discussionforumposting|question/) ? 1 : 0, discussion: hasDiscussion ? 1 : 0 }),
  ];
  const policy: JevPolicy = { budgetRemaining: 1, maxCost: 0, minConfidence: 0.35, weights };
  const decision = decide(options, policy);
  const type = (decision.kind === 'select' ? decision.action : 'article') as ContentType;
  return { decision, policy, options, type };
}

function pickMedia(doc: Document, root: Element | null): Element | null {
  const sel =
    'video, audio, iframe[src*="youtube"], iframe[src*="vimeo"], iframe[src*="player"], iframe[src*="spotify"], iframe[src*="anchor.fm"], [itemprop="video"], [itemprop="audio"]';
  return (root ?? doc).querySelector(sel) || doc.querySelector(sel);
}

// For a gallery, the tip belongs after the last content figure, not after a
// stray image.
function lastContentFigure(root: Element, ogImage: string): Element | null {
  const figures = Array.from(root.querySelectorAll('figure')).filter((f) => contentImageCount(f, ogImage) > 0);
  return figures.length ? figures[figures.length - 1] : null;
}

// 5. Eligibility: the final JEV gate. One option (render the tip); if its
//    confidence falls below policy, decide() escalates and we stay silent.
function eligibility(input: {
  kindConfidence: number;
  rootConfidence: number;
  boundRatio: number;
  substance: number;
  authorPresent: number;
  mediaPresent: number;
}): { decision: JevDecision; policy: JevPolicy; options: JevOption[] } {
  const weights: Record<string, number> = {
    kindConfidence: 0.25,
    rootConfidence: 0.25,
    boundRatio: 0.2,
    substance: 0.2,
    author: 0.05,
    media: 0.05,
  };
  const scores = {
    kindConfidence: input.kindConfidence,
    rootConfidence: input.rootConfidence,
    boundRatio: input.boundRatio,
    substance: input.substance,
    author: input.authorPresent,
    media: input.mediaPresent,
  };
  const confidence = clamp01(elementValue({ id: 'render', kind: 'tip', cost: 0, scores }, weights));
  const options: JevOption[] = [{ id: 'render', kind: 'tip', cost: 0, scores: { ...scores, confidence } }];
  const policy: JevPolicy = { budgetRemaining: 1, maxCost: 0, minConfidence: 0.45, weights };
  return { decision: decide(options, policy), policy, options };
}


export function mapPage(rootNode: ParentNode = document): PageMap {
  const doc = (rootNode as Document).documentElement ? (rootNode as Document) : document;
  const classified = classify(doc);
  const kind = (classified.decision.kind === 'select' ? classified.decision.action : 'unknown') as PageKind;

  const lines: string[] = [`PAGE KIND → ${kind.toUpperCase()}`, ...classified.decision.reasons.map((r) => `  ${r}`)];

  const empty: PageMap = {
    kind,
    kindDecision: classified.decision,
    contentType: 'unknown',
    typeDecision: null,
    eligibility: null,
    root: null,
    rootDecision: null,
    start: null,
    end: null,
    media: null,
    anchor: null,
    author: '',
    authorDecision: null,
    title: '',
    canonical: '',
    siteName: '',
    wordCount: 0,
    fingerprint: '',
    links: [],
    candidates: classified.options.map((o) => ({ id: o.id, kind: o.kind, cost: o.cost, context: o.id, scores: o.scores })),
    trace: lines.join('\n'),
  };
  const kindConfidence = clamp01(classified.decision.value);
  if (kind !== 'content') return empty;

  // Readability as a second producer: its canonical article tail feeds the
  // root decision, so JEV arbitrates between raw DOM candidates and the library.
  const reader = extractContent();
  const tailWords = (reader?.excerptTail || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(-120);

  const picked = pickRoot(doc, tailWords);
  const root = picked.option?.element ?? null;
  if (picked.decision.kind === 'select' && picked.policy) {
    lines.push('');
    lines.push(renderTrace(picked.decision, picked.options, picked.policy));
  }
  const effectiveRoot = root ?? contentContainer(doc);
  const bounds = boundaries(effectiveRoot);
  lines.push('');
  lines.push(`CONTENT BOUNDS → ${bounds.start?.tagName.toLowerCase() ?? 'none'} … ${bounds.end?.tagName.toLowerCase() ?? 'none'}`);
  bounds.decision.reasons.forEach((r) => lines.push(`  ${r}`));

  const author = pickAuthor(doc, effectiveRoot);
  if (author.decision && author.policy) {
    lines.push('');
    lines.push(renderTrace(author.decision, [], author.policy).split('\n')[0]);
    author.decision.reasons.forEach((r) => lines.push(`  author: ${r}`));
  }

  const media = pickMedia(doc, effectiveRoot);
  const type = pickType(doc, effectiveRoot);
  const galleryFigure = lastContentFigure(effectiveRoot, metaContent(doc, ['og:image']));
  const anchor =
    (type.type === 'video' || type.type === 'audio') && media
      ? media
      : type.type === 'gallery' && galleryFigure
        ? galleryFigure
        : bounds.end;
  lines.push('');
  lines.push(`CONTENT TYPE → ${type.type.toUpperCase()}`);
  type.decision.reasons.forEach((r) => lines.push(`  ${r}`));

  const canonical =
    doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || doc.location?.href || '';
  const title =
    metaContent(doc, ['og:title', 'twitter:title']) ||
    (effectiveRoot.querySelector('h1,h2')?.textContent || '').trim() ||
    (doc.querySelector('h1')?.textContent || '').trim() ||
    doc.title ||
    'Untitled';
  const text = (effectiveRoot.textContent || '').trim();
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  const elig = eligibility({
    kindConfidence,
    rootConfidence: clamp01(picked.decision.value),
    boundRatio: bounds.total ? bounds.kept / bounds.total : 0,
    substance: clamp01(wordCount / 600),
    authorPresent: author.value ? 1 : 0,
    mediaPresent: media ? 1 : 0,
  });
  lines.push('');
  lines.push(renderTrace(elig.decision, elig.options, elig.policy));

  const links = Array.from(effectiveRoot.querySelectorAll('a[href]'))
    .map((a) => (a as HTMLAnchorElement).href)
    .filter((href) => /^https?:/.test(href))
    .filter((href, i, all) => all.indexOf(href) === i)
    .slice(0, 50);

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
    canonical: canonical ? new URL(canonical, doc.location?.href || undefined).href : doc.location?.href || '',
    siteName: metaContent(doc, ['og:site_name']) || (doc.location?.hostname || '').replace(/^www\./, ''),
    wordCount,
    fingerprint: fingerprint(title, text),
    links,
    candidates: picked.options.map((o) => ({
      id: o.id,
      kind: o.kind,
      cost: o.cost,
      context: `${o.id} words=?`,
      scores: o.scores,
    })),
    trace: lines.join('\n'),
  };
}


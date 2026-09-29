// Content extraction: identify THE article on an arbitrary page.
// Uses Mozilla Readability (the library behind Firefox Reader Mode) to decide
// whether a page is an article and to extract title/byline/text — the same
// industry-standard approach other extensions use, instead of word heuristics.
import { Readability, isProbablyReaderable } from '@mozilla/readability';

export type ExtractedContent = {
  url: string;
  canonicalUrl: string;
  title: string;
  author: string;
  siteName: string;
  fingerprint: string;
  wordCount: number;
  excerptTail: string;
};

function metaContent(names: string[]): string {
  for (const name of names) {
    const el =
      document.querySelector(`meta[property="${name}"]`) ||
      document.querySelector(`meta[name="${name}"]`);
    const content = el?.getAttribute('content')?.trim();
    if (content) return content;
  }
  return '';
}

function authorFromPage(): string {
  return (
    metaContent(['article:author', 'author', 'twitter:creator']) ||
    document.querySelector('[rel="author"]')?.textContent?.trim() ||
    document.querySelector('[itemprop="author"]')?.textContent?.trim() ||
    ''
  );
}

function fingerprint(text: string): string {
  // FNV-1a 32-bit over normalized text — identifies the piece across URL
  // variants. NOT cryptographic; the backend re-fingerprints authoritatively.
  let h = 0x811c9dc5;
  const norm = text.toLowerCase().replace(/\s+/g, ' ').slice(0, 8000);
  for (let i = 0; i < norm.length; i++) {
    h ^= norm.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return ('0000000' + (h >>> 0).toString(16)).slice(-8);
}

function isWalletAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test((value || '').trim());
}

// Explicit recipient signals a creator publishes to receive tips. These are
// declared (not guessed): meta tags, payment links, data attributes. Used
// for routing convenience only — never for security decisions (claim
// verification re-checks everything server-side).
export function recipientWalletFromPage(root: ParentNode = document): string {
  const found = recipientWalletsFromPage(root);
  return found.length ? found[0].address : '';
}

export type PageWalletCandidate = { address: string; context: string };

// ALL wallet-looking recipient signals on the page, each with the surrounding
// context an LLM needs to judge authorship. Feeds the hub JEV proposer as a
// last resort when nothing resolves — rules first, model only for ambiguity.
export function recipientWalletsFromPage(root: ParentNode = document): PageWalletCandidate[] {
  const doc = root as Document;
  const seen = new Set<string>();
  const out: PageWalletCandidate[] = [];
  const push = (address: string, context: string) => {
    const clean = (address || '').trim();
    if (!isWalletAddress(clean)) return;
    const key = clean.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ address: clean, context: String(context || '').replace(/\s+/g, ' ').trim().slice(0, 300) });
  };
  const meta = ['nibgate:recipient', 'nibgate:wallet', 'nibgate:tip-to'];
  for (const name of meta) {
    const el = doc.querySelector?.(`meta[property="${name}"],meta[name="${name}"]`);
    push(el?.getAttribute?.('content') || '', 'page metadata: declared tip recipient');
  }
  const paymentLinks = Array.from(doc.querySelectorAll?.('link[rel="payment"],a[rel="payment"]') || []);
  for (const el of paymentLinks.slice(0, 4)) {
    const href = (el as Element).getAttribute?.('href') || '';
    const ethMatch = href.match(/ethereum:(0x[a-fA-F0-9]{40})/i);
    if (ethMatch) push(ethMatch[1], `payment link: ${(el as Element).textContent || href}`.slice(0, 300));
  }
  const tagged = doc.querySelector?.('[data-nibgate-recipient]');
  push(tagged?.getAttribute?.('data-nibgate-recipient') || '', 'tagged recipient slot on the page');
  // Bare addresses near authorship signals (bylines, author blocks).
  const authorZones = Array.from(
    doc.querySelectorAll?.('[rel="author"],[itemprop="author"],.byline,.author,.post-author,.entry-author,address') || [],
  );
  const addrRe = /0x[a-fA-F0-9]{40}/g;
  for (const zone of authorZones.slice(0, 6)) {
    const text = zone.textContent || '';
    let m: RegExpExecArray | null;
    while ((m = addrRe.exec(text)) !== null && out.length < 8) {
      push(m[0], `near author credit: ${text.slice(Math.max(0, m.index - 80), m.index + 120)}`);
    }
    if (out.length >= 8) break;
  }
  return out.slice(0, 8);
}

// SDK detection: does this page run Nibgate (widget script or site marker)?
// Drives rich-direct UI vs hold-flow UI. DOM-only, no network.
export function hasNibgateSdk(root: ParentNode = document): boolean {
  const doc = root as Document;
  if (doc.querySelector?.('script[src*="widget.js"][src*="nibgate"]')) return true;
  if (doc.querySelector?.('[data-nibgate-site],[data-nibgate-resource]')) return true;
  return false;
}

// Structural zones never represent the tippable work itself. They can have
// high prose density (comments/related links), so exclude them from both
// content detection and widget placement.
const BOILERPLATE_SELECTORS =
  'header, nav, footer, aside, form, dialog, [role="navigation"], [role="complementary"], [role="contentinfo"], [aria-hidden="true"], .comments, .comment, #comments, .sidebar, .widget, .related, .webring, .footer';
// Production content extractors pair semantic landmarks with Readability's
// likely/unlikely class signals: structural roles are positive, generic
// utility/chrome-ish class names are strongly negative unless the element is
// semantically an article region.
const UNLIKELY_CANDIDATE_PATTERN =
  /combx|comment|community|disqus|extra|foot|header|menu|remark|rss|shoutbox|sidebar|sponsor|ad-break|agegate|pagination|pager|popup|tweet|twitter|widget|related|footer/i;
const LIKELY_CANDIDATE_PATTERN = /and|article|body|column|content|main|post|text|blog|story|shadow/i;

function hasBoilerplateName(start: Element): boolean {
  const haystack = `${start.id || ''} ${start.getAttribute('class') || ''}`.trim();
  if (haystack.length < 2) return false;
  return UNLIKELY_CANDIDATE_PATTERN.test(haystack) && !LIKELY_CANDIDATE_PATTERN.test(haystack);
}

export function isBoilerplateZone(start: Element | null): boolean {
  if (!start) return false;
  if (hasBoilerplateName(start)) return true;
  return Boolean(start.closest(BOILERPLATE_SELECTORS));
}

function proseLength(element: Element): number {
  let score = 0;
  element.querySelectorAll('p, blockquote, li').forEach((paragraph) => {
    if (isBoilerplateZone(paragraph)) return;
    score += Math.min(((paragraph.textContent || '').trim()).length, 2000);
  });
  return score;
}
// The element that holds the page's main content — where the inline tip
// widget is embedded. Picks the highest non-boilerplate prose-density
// container (sum of paragraph text) so plain-<div> articles beat related
// links/comments/nav, preferring the deepest element on ties.
export function contentContainer(root: ParentNode = document): Element {
  const doc = root as Document;
  const candidates = Array.from(
    doc.querySelectorAll?.('article, main, [role="main"], section, div') ?? [],
  ) as Element[];
  const depthOf = (el: Element): number => {
    let d = 0;
    let n: Element | null = el;
    while (n?.parentElement) {
      d++;
      n = n.parentElement;
    }
    return d;
  };
  let best: Element | null = null;
  let bestScore = -1;
  let bestDepth = -1;
  for (const el of candidates) {
    if (isBoilerplateZone(el)) continue;
    const paras = el.querySelectorAll('p, blockquote, li');
    const isContentTag = el.tagName === 'ARTICLE' || el.tagName === 'MAIN' || el.getAttribute('role') === 'main';
    if (paras.length < 2 && !isContentTag) continue;
    const score = proseLength(el);
    const depth = depthOf(el);
    if (score > bestScore || (score === bestScore && depth > bestDepth)) {
      best = el;
      bestScore = score;
      bestDepth = depth;
    }
  }
  return best || doc.body || document.body;
}

export function extractContent(): ExtractedContent | null {
  // Fast gate: is this plausibly an article? (Skips dashboards/apps/consoles.)
  let readerable = false;
  try {
    readerable = isProbablyReaderable(document, { minContentLength: 240, minScore: 24 });
  } catch {
    return null;
  }
  if (!readerable) return null;

  let parsed: ReturnType<Readability['parse']> = null;
  try {
    // Clone so we never mutate the live page (Readability prunes nodes).
    parsed = new Readability(document.cloneNode(true) as Document).parse();
  } catch {
    return null;
  }
  if (!parsed || !parsed.textContent || (parsed.length ?? 0) < 200) return null;

  const canonical =
    document.querySelector('link[rel="canonical"]')?.getAttribute('href') ||
    window.location.href.split('#')[0];
  const text = parsed.textContent.trim();
  const words = text.split(/\s+/).filter(Boolean);
  return {
    url: window.location.href.split('#')[0],
    canonicalUrl: new URL(canonical, window.location.href).href,
    title: parsed.title || metaContent(['og:title', 'twitter:title']) || document.title || 'Untitled',
    author: parsed.byline || authorFromPage(),
    siteName: parsed.siteName || metaContent(['og:site_name']) || window.location.hostname.replace(/^www\./, ''),
    fingerprint: fingerprint((parsed.title || '') + '\n' + text),
    wordCount: words.length,
    // Last words of the canonical reader text. These anchor the live
    // placement marker to the real ending, not a visually similar sidebar,
    // code block, or footer.
    excerptTail: words.slice(-120).join(' '),
  };
}

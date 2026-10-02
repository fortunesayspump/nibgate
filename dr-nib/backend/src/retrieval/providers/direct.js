// Direct extraction — the free path.
//
// No key, no credits: fetch the page ourselves and reduce it to readable text.
// This is deliberately the humblest tool in the box, and it obeys the rules
// FLOW.md sets for all tooling: robots.txt is respected, paywalled and
// login-walled pages are skipped rather than worked around, and quotes stay
// within fair use (we keep passages, not whole articles).
const UA = 'DrNibResearch/1.0 (+https://nibgate.xyz; research agent, respects robots.txt)';

// robots.txt per origin, cached for the process lifetime. A robots file we
// cannot fetch is treated as "no rules" — failing closed on a fetch error
// would blacklist half the web over transient network blips.
const robotsCache = new Map();

async function robotsAllows(url, fetchImpl) {
  let origin;
  try { origin = new URL(url).origin; } catch { return false; }
  if (!robotsCache.has(origin)) {
    robotsCache.set(origin, (async () => {
      try {
        const res = await fetchImpl(`${origin}/robots.txt`, { headers: { 'user-agent': UA } });
        if (!res.ok) return [];
        const text = await res.text();
        return parseRobots(text);
      } catch {
        return [];
      }
    })());
  }
  const rules = await robotsCache.get(origin);
  try {
    const path = new URL(url).pathname;
    return !rules.some((dis) => dis && path.startsWith(dis));
  } catch {
    return false;
  }
}

function parseRobots(text) {
  const disallows = [];
  let applies = false;
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;
    const [field, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    if (/^user-agent$/i.test(field)) {
      applies = value === '*' || /drnib/i.test(value);
    } else if (applies && /^disallow$/i.test(field) && value) {
      disallows.push(value);
    }
  }
  return disallows;
}

const PAYWALL_MARKERS = [
  /subscribe to (continue|read|access)/i,
  /sign in to (continue|read|access)/i,
  /this article is for subscribers/i,
  /to continue reading, .* (subscribe|sign in)/i,
  /paywall/i,
  /meteredAccess/i,
];

function looksPaywalled(text) {
  return PAYWALL_MARKERS.some((re) => re.test(text));
}

// File types, by what we can honestly do with them today. Text-like formats
// are parsed in-house with no dependencies. Binary formats (PDF, Word, Excel)
// are refused with a named reason — not crashed on, not silently dropped — so
// adding a parser later is additive, never a behavior change to existing paths.
const TEXT_TYPES = [
  'text/plain', 'text/markdown', 'text/csv', 'text/tab-separated-values',
  'application/json', 'application/x-ndjson', 'text/xml', 'application/xml',
];
const TEXT_EXTS = new Set(['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.jsonl', '.ndjson', '.xml', '.log']);

function classifyBody(contentType, url, sample = '') {
  const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (ct.startsWith('text/html') || ct === 'application/xhtml+xml') return 'html';
  if (TEXT_TYPES.includes(ct)) return 'text';
  // A declared, recognized-otherwise type is authoritative: a server that says
  // application/pdf is not overruled by what the first bytes look like.
  if (ct) return 'unsupported';
  const ext = String(url).split('?')[0].split('.').pop()?.toLowerCase() || '';
  if (TEXT_EXTS.has(`.${ext}`)) return 'text';
  // No declared type and no known extension: sniff. Markup-looking bodies are
  // HTML; anything else is treated as text. Binary sniffs fall through to
  // unsupported rather than being mangled into mojibake.
  const head = String(sample || '').trimStart().slice(0, 200);
  if (/^</.test(head)) return 'html';
  if (/^[\x09\x0a\x0d\x20-\x7e\u00a0-\uffff]*$/.test(head)) return 'text';
  return 'unsupported';
}

function titleOf(html) {
  const m = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim().slice(0, 200) : '';
}

// Basic readability: drop scripts, styles, and chrome; keep headings,
// paragraphs, and list items in document order.
function htmlToText(html) {
  let s = String(html || '');
  s = s.replace(/<script[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<nav[\s\S]*?<\/nav>/gi, ' ');
  s = s.replace(/<header[\s\S]*?<\/header>/gi, ' ');
  s = s.replace(/<footer[\s\S]*?<\/footer>/gi, ' ');
  s = s.replace(/<aside[\s\S]*?<\/aside>/gi, ' ');
  s = s.replace(/<(h1|h2|h3|h4|p|li|blockquote|pre|td)[^>]*>/gi, '\n$1: ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
  s = s.split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 40).join('\n');
  return s;
}

/**
 * Extract readable text from URLs directly. Free; metered at zero.
 * @returns {Promise<{documents:Array, skipped:Array, costUsd:0}>}
 */
export async function directExtract({ urls, maxChars = 20000, timeoutMs = 20000 } = {}, { fetchImpl = fetch } = {}) {
  const list = Array.isArray(urls) ? urls.filter(Boolean).slice(0, 20) : [];
  const documents = [];
  const skipped = [];
  for (const url of list) {
    try {
      const allowed = await robotsAllows(url, fetchImpl);
      if (!allowed) { skipped.push({ url, reason: 'robots-disallow' }); continue; }
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('fetch timed out')), timeoutMs);
      let res;
      try {
        res = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (res.status === 401 || res.status === 403) { skipped.push({ url, reason: `http-${res.status}` }); continue; }
      if (!res.ok) { skipped.push({ url, reason: `http-${res.status}` }); continue; }
      const raw = await res.text();
      const kind = classifyBody(res.headers?.get ? res.headers.get('content-type') : null, url, raw);
      if (kind === 'unsupported') { skipped.push({ url, reason: 'unsupported-type' }); continue; }
      if (kind === 'text') {
        const text = raw.replace(/\r\n/g, '\n').trim().slice(0, maxChars);
        if (text.length < 50) { skipped.push({ url, reason: 'no-readable-text' }); continue; }
        documents.push({ url, title: titleOf(url), text, provider: 'direct', costUsd: 0 });
        continue;
      }
      const html = raw;
      if (looksPaywalled(html)) { skipped.push({ url, reason: 'paywalled' }); continue; }
      const text = htmlToText(html).slice(0, maxChars);
      if (text.length < 200) { skipped.push({ url, reason: 'no-readable-text' }); continue; }
      documents.push({ url, title: titleOf(html), text, provider: 'direct', costUsd: 0 });
    } catch (err) {
      skipped.push({ url, reason: `fetch-error: ${String(err?.message || err).slice(0, 80)}` });
    }
  }
  return { documents, skipped, costUsd: 0 };
}

export function __clearRobotsCache() { robotsCache.clear(); }

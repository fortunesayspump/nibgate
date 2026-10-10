// Direct extraction — the free path.
//
// No key, no credits: fetch the page ourselves and reduce it to readable text.
// This is deliberately the humblest tool in the box, and it obeys the rules
// FLOW.md sets for all tooling: robots.txt is respected, paywalled and
// login-walled pages are skipped rather than worked around, and quotes stay
// within fair use (we keep passages, not whole articles).
//
// PDFs download and read too (text layer via unpdf, pure JS, no native deps):
// papers, filings, and reports are first-class evidence, not refusals.
// Scanned/image PDFs have no text to extract and are reported as such.
import { extractText as extractPdfText } from 'unpdf';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { mapLimit } from '../util.js';

const UA = 'DrNibResearch/1.0 (+https://nibgate.xyz; research agent, respects robots.txt)';

// robots.txt per origin, cached for the process lifetime. A robots file we
// cannot fetch is treated as "no rules" — failing closed on a fetch error
// would blacklist half the web over transient network blips.
const robotsCache = new Map();

async function robotsAllows(url, fetchImpl, timeoutMs = 8000) {
  let origin;
  try { origin = new URL(url).origin; } catch { return false; }
  if (!robotsCache.has(origin)) {
    robotsCache.set(origin, (async () => {
      // robots.txt must never hang a slot: a dead origin fails open fast.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(new Error('robots timed out')), timeoutMs);
      try {
        const res = await fetchImpl(`${origin}/robots.txt`, { headers: { 'user-agent': UA }, signal: controller.signal });
        if (!res.ok) return [];
        const text = await res.text();
        return parseRobots(text);
      } catch {
        return [];
      } finally {
        clearTimeout(timer);
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
// and PDFs are parsed in-house with no native dependencies. Other binaries
// (Word, Excel) are refused with a named reason — not crashed on, not
// silently dropped — so adding a parser later is additive, never a behavior
// change to existing paths.
const TEXT_TYPES = [
  'text/plain', 'text/markdown', 'text/csv', 'text/tab-separated-values',
  'application/json', 'application/x-ndjson', 'text/xml', 'application/xml',
];
const TEXT_EXTS = new Set(['.txt', '.md', '.markdown', '.csv', '.tsv', '.json', '.jsonl', '.ndjson', '.xml', '.log']);

function looksPdf(contentType, url) {
  const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (ct === 'application/pdf' || ct === 'application/x-pdf') return true;
  const ext = String(url).split('?')[0].split('.').pop()?.toLowerCase() || '';
  return ext === 'pdf';
}

// Office formats, by content type or extension. Legacy .doc/.xls (OLE
// binaries) are NOT covered — only the modern OOXML (.docx/.xlsx/.pptx),
// which are zips of XML the agent reads without native code.
function officeKind(contentType, url) {
  const ct = String(contentType || '').split(';')[0].trim().toLowerCase();
  if (ct.includes('wordprocessingml')) return 'docx';
  if (ct.includes('spreadsheetml')) return 'xlsx';
  if (ct.includes('presentationml')) return 'pptx';
  const ext = String(url).split('?')[0].split('.').pop()?.toLowerCase() || '';
  if (ext === 'docx') return 'docx';
  if (ext === 'xlsx' || ext === 'xlsm') return 'xlsx';
  if (ext === 'pptx') return 'pptx';
  return null;
}

async function extractOffice(kind, buf) {
  if (kind === 'docx') {
    const out = await mammoth.extractRawText({ buffer: buf });
    return String(out?.value || '');
  }
  if (kind === 'xlsx') {
    const wb = XLSX.read(buf, { type: 'buffer', dense: true });
    const parts = [];
    for (const name of wb.SheetNames.slice(0, 5)) {
      const sheet = wb.Sheets[name];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      const lines = csv.split('\n').filter((l) => l.trim()).slice(0, 200);
      if (lines.length) parts.push(`Sheet: ${name}\n${lines.join('\n')}`);
    }
    return parts.join('\n\n');
  }
  // pptx: slides are XML in a zip; text lives in <a:t> runs, in order.
  const zip = await JSZip.loadAsync(buf);
  const slides = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => Number(a.match(/slide(\d+)/)[1]) - Number(b.match(/slide(\d+)/)[1]))
    .slice(0, 60);
  const parts = [];
  for (const [i, path] of slides.entries()) {
    const xml = await zip.files[path].async('string');
    const runs = [...xml.matchAll(/<a:t>([\s\S]*?)<\/a:t>/g)].map((m) => m[1].replace(/\s+/g, ' ').trim()).filter(Boolean);
    if (runs.length) parts.push(`Slide ${i + 1}:\n${runs.join('\n')}`);
  }
  return parts.join('\n\n');
}

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

// Bot-block pages carry fingerprints, not content. Matched against the raw
// HTML head so a tech article merely MENTIONING captchas never trips it.
const BLOCK_MARKERS = [
  /cf-challenge/i, /__cf_bm/i, /just a moment.*cloudflare/is,
  /checking your browser before you access/i, /verify you are (a )?human/i,
  /captcha-delivery/i, /perimeterx/i, /datadome/i, /_px_/i,
  /please verify you are not a robot/i, /ddos protection by/i,
];

function looksBlocked(html) {
  const head = String(html || '').slice(0, 8000);
  return BLOCK_MARKERS.some((re) => re.test(head));
}

/**
 * Extract readable text from URLs directly. Free; metered at zero.
 * @returns {Promise<{documents:Array, skipped:Array, costUsd:0}>}
 */
export async function directExtract({ urls, maxChars = 20000, timeoutMs = 12000 } = {}, { fetchImpl = fetch } = {}) {
  const list = Array.isArray(urls) ? urls.filter(Boolean).slice(0, 20) : [];
  // Pages are independent: fetch up to 6 at once instead of one by one.
  // The old serial loop turned 12 slow pages into minutes; the per-URL
  // timeout still bounds the worst case.
  const settled = await mapLimit(list, 6, (url) => extractOne(url, { maxChars, timeoutMs, fetchImpl }));
  const documents = [];
  const skipped = [];
  for (const r of settled) {
    if (r.document) documents.push(r.document);
    else skipped.push({ url: r.url, reason: r.reason });
  }
  return { documents, skipped, costUsd: 0 };
}

async function extractOne(url, { maxChars, timeoutMs, fetchImpl }) {
  const skip = (reason) => ({ url, reason });
  try {
    const allowed = await robotsAllows(url, fetchImpl);
    if (!allowed) return skip('robots-disallow');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('fetch timed out')), timeoutMs);
    let res;
    try {
      res = await fetchImpl(url, { headers: { 'user-agent': UA, accept: 'text/html' }, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) return skip(`http-${res.status}`);
    if (!res.ok) return skip(`http-${res.status}`);
    const contentType = res.headers?.get ? res.headers.get('content-type') : null;
    // One download, every path: bytes serve the document parsers and decode
    // once for the text paths. Anything over 10MB is not a readable page.
    // Test doubles that only implement text() still work: decode from text.
    const buf = typeof res.arrayBuffer === 'function'
      ? Buffer.from(await res.arrayBuffer())
      : Buffer.from(await res.text(), 'utf8');
    if (buf.length > 10 * 1024 * 1024) return skip('file-too-large');
    const office = officeKind(contentType, url);
    const pdfMagic = buf.subarray(0, 5).toString('latin1') === '%PDF-';
    if (office || looksPdf(contentType, url) || pdfMagic) {
      const isOffice = Boolean(office);
      try {
        let text;
        let pages = null;
        if (isOffice) {
          text = String(await extractOffice(office, buf) || '').replace(/\r\n/g, '\n').trim().slice(0, maxChars);
        } else {
          const { text: pages_text, totalPages } = await extractPdfText(new Uint8Array(buf));
          pages = totalPages || null;
          text = (Array.isArray(pages_text) ? pages_text.join('\n\n') : String(pages_text || '')).replace(/\r\n/g, '\n').trim().slice(0, maxChars);
        }
        if (text.length < 50) return skip(pages ? 'pdf-scanned-no-text' : 'no-readable-text');
        return { url, document: { url, title: decodeURIComponent(String(url).split('/').pop()?.split('?')[0] || url).slice(0, 200), text, pages, provider: 'direct', costUsd: 0 } };
      } catch {
        return skip(isOffice ? 'office-parse-failed' : 'unsupported-type');
      }
    }
    const raw = buf.toString('utf8');
    const kind = classifyBody(contentType, url, raw);
    if (kind === 'unsupported') return skip('unsupported-type');
    if (kind === 'text') {
      const text = raw.replace(/\r\n/g, '\n').trim().slice(0, maxChars);
      if (text.length < 50) return skip('no-readable-text');
      return { url, document: { url, title: titleOf(url), text, provider: 'direct', costUsd: 0 } };
    }
    const html = raw;
    if (looksPaywalled(html)) return skip('paywalled');
    if (looksBlocked(html)) return skip('blocked-bot-check');
    const text = htmlToText(html).slice(0, maxChars);
    if (text.length < 200) return skip('no-readable-text');
    return { url, document: { url, title: titleOf(html), text, provider: 'direct', costUsd: 0 } };
  } catch (err) {
    return skip(`fetch-error: ${String(err?.message || err).slice(0, 80)}`);
  }
}

export function __clearRobotsCache() { robotsCache.clear(); }

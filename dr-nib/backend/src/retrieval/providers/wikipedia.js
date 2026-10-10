// Wikipedia full-text search — free, keyless, generous limits.
//
// The general-knowledge backstop: no keyed provider needed to answer "what is
// X". Snippets come back as HTML with match highlights; tags are stripped.
// Capped small — an encyclopedia explains, it never covers last-90-days data.
const BASE = 'https://en.wikipedia.org/w/api.php';

const stripHtml = (s) => String(s || '').replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/**
 * @returns {Promise<{results:Array, costUsd:0, raw:object}>}
 */
export async function wikipediaSearch({ query, maxResults = 5 } = {}, { fetchImpl } = {}) {
  const n = Math.min(Math.max(Number(maxResults) || 5, 1), 10);
  const url = `${BASE}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=${n}&srprop=size&format=json&formatversion=2`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('wikipedia timed out')), 10000);
  let data;
  try {
    const fetchFn = fetchImpl || fetch;
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`wikipedia HTTP ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  const hits = Array.isArray(data?.query?.search) ? data.query.search : [];
  return {
    results: hits.slice(0, n).map((h) => ({
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(String(h.title || '').replace(/ /g, '_'))}`,
      title: stripHtml(h.title),
      snippet: stripHtml(h.snippet).slice(0, 1200),
      content: '',
      score: 0.6,
      provider: 'wikipedia',
      costUsd: 0,
    })).filter((r) => r.title),
    costUsd: 0,
    raw: { count: hits.length },
  };
}

export function isWikipediaAvailable() {
  return true; // no key, no account, no quota to check
}

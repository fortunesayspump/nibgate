// GDELT DOC API — free, keyless global news search.
//
// The closest thing to a free Google News: every broadcast, print, and web
// outlet GDELT monitors, updated every 15 minutes, searchable full-text with
// no key. This is what covers "what happened in the last 90 days" when the
// keyed providers are absent. Snippets are headlines plus outlet and date;
// the fetch stage opens the URLs for the actual text.
const BASE = 'https://api.gdeltproject.org/api/v2/doc/doc';

// GDELT asks one thing in return: no more than one request every 5 seconds
// per IP. Parallel queries would 429 each other, so calls page through a
// process-wide gate spaced just past the limit.
let nextAt = 0;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function pace() {
  const wait = nextAt - Date.now();
  if (wait > 0) await sleep(wait);
  nextAt = Date.now() + 5200;
}

/**
 * @returns {Promise<{results:Array, costUsd:0, raw:object}>}
 */
export async function gdeltSearch({ query, maxResults = 6 } = {}, { fetchImpl } = {}) {
  const n = Math.min(Math.max(Number(maxResults) || 6, 1), 20);
  const url = `${BASE}?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=${n}&format=json&sort=datedesc&timespan=3m`;
  // Politeness applies to the live API only — injected fetch doubles in tests
  // must not inherit a 5-second gate.
  if (!fetchImpl) await pace();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('gdelt timed out')), 15000);
  let data;
  try {
    const fetchFn = fetchImpl || fetch;
    const res = await fetchFn(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`gdelt HTTP ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  const articles = Array.isArray(data?.articles) ? data.articles : [];
  return {
    results: articles.slice(0, n).map((a) => ({
      url: a.url,
      title: String(a.title || '').trim(),
      snippet: `${a.domain || a.sourceCountry || 'unknown outlet'} · seen ${String(a.seendate || '').slice(0, 10)}${a.language && a.language !== 'English' ? ` · ${a.language}` : ''}`.slice(0, 400),
      content: '',
      score: 0.6,
      publishedDate: a.seendate || null,
      provider: 'gdelt',
      costUsd: 0,
    })).filter((r) => r.title && r.url),
    costUsd: 0,
    raw: { count: articles.length },
  };
}

export function isGdeltAvailable() {
  return true; // no key, no account
}

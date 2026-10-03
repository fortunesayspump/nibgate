// Stack Exchange network search — free at low quota without a key.
//
// Practitioners answering concrete technical questions: the closest thing to
// primary evidence for how-to, error-message, and tooling queries. Keyless
// quota is per-IP and small, so this stays capped and failures ride the
// circuit breaker like every other provider.
const BASE = 'https://api.stackexchange.com/2.3/search/advanced';

const unescape = (s) => String(s || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').trim();

/**
 * @returns {Promise<{results:Array, costUsd:0, raw:object}>}
 */
export async function stackexchangeSearch({ query, maxResults = 5 } = {}, { fetchImpl } = {}) {
  const n = Math.min(Math.max(Number(maxResults) || 5, 1), 10);
  const url = `${BASE}?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=stackoverflow&pagesize=${n}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('stackexchange timed out')), 20000);
  let data;
  try {
    const fetchFn = fetchImpl || fetch;
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`stackexchange HTTP ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    results: items.slice(0, n).map((it) => ({
      url: it.link,
      title: unescape(it.title),
      snippet: `Stack Overflow: score ${it.score ?? '?'} · ${it.answer_count ?? 0} answers${it.is_answered ? ' · answered' : ''} · ${(it.tags || []).slice(0, 4).join(', ')}`.slice(0, 600),
      content: '',
      score: 0.5,
      provider: 'stackexchange',
      costUsd: 0,
    })).filter((r) => r.title && r.url),
    costUsd: 0,
    raw: { count: items.length },
  };
}

export function isStackexchangeAvailable() {
  return true; // keyless quota; capped small by the caller
}

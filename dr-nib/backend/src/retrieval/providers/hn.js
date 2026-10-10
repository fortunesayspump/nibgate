// Hacker News Algolia search — free, keyless practitioner discourse.
//
// Years of engineers arguing about exactly the tooling, fee, and protocol
// questions research runs ask. Keyless quota is generous for capped use;
// failures ride the circuit breaker like every other provider.
const BASE = 'https://hn.algolia.com/api/v1/search';

/**
 * @returns {Promise<{results:Array, costUsd:0, raw:object}>}
 */
export async function hnSearch({ query, maxResults = 5 } = {}, { fetchImpl } = {}) {
  const n = Math.min(Math.max(Number(maxResults) || 5, 1), 10);
  const url = `${BASE}?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=${n}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('hn timed out')), 10000);
  let data;
  try {
    const fetchFn = fetchImpl || fetch;
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`hn HTTP ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  const hits = Array.isArray(data?.hits) ? data.hits : [];
  return {
    results: hits.slice(0, n).map((h) => ({
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      title: String(h.title || '').trim(),
      snippet: `Hacker News: ${h.points ?? '?'} points · ${h.num_comments ?? 0} comments · ${String(h.created_at || '').slice(0, 10)}`.slice(0, 400),
      content: '',
      score: 0.5,
      publishedDate: h.created_at || null,
      provider: 'hn',
      costUsd: 0,
    })).filter((r) => r.title && r.url),
    costUsd: 0,
    raw: { count: hits.length },
  };
}

export function isHnAvailable() {
  return true; // keyless quota
}

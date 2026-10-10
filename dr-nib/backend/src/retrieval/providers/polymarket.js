// Polymarket Gamma public search — free, keyless prediction-market board.
//
// For "will X happen" topics the order book IS the evidence: live prices,
// volumes, and liquidity on the exact question. Keyless and open; parsing is
// defensive because the Gamma schema drifts — an unexpected shape yields
// empty, never a throw past HTTP errors.
const BASE = 'https://gamma-api.polymarket.com/public-search';

/**
 * @returns {Promise<{results:Array, costUsd:0, raw:object}>}
 */
export async function polymarketSearch({ query, maxResults = 5 } = {}, { fetchImpl } = {}) {
  const n = Math.min(Math.max(Number(maxResults) || 5, 1), 10);
  const url = `${BASE}?q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('polymarket timed out')), 10000);
  let data;
  try {
    const fetchFn = fetchImpl || fetch;
    const res = await fetchFn(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`polymarket HTTP ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  const items = Array.isArray(data) ? data : data?.markets || data?.events || [];
  return {
    results: items.slice(0, n).map((m) => {
      const slug = m?.slug || m?.event_slug || (m?.events || [])[0]?.slug;
      if (!slug) return null;
      const outcomes = Array.isArray(m?.outcomes) ? m.outcomes : [];
      const prices = Array.isArray(m?.outcomePrices) ? m.outcomePrices : [];
      const board = outcomes.map((o, i) => `${o} ${prices[i] ? `(${(Number(prices[i]) * 100).toFixed(0)}¢)` : ''}`).join(' / ');
      return {
        url: `https://polymarket.com/event/${slug}`,
        title: String(m?.question || m?.title || '').trim(),
        snippet: `Prediction market${m?.volume ? ` · volume $${Number(m.volume).toLocaleString()}` : ''}${board ? ` · ${board}` : ''}`.slice(0, 600),
        content: '',
        score: 0.5,
        provider: 'polymarket',
        costUsd: 0,
      };
    }).filter((r) => r && r.title),
    costUsd: 0,
    raw: { count: items.length },
  };
}

export function isPolymarketAvailable() {
  return true; // public endpoint, no key
}

// Exa adapter — semantic / academic search and content retrieval.
//
// Contract (https://docs.exa.ai): POST /search with `x-api-key`. `type` selects
// the mode (auto / fast / deep-lite / deep / deep-reasoning); `contents.text`
// and `contents.highlights` pull passages in the same call. Responses carry
// `costDollars`, which is what we meter.
import { postJson } from '../util.js';

const BASE = 'https://api.exa.ai';

export function exaKey() {
  return process.env.EXA_API_KEY || '';
}

export function isExaConfigured() {
  return Boolean(exaKey());
}

function costOf(costDollars) {
  if (Number.isFinite(Number(costDollars))) return Number(costDollars);
  const total = Number(costDollars?.total);
  return Number.isFinite(total) ? total : 0;
}

/**
 * @returns {Promise<{results:Array, costUsd:number, raw:object}>}
 */
export async function exaSearch({ query, maxResults = 10, type = 'auto', timeRange, includeDomains, excludeDomains, includeText = false, includeHighlights = false }, { fetchImpl } = {}) {
  const key = exaKey();
  if (!key) throw new Error('EXA_API_KEY is not set');
  const published = timeRangeToDates(timeRange);
  const data = await postJson(`${BASE}/search`, {
    provider: 'exa',
    fetchImpl,
    headers: { 'x-api-key': key },
    body: {
      query,
      type,
      numResults: Math.min(Math.max(Number(maxResults) || 10, 1), 100),
      contents: {
        ...(includeText ? { text: { maxCharacters: 8000 } } : {}),
        ...(includeHighlights ? { highlights: true } : {}),
      },
      ...published,
      ...(includeDomains?.length ? { includeDomains } : {}),
      ...(excludeDomains?.length ? { excludeDomains } : {}),
    },
  });
  return {
    results: (data.results || []).map((r) => ({
      url: r.url,
      title: r.title || '',
      snippet: String(r.highlights?.[0] || r.summary || r.text || '').slice(0, 1200),
      content: r.text || '',
      score: Number(r.score) || 0,
      publishedDate: r.publishedDate || null,
      provider: 'exa',
      costUsd: 0,
    })),
    costUsd: costOf(data.costDollars),
    raw: data,
  };
}

function timeRangeToDates(timeRange) {
  if (!timeRange) return {};
  const now = new Date();
  const days = { day: 1, week: 7, month: 30, year: 365, d: 1, w: 7, m: 30, y: 365 }[timeRange];
  if (!days) return {};
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return { startPublishedDate: start.toISOString() };
}

// SearXNG self-hosted metasearch — free if you host it.
//
// Point SEARXNG_URL at your own instance (or a public one) and get
// Google/Bing-grade results with no API key and no per-query price.
// Absent URL, this provider simply does not exist — nothing configured,
// nothing called.
const TIMEOUT_MS = 10000;
const WAKE_RETRY_DELAYS_MS = [250, 500, 1000, 1500, 2000];

export function searxngUrl() {
  return process.env.SEARXNG_URL || '';
}

export function isSearxngConfigured() {
  return Boolean(searxngUrl());
}

/**
 * @returns {Promise<{results:Array, costUsd:0, raw:object}>}
 */
export async function searxngSearch({ query, maxResults = 8 } = {}, { fetchImpl } = {}) {
  const endpoint = searxngUrl();
  if (!endpoint) throw new Error('searxng is not configured (SEARXNG_URL)');
  const n = Math.min(Math.max(Number(maxResults) || 8, 1), 20);
  const url = `${endpoint.replace(/\/+$/, '')}/search?q=${encodeURIComponent(query)}&format=json&language=en`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('searxng timed out')), TIMEOUT_MS);
  let data;
  try {
    const fetchFn = fetchImpl || fetch;
    for (let attempt = 0; attempt <= WAKE_RETRY_DELAYS_MS.length; attempt++) {
      let res;
      try {
        res = await fetchFn(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
      } catch (err) {
        // Railway may drop the first connection while waking a sleeping service.
        // Retries share the existing ten-second deadline.
        if (attempt < WAKE_RETRY_DELAYS_MS.length && !controller.signal.aborted && err instanceof TypeError) {
          await new Promise((resolve) => setTimeout(resolve, WAKE_RETRY_DELAYS_MS[attempt]));
          if (controller.signal.aborted) throw controller.signal.reason;
          continue;
        }
        throw err;
      }
      if (!res.ok) {
        if (attempt < WAKE_RETRY_DELAYS_MS.length && !controller.signal.aborted && [502, 503, 504].includes(res.status)) {
          await new Promise((resolve) => setTimeout(resolve, WAKE_RETRY_DELAYS_MS[attempt]));
          if (controller.signal.aborted) throw controller.signal.reason;
          continue;
        }
        throw new Error(`searxng HTTP ${res.status}`);
      }
      data = await res.json();
      break;
    }
  } finally {
    clearTimeout(timer);
  }
  const hits = Array.isArray(data?.results) ? data.results : [];
  return {
    results: hits.slice(0, n).map((h) => ({
      url: h.url,
      title: String(h.title || '').trim(),
      snippet: String(h.content || '').trim().slice(0, 1200),
      content: '',
      score: 0.6,
      provider: 'searxng',
      costUsd: 0,
    })).filter((r) => r.title && r.url),
    costUsd: 0,
    raw: { count: hits.length },
  };
}

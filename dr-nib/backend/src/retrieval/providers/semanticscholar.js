// Semantic Scholar paper search — free, keyless, with open-access PDF links.
//
// The academic backstop next to OpenAlex: 200M+ papers, and every result
// carries its open-access PDF URL when one exists — which pairs directly with
// the PDF reader (no separate hop to discover the file). Anonymous quota is
// thin and 429s under burst use (the fan-out records that, it never crashes
// on it); a free SEMANTICSCHOLAR_API_KEY lifts the limit via x-api-key.
const BASE = 'https://api.semanticscholar.org/graph/v1/paper/search';

/**
 * @returns {Promise<{results:Array, costUsd:0, raw:object}>}
 */
export async function semanticscholarSearch({ query, maxResults = 5 } = {}, { fetchImpl } = {}) {
  const n = Math.min(Math.max(Number(maxResults) || 5, 1), 10);
  const url = `${BASE}?query=${encodeURIComponent(query)}&limit=${n}&fields=title,abstract,url,openAccessPdf,year,authors,citationCount,venue`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('semanticscholar timed out')), 20000);
  let data;
  try {
    const fetchFn = fetchImpl || fetch;
    const headers = {};
    if (process.env.SEMANTICSCHOLAR_API_KEY) headers['x-api-key'] = process.env.SEMANTICSCHOLAR_API_KEY;
    const res = await fetchFn(url, { signal: controller.signal, headers });
    if (!res.ok) throw new Error(`semanticscholar HTTP ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  const papers = Array.isArray(data?.data) ? data.data : [];
  return {
    results: papers.slice(0, n).map((p) => {
      const pdf = p?.openAccessPdf?.url || '';
      const authors = (p?.authors || []).slice(0, 4).map((a) => a?.name).filter(Boolean).join(', ');
      const bits = [authors, p?.year, p?.venue, typeof p?.citationCount === 'number' ? `cited by ${p.citationCount}` : ''].filter(Boolean).join(' · ');
      return {
        url: pdf || p?.url || '',
        title: String(p?.title || '').trim(),
        snippet: [bits, String(p?.abstract || '').slice(0, 1100)].filter(Boolean).join(' — ').slice(0, 1400),
        content: '',
        score: 0.55,
        publishedDate: p?.year ? `${p.year}-01-01` : null,
        provider: 'semanticscholar',
        costUsd: 0,
      };
    }).filter((r) => r.title && r.url),
    costUsd: 0,
    raw: { count: papers.length },
  };
}

export function isSemanticscholarAvailable() {
  return true; // no key; anonymous quota
}

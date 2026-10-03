// Crossref bibliographic search — free, keyless, DOI-grounded.
//
// 130M+ DOIs across journals, books, and conference proceedings: the
// authority record when OpenAlex or Semantic Scholar disagree about a paper.
// No mailto is sent (anonymous pool); parsing requires a DOI and a title or
// the record is dropped.
const BASE = 'https://api.crossref.org/works';

/**
 * @returns {Promise<{results:Array, costUsd:0, raw:object}>}
 */
export async function crossrefSearch({ query, maxResults = 5 } = {}, { fetchImpl } = {}) {
  const n = Math.min(Math.max(Number(maxResults) || 5, 1), 10);
  const url = `${BASE}?query.bibliographic=${encodeURIComponent(query)}&rows=${n}&select=DOI,title,author,published,container-title,URL,abstract`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('crossref timed out')), 20000);
  let data;
  try {
    const fetchFn = fetchImpl || fetch;
    const res = await fetchFn(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`crossref HTTP ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  const items = Array.isArray(data?.message?.items) ? data.message.items : [];
  return {
    results: items.slice(0, n).map((w) => {
      const doi = String(w?.DOI || '').trim();
      if (!doi) return null;
      const title = (w?.title || []).join(' ').trim();
      if (!title) return null;
      const authors = (w?.author || []).slice(0, 4).map((a) => [a?.given, a?.family].filter(Boolean).join(' ')).filter(Boolean).join(', ');
      const date = w?.published?.['date-parts']?.[0] || [];
      const year = date[0] || '';
      const venue = (w?.['container-title'] || [])[0] || '';
      const bits = [authors, year, venue].filter(Boolean).join(' · ');
      return {
        url: w?.URL || `https://doi.org/${doi}`,
        title,
        snippet: [bits, String(w?.abstract || '').replace(/<[^>]*>/g, '').slice(0, 1000)].filter(Boolean).join(' — ').slice(0, 1400),
        content: '',
        score: 0.5,
        publishedDate: year ? `${year}-01-01` : null,
        provider: 'crossref',
        costUsd: 0,
      };
    }).filter(Boolean),
    costUsd: 0,
    raw: { count: items.length },
  };
}

export function isCrossrefAvailable() {
  return true; // no key; anonymous pool
}

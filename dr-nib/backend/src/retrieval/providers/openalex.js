// OpenAlex scholarly search — free, keyless, far broader than arXiv alone.
//
// Where arXiv covers preprints in a few fields, OpenAlex indexes journal
// articles, conference papers, and datasets across everything, with a generous
// anonymous quota. Abstracts arrive as inverted indexes and are rebuilt here.
// No mailto is sent: the anonymous pool is slower but needs no identity.
const BASE = 'https://api.openalex.org/works';

function rebuildAbstract(inverted) {
  if (!inverted || typeof inverted !== 'object') return '';
  const positioned = [];
  for (const [word, positions] of Object.entries(inverted)) {
    if (!Array.isArray(positions)) continue;
    for (const p of positions) positioned.push([Number(p) || 0, word]);
  }
  positioned.sort((a, b) => a[0] - b[0]);
  return positioned.map(([, w]) => w).join(' ');
}

/**
 * @returns {Promise<{results:Array, costUsd:0, raw:object}>}
 */
export async function openalexSearch({ query, maxResults = 5 } = {}, { fetchImpl } = {}) {
  const n = Math.min(Math.max(Number(maxResults) || 5, 1), 10);
  const url = `${BASE}?search=${encodeURIComponent(query)}&per-page=${n}&select=id,title,abstract_inverted_index,publication_date,primary_location,authorships,cited_by_count`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('openalex timed out')), 10000);
  let data;
  try {
    const fetchFn = fetchImpl || fetch;
    const res = await fetchFn(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`openalex HTTP ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  const works = Array.isArray(data?.results) ? data.results : [];
  return {
    results: works.slice(0, n).map((w) => {
      const doi = w?.primary_location?.landing_page_url || w?.id || '';
      const year = String(w?.publication_date || '').slice(0, 4);
      const authors = (w?.authorships || []).slice(0, 4).map((a) => a?.author?.display_name).filter(Boolean).join(', ');
      const bits = [authors, year, typeof w?.cited_by_count === 'number' ? `cited by ${w.cited_by_count}` : ''].filter(Boolean).join(' · ');
      const abstract = rebuildAbstract(w?.abstract_inverted_index).slice(0, 1200);
      return {
        url: doi,
        title: String(w?.title || '').trim(),
        snippet: [bits, abstract].filter(Boolean).join(' — ').slice(0, 1400),
        content: '',
        score: 0.5,
        publishedDate: w?.publication_date || null,
        provider: 'openalex',
        costUsd: 0,
      };
    }).filter((r) => r.title && r.url),
    costUsd: 0,
    raw: { count: works.length },
  };
}

export function isOpenalexAvailable() {
  return true; // no key, no account, anonymous pool
}

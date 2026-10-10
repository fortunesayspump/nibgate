// SEC EDGAR full-text search — free, keyless, primary filings.
//
// Company filings are the ground truth for finance topics: 10-Ks, 10-Qs,
// 8-Ks, searched full-text through the same index the EDGAR UI uses. Only
// fires usefully on company/filing queries; anything else returns empty,
// which the fan-out treats as a disagreement, not a failure. The SEC asks for
// a declaring User-Agent, which is set below.
const BASE = 'https://efts.sec.gov/LATEST/search-index';
const UA = 'NibgateResearch/0.1 (research agent; https://nibgate.xyz)';

/**
 * @returns {Promise<{results:Array, costUsd:0, raw:object}>}
 */
export async function edgarSearch({ query, maxResults = 5 } = {}, { fetchImpl } = {}) {
  const n = Math.min(Math.max(Number(maxResults) || 5, 1), 10);
  const url = `${BASE}?q=${encodeURIComponent(`"${query}"`)}&dateRange=custom&startdt=2000-01-01&enddt=${new Date().toISOString().slice(0, 10)}&forms=10-K,10-Q,8-K,S-1,20-F,40-F`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('edgar timed out')), 10000);
  let data;
  try {
    const fetchFn = fetchImpl || fetch;
    const res = await fetchFn(url, { signal: controller.signal, headers: { 'User-Agent': UA, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`edgar HTTP ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  const hits = data?.hits?.hits || [];
  return {
    results: hits.slice(0, n).map((h) => {
      const s = h?._source || {};
      const cik = String((s.ciks || [])[0] || '').replace(/^0+/, '');
      const form = (s.forms || [])[0] || s.form || '';
      const filed = s.filedAt || s.filed || '';
      if (!cik) return null;
      return {
        url: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik}&type=${encodeURIComponent(form)}&count=5`,
        title: `${s.entityName || s.company || 'Filing'} ${form} filed ${String(filed).slice(0, 10)}`.trim(),
        snippet: `SEC EDGAR filing: ${form}${filed ? ` filed ${String(filed).slice(0, 10)}` : ''}${s.items ? ` · items ${s.items}` : ''}`.slice(0, 600),
        content: '',
        score: 0.7,
        publishedDate: filed || null,
        provider: 'edgar',
        costUsd: 0,
      };
    }).filter(Boolean),
    costUsd: 0,
    raw: { count: hits.length },
  };
}

export function isEdgarAvailable() {
  return true; // no key; a declaring User-Agent is all the SEC asks
}

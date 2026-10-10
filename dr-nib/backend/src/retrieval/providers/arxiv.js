// arXiv adapter — free, keyless, high-trust academic search.
//
// The arXiv API needs no key and returns structured Atom: title, authors,
// abstract, date. Abstracts are evidence-grade summaries for scholarly
// questions, and they cost the run nothing. Capped small and scored like any
// other source — free does not mean trusted-by-default; JEV still judges.
const BASE = 'http://export.arxiv.org/api/query';

function textOf(block, tag) {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

function parseAtom(xml) {
  const entries = [];
  const blocks = String(xml || '').split(/<entry>/i).slice(1);
  for (const block of blocks) {
    const id = textOf(block, 'id');
    const title = textOf(block, 'title');
    const summary = textOf(block, 'summary');
    const published = textOf(block, 'published');
    if (!id || !title) continue;
    const authors = [...block.matchAll(/<author>\s*<name>([\s\S]*?)<\/name>/gi)].map((m) => m[1].trim()).slice(0, 6);
    entries.push({ id, title, summary, published, authors });
  }
  return entries;
}

/**
 * @returns {Promise<{results:Array, costUsd:0, raw:object}>}
 */
export async function arxivSearch({ query, maxResults = 5 } = {}, { fetchImpl } = {}) {
  const n = Math.min(Math.max(Number(maxResults) || 5, 1), 20);
  const url = `${BASE}?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${n}&sortBy=relevance&sortOrder=descending`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('arXiv timed out')), 10000);
  let xml;
  try {
    const fetchFn = fetchImpl || fetch;
    const res = await fetchFn(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`arXiv HTTP ${res.status}`);
    xml = await res.text();
  } finally {
    clearTimeout(timer);
  }
  const entries = parseAtom(xml).slice(0, n);
  return {
    results: entries.map((e) => ({
      url: e.id,
      title: e.title,
      snippet: e.summary.slice(0, 1200),
      content: '',
      score: 0.5,
      publishedDate: e.published || null,
      authors: e.authors,
      provider: 'arxiv',
      costUsd: 0,
    })),
    costUsd: 0,
    raw: { count: entries.length },
  };
}

export function isArxivAvailable() {
  return true; // no key, no account, no quota to check
}

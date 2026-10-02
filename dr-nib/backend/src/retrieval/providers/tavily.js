// Tavily adapter — breadth search and clean-text extraction.
//
// Contract (https://docs.tavily.com): POST /search with a bearer key. Results
// carry { title, url, content, score }. Depth controls cost: basic/fast/
// ultra-fast = 1 credit, advanced = 2. `usage.credits` is returned when
// include_usage is set, which is what we meter into the run.
import { postJson } from '../util.js';

const BASE = 'https://api.tavily.com';

export function tavilyKey() {
  return process.env.TAVILY_API_KEY || '';
}

export function isTavilyConfigured() {
  return Boolean(tavilyKey());
}

function creditUsd() {
  const n = Number(process.env.TAVILY_CREDIT_USD);
  return Number.isFinite(n) && n > 0 ? n : 0.008;
}

/**
 * @returns {Promise<{results:Array, costUsd:number, raw:object}>}
 */
export async function tavilySearch({ query, maxResults = 10, searchDepth = 'basic', timeRange, includeDomains, excludeDomains, includeRawContent = false }, { fetchImpl } = {}) {
  const key = tavilyKey();
  if (!key) throw new Error('TAVILY_API_KEY is not set');
  const data = await postJson(`${BASE}/search`, {
    provider: 'tavily',
    fetchImpl,
    headers: { authorization: `Bearer ${key}` },
    body: {
      query,
      max_results: Math.min(Math.max(Number(maxResults) || 10, 1), 20),
      search_depth: searchDepth,
      include_usage: true,
      include_raw_content: includeRawContent ? 'markdown' : false,
      ...(timeRange ? { time_range: timeRange } : {}),
      ...(includeDomains?.length ? { include_domains: includeDomains } : {}),
      ...(excludeDomains?.length ? { exclude_domains: excludeDomains } : {}),
    },
  });
  const credits = Number(data?.usage?.credits);
  return {
    results: (data.results || []).map((r) => ({
      url: r.url,
      title: r.title || '',
      snippet: r.content || '',
      content: r.raw_content || '',
      score: Number(r.score) || 0,
      publishedDate: r.published_date || null,
      provider: 'tavily',
      costUsd: 0,
    })),
    costUsd: Number.isFinite(credits) ? credits * creditUsd() : 0,
    raw: data,
  };
}

/** Extract cleaned text for specific URLs. @returns {Promise<{documents:Array, costUsd:number}>} */
export async function tavilyExtract({ urls }, { fetchImpl } = {}) {
  const key = tavilyKey();
  if (!key) throw new Error('TAVILY_API_KEY is not set');
  if (!urls?.length) return { documents: [], costUsd: 0 };
  const data = await postJson(`${BASE}/extract`, {
    provider: 'tavily',
    fetchImpl,
    headers: { authorization: `Bearer ${key}` },
    body: { urls, include_usage: true },
  });
  const credits = Number(data?.usage?.credits);
  return {
    documents: (data.results || []).map((r) => ({
      url: r.url, title: r.title || '', text: r.raw_content || '', provider: 'tavily', costUsd: 0,
    })),
    costUsd: Number.isFinite(credits) ? credits * creditUsd() : 0,
  };
}

// Retrieval registry.
//
// The run reaches the web through providers, not one search box. Tavily gives
// breadth; Exa gives semantic and academic reach. Both are optional and both
// are metered: a provider that is not configured is simply absent, and a
// provider that fails is recorded as a disagreement rather than silently
// averaged away. Underneath the keyed pair sits a free bench that needs no
// keys at all — GDELT for news, Wikipedia for background, OpenAlex for
// papers, EDGAR for filings, Stack Exchange and Hacker News for practitioner
// answers, Polymarket for live question prices, arXiv for preprints — so a
// keyless deployment still searches eight indexes, not one. When nothing is
// configured the caller gets an explicit empty result and decides its own
// fallback — this layer never invents sources.
import { RetrievalUnavailable, dedupeByUrl } from './util.js';
import { isTavilyConfigured, tavilyExtract, tavilySearch } from './providers/tavily.js';
import { exaSearch, isExaConfigured } from './providers/exa.js';
import { arxivSearch } from './providers/arxiv.js';
import { wikipediaSearch } from './providers/wikipedia.js';
import { openalexSearch } from './providers/openalex.js';
import { edgarSearch } from './providers/edgar.js';
import { stackexchangeSearch } from './providers/stackexchange.js';
import { gdeltSearch } from './providers/gdelt.js';
import { hnSearch } from './providers/hn.js';
import { polymarketSearch } from './providers/polymarket.js';
import { semanticscholarSearch } from './providers/semanticscholar.js';
import { crossrefSearch } from './providers/crossref.js';
import { searxngSearch, isSearxngConfigured } from './providers/searxng.js';
import { directExtract } from './providers/direct.js';
import { circuitAllows, circuitFailure, circuitSuccess } from './circuit.js';

export { RetrievalUnavailable, dedupeByUrl, mapLimit } from './util.js';
export { isTavilyConfigured } from './providers/tavily.js';
export { isExaConfigured } from './providers/exa.js';
export { normalizeUrl } from './util.js';

export function retrievalStatus() {
  const tavily = isTavilyConfigured();
  const exa = isExaConfigured();
  // The free bench needs no keys and is always available: a keyless
  // deployment searches, it just searches free indexes. A self-hosted
  // SearXNG joins the bench when SEARXNG_URL is set.
  return { tavily, exa, searxng: isSearxngConfigured(), free: true, any: true };
}

export function isRetrievalConfigured() {
  return retrievalStatus().any;
}

/**
 * Search across every configured provider, in parallel.
 *
 * @returns {Promise<{results:Array, costUsd:number, providers:Array, fallback:boolean}>}
 *   `providers` reports each provider's outcome (count, cost, or error) so a
 *   disagreement is visible downstream rather than flattened.
 */
export async function searchAll(input, { fetchImpl } = {}) {
  const { query, maxResults = 8, searchDepth, type, timeRange, includeDomains, excludeDomains, includeContent = false, includeAcademic = true, includeFree = true } = input || {};
  const status = retrievalStatus();
  const calls = [];
  const freeCall = (name, fn, args) => {
    const gate = circuitAllows(name);
    if (!gate.allowed) {
      calls.push(Promise.resolve({ name, skipped: 'circuit-open', retryAfterMs: gate.retryAfterMs }));
    } else {
      calls.push(
        fn(args, { fetchImpl }).then(
          (r) => { circuitSuccess(name); return { name, ...r }; },
          // Tag the failure with its provider: an untagged throw renders as
          // "unknown" downstream and nobody can tell what broke.
          (e) => { if (e && typeof e === 'object') e.provider = name; circuitFailure(name); throw e; },
        ),
      );
    }
  };

  if (status.tavily) {
    const gate = circuitAllows('tavily');
    if (!gate.allowed) {
      calls.push(Promise.resolve({ name: 'tavily', skipped: 'circuit-open', retryAfterMs: gate.retryAfterMs }));
    } else {
      calls.push(
        tavilySearch(
          { query, maxResults, searchDepth: searchDepth || 'basic', timeRange, includeDomains, excludeDomains, includeRawContent: includeContent },
          { fetchImpl },
        ).then(
          (r) => { circuitSuccess('tavily'); return { name: 'tavily', ...r }; },
          (e) => { circuitFailure('tavily'); throw e; },
        ),
      );
    }
  }
  if (status.exa) {
    const gate = circuitAllows('exa');
    if (!gate.allowed) {
      calls.push(Promise.resolve({ name: 'exa', skipped: 'circuit-open', retryAfterMs: gate.retryAfterMs }));
    } else {
      calls.push(
        exaSearch(
          { query, maxResults, type: type || 'auto', timeRange, includeDomains, excludeDomains, includeText: includeContent, includeHighlights: true },
          { fetchImpl },
        ).then(
          (r) => { circuitSuccess('exa'); return { name: 'exa', ...r }; },
          (e) => { circuitFailure('exa'); throw e; },
        ),
      );
    }
  }
  // The free bench: five keyless indexes behind one flag. Each is capped
  // small and circuit-broken like the keyed pair; empties are disagreements,
  // not failures.
  if (includeFree) {
    freeCall('wikipedia', wikipediaSearch, { query, maxResults: 4 });
    freeCall('openalex', openalexSearch, { query, maxResults: 4 });
    freeCall('semanticscholar', semanticscholarSearch, { query, maxResults: 4 });
    freeCall('crossref', crossrefSearch, { query, maxResults: 4 });
    freeCall('edgar', edgarSearch, { query, maxResults: 4 });
    freeCall('stackexchange', stackexchangeSearch, { query, maxResults: 4 });
    freeCall('gdelt', gdeltSearch, { query, maxResults: 6 });
    freeCall('hn', hnSearch, { query, maxResults: 4 });
    freeCall('polymarket', polymarketSearch, { query, maxResults: 4 });
    if (isSearxngConfigured()) freeCall('searxng', searxngSearch, { query, maxResults });
  }

  // arXiv is free and keyless, so it is always in the mix (capped small).
  // Academic noise on non-academic queries is filtered downstream by relevance
  // and JEV trust — the same treatment every source gets.
  if (includeAcademic) {
    const gate = circuitAllows('arxiv');
    if (!gate.allowed) {
      calls.push(Promise.resolve({ name: 'arxiv', skipped: 'circuit-open', retryAfterMs: gate.retryAfterMs }));
    } else {
      calls.push(
        arxivSearch({ query, maxResults: 3 }, { fetchImpl }).then(
          (r) => { circuitSuccess('arxiv'); return { name: 'arxiv', ...r }; },
          (e) => { circuitFailure('arxiv'); throw e; },
        ),
      );
    }
  }

  if (!calls.length) {
    return { results: [], costUsd: 0, providers: [], fallback: true };
  }

  const settled = await Promise.allSettled(calls);
  const providers = [];
  const gathered = [];
  let costUsd = 0;

  for (const outcome of settled) {
    if (outcome.status === 'fulfilled') {
      const { name, results, costUsd: cost, skipped, retryAfterMs } = outcome.value;
      if (skipped) {
        providers.push({ name, ok: false, count: 0, costUsd: 0, error: skipped, retryAfterMs });
        continue;
      }
      costUsd += Number(cost) || 0;
      providers.push({ name, ok: true, count: results.length, costUsd: Number(cost) || 0 });
      gathered.push(...results);
    } else {
      const err = outcome.reason;
      providers.push({
        name: err?.provider || 'unknown',
        ok: false,
        count: 0,
        costUsd: 0,
        error: err?.message || String(err),
      });
    }
  }

  return { results: dedupeByUrl(gathered), costUsd, providers, fallback: false };
}

/** Extract full text for specific URLs. Tavily's extractor first; otherwise the
 * free direct path (robots and paywalls respected, metered at zero). */
export async function extractAll({ urls } = {}, { fetchImpl } = {}) {
  const list = Array.isArray(urls) ? urls.filter(Boolean).slice(0, 20) : [];
  if (!list.length) {
    return { documents: [], skipped: [], costUsd: 0, providers: [], fallback: true };
  }
  if (isTavilyConfigured()) {
    const gate = circuitAllows('tavily');
    if (!gate.allowed) {
      return {
        documents: [],
        skipped: list.map((url) => ({ url, reason: 'circuit-open' })),
        costUsd: 0,
        providers: [{ name: 'tavily', ok: false, count: 0, costUsd: 0, error: 'circuit-open', retryAfterMs: gate.retryAfterMs }],
        fallback: false,
      };
    }
    try {
      const out = await tavilyExtract({ urls: list }, { fetchImpl });
      circuitSuccess('tavily');
      return {
        documents: out.documents,
        skipped: [],
        costUsd: Number(out.costUsd) || 0,
        providers: [{ name: 'tavily', ok: true, count: out.documents.length, costUsd: Number(out.costUsd) || 0 }],
        fallback: false,
      };
    } catch (err) {
      circuitFailure('tavily');
      return {
        documents: [],
        skipped: list.map((url) => ({ url, reason: err.message })),
        costUsd: 0,
        providers: [{ name: 'tavily', ok: false, count: 0, costUsd: 0, error: err.message }],
        fallback: false,
      };
    }
  }
  const out = await directExtract({ urls: list }, { fetchImpl });
  return {
    documents: out.documents,
    skipped: out.skipped,
    costUsd: 0,
    providers: [{ name: 'direct', ok: true, count: out.documents.length, costUsd: 0 }],
    fallback: false,
  };
}

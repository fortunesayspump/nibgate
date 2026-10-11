// OpenRouter web-search adapter — model-driven search over the same key.
//
// The run already pays OpenRouter for every LLM call; this spends the same
// credits on retrieval instead of a separate Exa/Tavily key. The request
// carries the `openrouter:web_search` server tool and one instruction: the
// model chooses its own queries (0-N searches) and OpenRouter executes them
// server-side. Only the response annotations become results — never prose.
//
// Engine is Exa, not auto: native provider search annotates with redirect
// links (seen live: vertexaisearch grounding URLs) instead of the real page
// URLs, which breaks the fetch stage. Exa annotations carry the page URL
// directly. Override with OPENROUTER_SEARCH_ENGINE when native links are
// ever needed.
//
// Cost: token cost via the normal pricing table plus a flat per-request
// search estimate ($0.007, the Exa-auto rate OpenRouter bills through
// credits). The true search line-item lives in OpenRouter's dashboard, not
// the chat response — the flat estimate keeps the run ledger honest.
import { costUsd as tokenCostUsd, routerModel } from '../../llm/pricing.js';
import { llmConfig, LlmError } from '../../llm/provider.js';

const SEARCH_FLAT_USD = 0.007;

export function isOpenrouterSearchConfigured() {
  return Boolean(llmConfig().apiKey);
}

function annotationResults(annotations, maxResults) {
  const out = [];
  const seen = new Set();
  for (const a of Array.isArray(annotations) ? annotations : []) {
    // Type-gated: an annotation that merely embeds a url_citation-shaped
    // object under another type is not a citation.
    if (a?.type !== 'url_citation') continue;
    const cite = a.url_citation || a;
    const url = typeof cite?.url === 'string' ? cite.url.trim() : '';
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({
      url,
      title: String(cite?.title || '').slice(0, 200),
      snippet: String(cite?.content || '').slice(0, 1200),
      score: 0.5,
      provider: 'openrouter',
      costUsd: 0,
    });
    if (out.length >= maxResults) break;
  }
  return out;
}

/**
 * @returns {Promise<{results:Array, costUsd:number, searches:number, raw:object}>}
 */
export async function openrouterSearch({ query, maxResults = 8 } = {}, { fetchImpl = fetch } = {}) {
  const cfg = llmConfig();
  if (!cfg.apiKey) throw new Error('OPENROUTER_API_KEY is not set');
  const q = String(query || '').trim();
  if (!q) return { results: [], costUsd: 0, searches: 0 };
  const n = Math.min(Math.max(Number(maxResults) || 8, 1), 20);
  // Single model, no `models[]` failover: a fallback without tool support
  // poisons the whole request (seen live: 400 with models[] + exa, 200
  // without). Search is one voice among many providers — a failure here is
  // a disagreement the others cover, not something to fail over inside.
  const model = routerModel();
  const engine = (process.env.OPENROUTER_SEARCH_ENGINE || 'exa').trim() || 'exa';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('openrouter search timed out')), cfg.timeoutMs);
  try {
    const res = await fetchImpl(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
        'HTTP-Referer': cfg.siteUrl,
        'X-Title': cfg.appName,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: `Search the web for: ${q}\n\nUse web search for current/external facts. Reply with a two-sentence summary of what the search found.`,
          },
        ],
        tools: [
          {
            type: 'openrouter:web_search',
            parameters: { engine, max_results: Math.min(n, 10), max_total_results: n },
          },
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      let body = '';
      try { body = (await res.text()).slice(0, 200); } catch {}
      throw new LlmError(`openrouter search HTTP ${res.status}: ${body}`, { status: res.status, code: 'http_error' });
    }
    const data = await res.json();
    const choice = data?.choices?.[0];
    const served = String(data?.model || model);
    const usage = data?.usage || {};
    const promptTokens = Number(usage.prompt_tokens ?? 0) || 0;
    const completionTokens = Number(usage.completion_tokens ?? 0) || 0;
    const results = annotationResults(choice?.message?.annotations, n);
    const costUsd =
      tokenCostUsd({ model: served, promptTokens, completionTokens, providerCost: usage?.cost }) + SEARCH_FLAT_USD;
    return { results, costUsd, searches: 1, raw: { model: served } };
  } finally {
    clearTimeout(timer);
  }
}

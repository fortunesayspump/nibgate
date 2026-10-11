// OpenRouter web-search provider: annotations become results, prose never
// does, and the run ledger sees token cost plus the flat search estimate.
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { isOpenrouterSearchConfigured, openrouterSearch } from './openrouter.js';

const ANNOTATED = {
  model: 'google/gemini-flash-latest',
  choices: [
    {
      message: {
        content: 'Two-sentence summary.',
        annotations: [
          { type: 'url_citation', url_citation: { url: 'https://a.example/fees', title: 'Fee report', content: 'Arc charges...' } },
          { type: 'url_citation', url_citation: { url: 'https://b.example/base', title: 'Base docs', content: 'Base finality...' } },
          { type: 'other', url_citation: { url: 'https://c.example/nope', title: 'X', content: 'Y' } },
        ],
      },
    },
  ],
  usage: { prompt_tokens: 100, completion_tokens: 50 },
};

function okFetch(body) {
  return vi.fn(async () => ({ ok: true, json: async () => body }));
}

describe('openrouter web search', () => {
  beforeEach(() => {
    process.env.OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || 'test-key';
  });

  it('is configured off the LLM key — no separate search key', () => {
    expect(isOpenrouterSearchConfigured()).toBe(true);
  });

  it('turns url_citation annotations into results, ignores the rest', async () => {
    const fetchImpl = okFetch(ANNOTATED);
    const out = await openrouterSearch({ query: 'Arc vs Base fees', maxResults: 8 }, { fetchImpl });
    expect(out.results.map((r) => r.url)).toEqual(['https://a.example/fees', 'https://b.example/base']);
    expect(out.results[0].provider).toBe('openrouter');
    expect(out.results[0].snippet).toContain('Arc charges');
    // Ledger sees token cost plus the flat per-search estimate.
    expect(out.costUsd).toBeGreaterThan(0.007);
    // The server tool rides along on the request (Exa engine: native
    // provider search annotates redirect URLs, not real pages).
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(sent.tools).toEqual([
      { type: 'openrouter:web_search', parameters: { engine: 'exa', max_results: 8, max_total_results: 8 } },
    ]);
  });

  it('dedupes repeat citations and caps at maxResults', async () => {
    const dup = {
      ...ANNOTATED,
      choices: [
        {
          message: {
            content: 'x',
            annotations: [0, 1, 2, 3, 4].map((i) => ({
              type: 'url_citation',
              url_citation: { url: i % 2 ? 'https://a.example' : 'https://b.example', title: `t${i}`, content: `c${i}` },
            })),
          },
        },
      ],
    };
    const out = await openrouterSearch({ query: 'q', maxResults: 2 }, { fetchImpl: okFetch(dup) });
    expect(out.results.map((r) => r.url)).toEqual(['https://b.example', 'https://a.example']);
  });

  it('zero annotations is an empty result, never invented sources', async () => {
    const out = await openrouterSearch(
      { query: 'q' },
      { fetchImpl: okFetch({ model: 'm', choices: [{ message: { content: 'No search needed.', annotations: [] } }], usage: {} }) },
    );
    expect(out.results).toEqual([]);
  });

  it('empty queries short-circuit without spending', async () => {
    const fetchImpl = okFetch(ANNOTATED);
    const out = await openrouterSearch({ query: '   ' }, { fetchImpl });
    expect(out.results).toEqual([]);
    expect(out.costUsd).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

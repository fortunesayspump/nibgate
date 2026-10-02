import { afterEach, describe, expect, it, vi } from 'vitest';
import { dedupeByUrl, normalizeUrl } from './util.js';
import { retrievalStatus, searchAll } from './index.js';

afterEach(() => vi.unstubAllEnvs());

function jsonResponse(data, ok = true, status = 200) {
  return { ok, status, json: async () => data, text: async () => JSON.stringify(data) };
}

describe('URL normalization and dedupe', () => {
  it('drops the hash and tracking params, folds www and trailing slash', () => {
    expect(normalizeUrl('https://WWW.Example.com/a/?utm_source=x&b=1#frag')).toBe('https://example.com/a?b=1');
  });

  it('keeps the higher-scoring row per URL', () => {
    const out = dedupeByUrl([
      { url: 'https://a.com/x', score: 0.2, title: 'low' },
      { url: 'https://a.com/x?utm_medium=y', score: 0.9, title: 'high' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].title).toBe('high');
  });
});

describe('retrieval status', () => {
  it('reports nothing configured when no keys are set', () => {
    expect(retrievalStatus()).toEqual({ tavily: false, exa: false, any: false });
  });

  it('reports each provider independently', () => {
    vi.stubEnv('TAVILY_API_KEY', 'tvly-x');
    expect(retrievalStatus()).toEqual({ tavily: true, exa: false, any: true });
  });
});

describe('searchAll', () => {
  it('returns an explicit empty fallback when every provider is disabled', async () => {
    const out = await searchAll({ query: 'x', includeAcademic: false }, { fetchImpl: vi.fn() });
    expect(out.fallback).toBe(true);
    expect(out.results).toEqual([]);
    expect(out.costUsd).toBe(0);
  });

  it('fans across providers, dedupes overlapping URLs, and sums metered cost', async () => {
    vi.stubEnv('TAVILY_API_KEY', 'tvly-x');
    vi.stubEnv('EXA_API_KEY', 'exa-x');
    const fetchImpl = vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('tavily.com')) {
        return jsonResponse({
          results: [
            { url: 'https://a.com/one', title: 'A', content: 'snippet a', score: 0.8 },
            { url: 'https://b.com/two', title: 'B', content: 'snippet b', score: 0.5 },
          ],
          usage: { credits: 1 },
        });
      }
      if (String(url).includes('export.arxiv.org')) {
        return {
          ok: true, status: 200,
          text: async () => '<?xml version="1.0"?><feed><entry><id>https://arxiv.org/abs/1234.1</id><title>Arxiv Paper</title><summary>Abstract here.</summary><published>2026-01-01T00:00:00Z</published></entry></feed>',
        };
      }
      return jsonResponse({
        results: [
          { url: 'https://a.com/one?utm_source=x', title: 'A', text: 'full a', score: 0.9 },
          { url: 'https://c.com/three', title: 'C', text: 'full c', score: 0.7 },
        ],
        costDollars: 0.005,
      });
    });

    const out = await searchAll({ query: 'x', includeContent: true }, { fetchImpl });
    expect(out.fallback).toBe(false);
    // a.com/one + b.com/two + c.com/three + arxiv paper == 4 distinct URLs
    expect(out.results.map((r) => r.url).sort()).toEqual([
      'https://a.com/one', 'https://arxiv.org/abs/1234.1', 'https://b.com/two', 'https://c.com/three',
    ]);
    // Tavily 1 credit * 0.008 + Exa 0.005 + arXiv 0
    expect(out.costUsd).toBeCloseTo(0.013, 6);
    expect(out.providers.map((p) => p.name).sort()).toEqual(['arxiv', 'exa', 'tavily']);
    expect(out.providers.every((p) => p.ok)).toBe(true);
  });

  it('surfaces one provider failing without losing the other', async () => {
    vi.stubEnv('TAVILY_API_KEY', 'tvly-x');
    vi.stubEnv('EXA_API_KEY', 'exa-x');
    const fetchImpl = vi.fn().mockImplementation(async (url) => {
      if (String(url).includes('tavily.com')) return jsonResponse({ results: [{ url: 'https://a.com', title: 'A', score: 1 }], usage: { credits: 1 } });
      return jsonResponse({ error: 'boom' }, false, 500);
    });
    const out = await searchAll({ query: 'x', includeAcademic: false }, { fetchImpl });
    expect(out.results).toHaveLength(1);
    const exa = out.providers.find((p) => p.name === 'exa');
    expect(exa.ok).toBe(false);
    expect(exa.error).toMatch(/500/);
  });

  it('always includes the free academic index unless asked not to', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => `<?xml version="1.0"?><feed><entry><id>https://arxiv.org/abs/1234.5678</id><title>Some Paper</title><summary>An abstract.</summary><published>2026-01-01T00:00:00Z</published><author><name>Jane Doe</name></author></entry></feed>`,
    });
    const out = await searchAll({ query: 'quantum x402' }, { fetchImpl });
    expect(out.fallback).toBe(false);
    expect(out.results).toHaveLength(1);
    expect(out.results[0].provider).toBe('arxiv');
    expect(out.results[0].url).toBe('https://arxiv.org/abs/1234.5678');
    expect(out.costUsd).toBe(0);
    expect(out.providers).toEqual([{ name: 'arxiv', ok: true, count: 1, costUsd: 0 }]);
  });
});

describe('extractAll', () => {
  it('falls back to free direct extraction when no extractor key is set', async () => {
    const html = '<html><head><title>Page Title Here</title></head><body><article><h1>Headline text here</h1><p>' + 'Readable body sentence one. '.repeat(20) + '</p></article></body></html>';
    const fetchImpl = vi.fn().mockImplementation(async (url) => {
      if (String(url).endsWith('/robots.txt')) return { ok: false, status: 404, text: async () => '' };
      return { ok: true, status: 200, text: async () => html };
    });
    const { extractAll } = await import('./index.js');
    const out = await extractAll({ urls: ['https://example.com/article'] }, { fetchImpl });
    expect(out.fallback).toBe(false);
    expect(out.documents).toHaveLength(1);
    expect(out.documents[0].provider).toBe('direct');
    expect(out.documents[0].text).toContain('Readable body sentence one.');
    expect(out.costUsd).toBe(0);
  });

  it('refuses paywalled pages instead of working around them', async () => {
    const html = '<html><body><p>Please subscribe to continue reading this article. Subscribe to continue.</p><p>' + 'Filler text here. '.repeat(30) + '</p></body></html>';
    const fetchImpl = vi.fn().mockImplementation(async (url) => {
      if (String(url).endsWith('/robots.txt')) return { ok: false, status: 404, text: async () => '' };
      return { ok: true, status: 200, text: async () => html };
    });
    const { extractAll } = await import('./index.js');
    const out = await extractAll({ urls: ['https://paywalled.example/story'] }, { fetchImpl });
    expect(out.documents).toHaveLength(0);
    expect(out.skipped[0].reason).toBe('paywalled');
  });

  it('respects robots disallow', async () => {
    // NOTE: a dedicated origin — the robots rules cache is per-origin for the
    // process, so reusing example.com here would inherit the earlier test's
    // cached (empty) rules and the disallow would never load.
    const fetchImpl = vi.fn().mockImplementation(async (url) => {
      if (String(url).endsWith('/robots.txt')) {
        return { ok: true, status: 200, text: async () => 'User-agent: *\nDisallow: /private/\n' };
      }
      return { ok: true, status: 200, text: async () => '<html><body><p>' + 'x '.repeat(200) + '</p></body></html>' };
    });
    const { extractAll } = await import('./index.js');
    const out = await extractAll({ urls: ['https://robotstest.example/private/secret'] }, { fetchImpl });
    expect(out.documents).toHaveLength(0);
    expect(out.skipped[0].reason).toBe('robots-disallow');
  });

  it('parses plain text, CSV, and JSON bodies without dependencies', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url) => {
      if (String(url).endsWith('/robots.txt')) return { ok: false, status: 404, text: async () => '' };
      if (String(url).endsWith('.csv')) {
        return { ok: true, status: 200, headers: { get: () => 'text/csv' }, text: async () => 'a,b\n' + '1,2\n'.repeat(30) };
      }
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: async () => JSON.stringify({ rows: Array.from({ length: 30 }, (_, i) => ({ i })) }) };
    });
    const { extractAll } = await import('./index.js');
    const out = await extractAll({ urls: ['https://data.example/table.csv', 'https://api.example/rows.json'] }, { fetchImpl });
    expect(out.documents).toHaveLength(2);
    expect(out.documents[0].text).toContain('1,2');
    expect(out.documents[1].text).toContain('"rows"');
  });

  it('refuses binary formats with a named reason instead of mangling them', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url) => {
      if (String(url).endsWith('/robots.txt')) return { ok: false, status: 404, text: async () => '' };
      return { ok: true, status: 200, headers: { get: () => 'application/pdf' }, text: async () => '%PDF-1.4 binary…' };
    });
    const { extractAll } = await import('./index.js');
    const out = await extractAll({ urls: ['https://example.com/paper.pdf'] }, { fetchImpl });
    expect(out.documents).toHaveLength(0);
    expect(out.skipped[0].reason).toBe('unsupported-type');
  });
});

describe('provider circuit', () => {
  it('opens after a streak of failures, skips while open, and clears on success', async () => {
    const { __resetCircuits, circuitAllows, circuitFailure, circuitSuccess } = await import('./circuit.js');
    __resetCircuits();
    vi.stubEnv('RETRIEVAL_CIRCUIT_FAILURES', '3');
    vi.stubEnv('RETRIEVAL_CIRCUIT_COOLDOWN_MS', '60000');
    expect(circuitAllows('tavily').allowed).toBe(true);
    circuitFailure('tavily');
    circuitFailure('tavily');
    expect(circuitAllows('tavily').allowed).toBe(true); // below threshold
    circuitFailure('tavily');
    const gate = circuitAllows('tavily');
    expect(gate.allowed).toBe(false);
    expect(gate.retryAfterMs).toBeGreaterThan(0);
    circuitSuccess('tavily');
    expect(circuitAllows('tavily').allowed).toBe(true);
    __resetCircuits();
    vi.unstubAllEnvs();
  });

  it('a half-open probe that fails doubles the cooling', async () => {
    const { __resetCircuits, circuitAllows, circuitFailure } = await import('./circuit.js');
    __resetCircuits();
    vi.stubEnv('RETRIEVAL_CIRCUIT_FAILURES', '1');
    vi.stubEnv('RETRIEVAL_CIRCUIT_COOLDOWN_MS', '1000');
    vi.stubEnv('RETRIEVAL_CIRCUIT_MAX_COOLDOWN_MS', '100000');
    circuitFailure('exa', 0);
    expect(circuitAllows('exa', 500).allowed).toBe(false);
    expect(circuitAllows('exa', 1500).allowed).toBe(true); // half-open probe
    circuitFailure('exa', 1500); // probe fails: cooling doubles to 2000
    expect(circuitAllows('exa', 3000).allowed).toBe(false);
    expect(circuitAllows('exa', 4000).allowed).toBe(true);
    __resetCircuits();
    vi.unstubAllEnvs();
  });

  it('searchAll skips an open provider without calling it', async () => {
    const { __resetCircuits, circuitFailure } = await import('./circuit.js');
    __resetCircuits();
    vi.stubEnv('TAVILY_API_KEY', 'tvly-x');
    vi.stubEnv('RETRIEVAL_CIRCUIT_FAILURES', '1');
    circuitFailure('tavily');
    const fetchImpl = vi.fn();
    const { searchAll } = await import('./index.js');
    const out = await searchAll({ query: 'x', includeAcademic: false }, { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out.providers).toEqual([{ name: 'tavily', ok: false, count: 0, costUsd: 0, error: 'circuit-open', retryAfterMs: expect.any(Number) }]);
    __resetCircuits();
    vi.unstubAllEnvs();
  });
});

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
  it('reports the free bench always available, keyed pair by key', () => {
    expect(retrievalStatus()).toEqual({ tavily: false, exa: false, searxng: false, free: true, any: true });
  });

  it('reports each provider independently', () => {
    vi.stubEnv('TAVILY_API_KEY', 'tvly-x');
    expect(retrievalStatus()).toEqual({ tavily: true, exa: false, searxng: false, free: true, any: true });
  });

  it('reports a configured searxng instance', () => {
    vi.stubEnv('SEARXNG_URL', 'https://search.example.com');
    expect(retrievalStatus().searxng).toBe(true);
  });
});

describe('searchAll', () => {
  it('returns an explicit empty fallback when every provider is disabled', async () => {
    const out = await searchAll({ query: 'x', includeAcademic: false, includeFree: false }, { fetchImpl: vi.fn() });
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
    // (the free bench returns empty against this mock's exa-shaped default)
    expect(out.results.map((r) => r.url).sort()).toEqual([
      'https://a.com/one', 'https://arxiv.org/abs/1234.1', 'https://b.com/two', 'https://c.com/three',
    ]);
    // Tavily 1 credit * 0.008 + Exa 0.005 + free bench 0
    expect(out.costUsd).toBeCloseTo(0.013, 6);
    expect(out.providers.map((p) => p.name).sort()).toEqual(
      ['arxiv', 'crossref', 'edgar', 'exa', 'gdelt', 'hn', 'openalex', 'polymarket', 'semanticscholar', 'stackexchange', 'tavily', 'wikipedia'],
    );
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
    const out = await searchAll({ query: 'quantum x402', includeFree: false }, { fetchImpl });
    expect(out.fallback).toBe(false);
    expect(out.results).toHaveLength(1);
    expect(out.results[0].provider).toBe('arxiv');
    expect(out.results[0].url).toBe('https://arxiv.org/abs/1234.5678');
    expect(out.costUsd).toBe(0);
    expect(out.providers).toEqual([{ name: 'arxiv', ok: true, count: 1, costUsd: 0 }]);
  });

  it('fans the free bench through one mock, keyed by host', async () => {
    const fetchImpl = vi.fn().mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes('wikipedia.org')) {
        return jsonResponse({ query: { search: [{ title: 'USD Coin', snippet: 'a <span>stablecoin</span>' }] } });
      }
      if (u.includes('openalex.org')) {
        return jsonResponse({ results: [{ id: 'https://doi.org/10.2/openalex-fees', title: 'Stablecoin fees', abstract_inverted_index: { Stablecoin: [0], fees: [1] }, publication_date: '2025-03-01', authorships: [], cited_by_count: 7 }] });
      }
      if (u.includes('efts.sec.gov')) {
        return jsonResponse({ hits: { hits: [{ _source: { ciks: ['1234567'], forms: ['10-K'], filedAt: '2025-02-20', entityName: 'Circle' } }] } });
      }
      if (u.includes('stackexchange')) {
        return jsonResponse({ items: [{ link: 'https://stackoverflow.com/q/1', title: 'How do fees work?', score: 5, answer_count: 2, is_answered: true, tags: ['fees'] }] });
      }
      if (u.includes('gdeltproject')) {
        return jsonResponse({ articles: [{ title: 'USDC news', url: 'https://news.example/a', seendate: '20260930T120000Z', domain: 'example', language: 'English' }] });
      }
      if (u.includes('hn.algolia')) {
        return jsonResponse({ hits: [{ title: 'USDC thread', url: null, objectID: '999', points: 42, num_comments: 7, created_at: '2025-09-01T00:00:00Z' }] });
      }
      if (u.includes('polymarket')) {
        return jsonResponse([{ question: 'Will USDC hold peg?', slug: 'usdc-peg', volume: 1000, outcomes: ['Yes', 'No'], outcomePrices: ['0.99', '0.01'] }]);
      }
      if (u.includes('semanticscholar')) {
        return jsonResponse({ data: [{ title: 'Stablecoin design', abstract: 'We study pegs.', url: 'https://s2.example/p', openAccessPdf: { url: 'https://s2.example/p.pdf' }, year: 2024, authors: [{ name: 'A. Uthor' }], citationCount: 3 }] });
      }
      if (u.includes('crossref')) {
        return jsonResponse({ message: { items: [{ DOI: '10.1/x', title: ['Ledger money'], author: [{ given: 'B', family: 'Uilder' }], published: { 'date-parts': [[2023]] }, 'container-title': ['J. Money'], URL: 'https://doi.org/10.1/x' }] } });
      }
      if (u.includes('export.arxiv.org')) {
        return { ok: true, status: 200, text: async () => '<?xml version="1.0"?><feed></feed>' };
      }
      throw new Error(`unexpected host: ${u.slice(0, 80)}`);
    });
    const out = await searchAll({ query: 'usdc fees' }, { fetchImpl });
    expect(out.fallback).toBe(false);
    expect(out.costUsd).toBe(0);
    expect(out.providers.map((p) => p.name).sort()).toEqual(
      ['arxiv', 'crossref', 'edgar', 'gdelt', 'hn', 'openalex', 'polymarket', 'semanticscholar', 'stackexchange', 'wikipedia'],
    );
    expect(out.providers.every((p) => p.ok)).toBe(true);
    const byProvider = Object.fromEntries(out.results.map((r) => [r.provider, r]));
    expect(byProvider.wikipedia.url).toBe('https://en.wikipedia.org/wiki/USD_Coin');
    expect(byProvider.semanticscholar.url).toBe('https://s2.example/p.pdf');
    expect(byProvider.crossref.url).toBe('https://doi.org/10.1/x');
    expect(byProvider.openalex.snippet).toMatch(/Stablecoin fees|fees/);
    expect(byProvider.edgar.url).toContain('CIK=1234567');
    expect(byProvider.stackexchange.url).toBe('https://stackoverflow.com/q/1');
    expect(byProvider.gdelt.url).toBe('https://news.example/a');
    expect(byProvider.hn.url).toBe('https://news.ycombinator.com/item?id=999');
    expect(byProvider.polymarket.url).toBe('https://polymarket.com/event/usdc-peg');
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

  it('reads office documents: docx, xlsx, and pptx', async () => {
    const JSZip = (await import('jszip')).default;
    const XLSX = await import('xlsx');
    const docx = new JSZip();
    docx.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
    docx.file('word/document.xml', '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello docx world, this is a long enough sentence to pass the readability floor.</w:t></w:r></w:p></w:body></w:document>');
    const docxBuf = Buffer.from(await docx.generateAsync({ type: 'uint8array' }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['name', 'value', 'note'], ['usdc', '1.00', 'stablecoin dollar peg'], ['arc', 'fast', 'low fee chain'], ['base', 'fast', 'coinbase rollup']]), 'Fees');
    const xlsxBuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const pptx = new JSZip();
    pptx.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>');
    pptx.file('ppt/slides/slide1.xml', '<?xml version="1.0"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:t>Hello slide world, another long enough sentence for the floor.</a:t></p:sld>');
    const pptxBuf = Buffer.from(await pptx.generateAsync({ type: 'uint8array' }));
    const bodies = {
      'https://example.com/report.docx': docxBuf,
      'https://example.com/fees.xlsx': xlsxBuf,
      'https://example.com/deck.pptx': pptxBuf,
    };
    const fetchImpl = vi.fn().mockImplementation(async (url) => {
      if (String(url).endsWith('/robots.txt')) return { ok: false, status: 404, text: async () => '' };
      return { ok: true, status: 200, headers: { get: () => 'application/octet-stream' }, arrayBuffer: async () => bodies[String(url)] };
    });
    const { extractAll } = await import('./index.js');
    const out = await extractAll({ urls: Object.keys(bodies) }, { fetchImpl });
    expect(out.skipped).toEqual([]);
    expect(out.documents).toHaveLength(3);
    const texts = out.documents.map((d) => d.text).join('\n');
    expect(texts).toMatch(/Hello docx world/);
    expect(texts).toMatch(/usdc/);
    expect(texts).toMatch(/Hello slide world/);
  });

  it('names bot-block pages instead of reporting no text', async () => {
    const html = '<html><head><script>cf-challenge</script></head><body><p>Checking your browser before you access this site, please wait a moment while we verify things here.</p></body></html>';
    const fetchImpl = vi.fn().mockImplementation(async (url) => {
      if (String(url).endsWith('/robots.txt')) return { ok: false, status: 404, text: async () => '' };
      return { ok: true, status: 200, text: async () => html };
    });
    const { extractAll } = await import('./index.js');
    const out = await extractAll({ urls: ['https://example.com/guarded'] }, { fetchImpl });
    expect(out.documents).toHaveLength(0);
    expect(out.skipped[0].reason).toBe('blocked-bot-check');
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
    const out = await searchAll({ query: 'x', includeAcademic: false, includeFree: false }, { fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(out.providers).toEqual([{ name: 'tavily', ok: false, count: 0, costUsd: 0, error: 'circuit-open', retryAfterMs: expect.any(Number) }]);
    __resetCircuits();
    vi.unstubAllEnvs();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { searxngSearch } from './searxng.js';

afterEach(() => vi.unstubAllEnvs());

describe('SearXNG wake-up response', () => {
  it('retries a transient 502 and returns search results', async () => {
    vi.stubEnv('SEARXNG_URL', 'http://search.test');
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [{ url: 'https://example.com', title: 'Example' }] }) });

    const out = await searxngSearch({ query: 'example' }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(out.results).toHaveLength(1);
    expect(out.results[0].url).toBe('https://example.com');
  });

  it('does not retry a permanent client error', async () => {
    vi.stubEnv('SEARXNG_URL', 'http://search.test');
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400 });

    await expect(searxngSearch({ query: 'example' }, { fetchImpl })).rejects.toThrow('searxng HTTP 400');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries a dropped wake-up connection once', async () => {
    vi.stubEnv('SEARXNG_URL', 'http://search.test');
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ results: [] }) });

    await expect(searxngSearch({ query: 'example' }, { fetchImpl })).resolves.toMatchObject({ results: [] });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

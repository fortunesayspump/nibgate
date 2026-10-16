import { afterEach, describe, expect, it, vi } from 'vitest';
import { directExtract } from './direct.js';

afterEach(() => vi.useRealTimers());

const page = 'A readable article about infrastructure costs. '.repeat(8);

describe('direct extraction robots cache', () => {
  it('reuses rules, then refreshes them after an hour', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    const fetchImpl = vi.fn(async (url) => String(url).endsWith('/robots.txt')
      ? { ok: true, text: async () => 'User-agent: *\nDisallow: /private' }
      : { ok: true, status: 200, text: async () => page });

    const url = 'https://robots-cache-refresh.example/article';
    await directExtract({ urls: [url] }, { fetchImpl });
    await directExtract({ urls: [url] }, { fetchImpl });
    expect(fetchImpl.mock.calls.filter(([u]) => String(u).endsWith('/robots.txt'))).toHaveLength(1);

    vi.setSystemTime(new Date('2026-01-01T01:01:00Z'));
    await directExtract({ urls: [url] }, { fetchImpl });
    expect(fetchImpl.mock.calls.filter(([u]) => String(u).endsWith('/robots.txt'))).toHaveLength(2);
  });

  it('rechecks failed robots requests after a minute', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-02T00:00:00Z'));
    const fetchImpl = vi.fn(async (url) => String(url).endsWith('/robots.txt')
      ? { ok: false, status: 503 }
      : { ok: true, status: 200, text: async () => page });

    const url = 'https://robots-cache-failure.example/article';
    await directExtract({ urls: [url] }, { fetchImpl });
    vi.setSystemTime(new Date('2026-01-02T00:01:01Z'));
    await directExtract({ urls: [url] }, { fetchImpl });
    expect(fetchImpl.mock.calls.filter(([u]) => String(u).endsWith('/robots.txt'))).toHaveLength(2);
  });
});

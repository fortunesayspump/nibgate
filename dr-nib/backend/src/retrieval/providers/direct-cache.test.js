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

describe('direct extraction documentation fragments', () => {
  it('keeps the requested section beyond the normal page limit and preserves creator assessment', async () => {
    const expected='If __enter__ returns without an error, __exit__ will always be called. '.repeat(5);
    const html='<html><title>Reference</title><body><section id="earlier">'+page.repeat(100)+'</section><section id="the-with-statement"><h2>The with statement</h2><p>'+expected+'</p></section></body></html>';
    const fetchImpl=async url=>new Response(String(url).endsWith('/robots.txt')?'User-agent: *\nAllow: /':html,{headers:{'content-type':String(url).endsWith('/robots.txt')?'text/plain':'text/html'}});
    const result=await directExtract({urls:['https://fragment-reference.example/reference#the-with-statement'],maxChars:1000},{fetchImpl,assessPage:async()=>({readableText:'Wrong whole-page prefix. '.repeat(50),eligible:false})});
    expect(result.documents).toHaveLength(1);expect(result.documents[0].text).toContain('If __enter__ returns without an error');expect(result.documents[0].text).not.toContain('Wrong whole-page');expect(result.documents[0].creatorAssessment.eligible).toBe(false);
  });
  it('retains normal extraction for a missing fragment', async () => {
    const fetchImpl=async url=>new Response(String(url).endsWith('/robots.txt')?'User-agent: *\nAllow: /':'<html><body><article>'+page+'</article></body></html>',{headers:{'content-type':'text/html'}});
    const result=await directExtract({urls:['https://missing-fragment.example/reference#absent']},{fetchImpl});expect(result.documents).toHaveLength(1);expect(result.documents[0].text).toContain('infrastructure costs');
  });
});

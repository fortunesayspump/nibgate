import { describe, expect, it } from 'vitest';
import { applyUrlPolicy, checkUrlPolicy } from './policy.js';
import { httpRequest } from './http.js';
import { compute } from './compute.js';
import { isIn, parse } from './ipaddr-lite.js';

describe('domain policy', () => {
  it('allows everything when no lists are set', () => {
    expect(checkUrlPolicy('https://anything.example/page', {})).toEqual({ ok: true });
  });

  it('a deny always wins, including subdomains', () => {
    expect(checkUrlPolicy('https://evil.com/x', { deny: ['evil.com'] }).ok).toBe(false);
    expect(checkUrlPolicy('https://sub.evil.com/x', { deny: ['evil.com'] }).ok).toBe(false);
    expect(checkUrlPolicy('https://not-evil.com/', { deny: ['evil.com'] })).toEqual({ ok: true });
  });

  it('a non-empty allow list refuses everything not on it', () => {
    expect(checkUrlPolicy('https://arxiv.org/abs/1', { allow: ['arxiv.org'] }).ok).toBe(true);
    expect(checkUrlPolicy('https://sub.arxiv.org/abs/1', { allow: ['arxiv.org'] }).ok).toBe(true);
    expect(checkUrlPolicy('https://other.org/', { allow: ['arxiv.org'] }).ok).toBe(false);
  });

  it('filters candidate lists and reports what was cut', () => {
    const { kept, cut } = applyUrlPolicy(
      [{ url: 'https://arxiv.org/a' }, { url: 'https://evil.com/b' }],
      { deny: ['evil.com'] },
    );
    expect(kept).toHaveLength(1);
    expect(cut).toHaveLength(1);
    expect(cut[0].reason).toMatch(/domain-denied/);
  });
});

describe('ipaddr-lite', () => {
  it('classifies v4 ranges', () => {
    expect(isIn('127.0.0.1', '127.0.0.0/8')).toBe(true);
    expect(isIn('10.1.2.3', '10.0.0.0/8')).toBe(true);
    expect(isIn('8.8.8.8', '10.0.0.0/8')).toBe(false);
    expect(isIn('169.254.169.254', '169.254.0.0/16')).toBe(true);
  });

  it('classifies v6 loopback and mapped v4', () => {
    expect(isIn('::1', '::1/128')).toBe(true);
    expect(parse('::ffff:127.0.0.1').family).toBe(6);
  });

  it('rejects garbage instead of classifying it public', () => {
    expect(() => parse('not-an-ip')).toThrow();
    expect(() => parse('999.1.1.1')).toThrow();
  });
});

describe('http_request SSRF guard', () => {
  it('refuses loopback, private, and metadata addresses', async () => {
    for (const url of ['http://127.0.0.1/', 'http://10.1.2.3/', 'http://169.254.169.254/latest', 'http://[::1]/']) {
      await expect(httpRequest({ url }, { fetchImpl: async () => { throw new Error('must not be called'); } }))
        .rejects.toThrow(/private-address|unparseable/);
    }
  });

  it('refuses non-http schemes', async () => {
    await expect(httpRequest({ url: 'file:///etc/passwd' }, { fetchImpl: async () => { throw new Error('must not be called'); } }))
      .rejects.toThrow(/scheme-not-allowed/);
  });

  it('refuses a redirect that bounces into private space', async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes('public.example')) {
        return { status: 302, headers: { get: (k) => (k === 'location' ? 'http://127.0.0.1/admin' : null) }, arrayBuffer: async () => new ArrayBuffer(0) };
      }
      throw new Error('must not fetch private hop');
    };
    // public.example needs DNS; stub it by pointing at a public IP literal path instead:
    const pub = async (url) => {
      if (String(url).startsWith('http://93.184.216.34/')) {
        return { status: 302, headers: { get: (k) => (k === 'location' ? 'http://127.0.0.1/admin' : null) }, arrayBuffer: async () => new ArrayBuffer(0) };
      }
      throw new Error('unexpected fetch ' + url);
    };
    await expect(httpRequest({ url: 'http://93.184.216.34/' }, { fetchImpl: pub })).rejects.toThrow(/private-address/);
    expect(fetchImpl).toBeDefined();
  });

  it('rejects disallowed methods', async () => {
    await expect(httpRequest({ url: 'http://93.184.216.34/', method: 'DELETE' }, { fetchImpl: async () => { throw new Error('x'); } }))
      .rejects.toThrow(/method-not-allowed/);
  });
});

describe('compute sandbox', () => {
  it('evaluates expressions over the given input', async () => {
    const out = await compute({ code: 'input.values.reduce((a, b) => a + b, 0) / input.values.length', input: { values: [2, 4, 6] } });
    expect(out.result).toBe(4);
  });

  it('runs statement bodies and returns JSON-safe values', async () => {
    const out = await compute({ code: 'const t = input.a + input.b; return { total: t };', input: { a: 1, b: 2 } });
    expect(out.result).toEqual({ total: 3 });
  });

  it('has no I/O: process, require, and fetch are absent', async () => {
    for (const code of ['process.exit()', "require('fs')", "fetch('http://x')", 'Function("return 1")()']) {
      await expect(compute({ code })).rejects.toThrow(/compute failed/);
    }
  });

  it('kills an infinite loop on the timeout instead of hanging the run', async () => {
    await expect(compute({ code: 'while (true) {}', timeoutMs: 200 })).rejects.toThrow(/compute failed/);
  }, 10000);
});

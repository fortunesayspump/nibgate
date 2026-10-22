import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@nibgate/internal/db.js', () => ({ db: {} }));
import { fetchHomeHtml, fetchPeerIdentity } from './helpers.js';
import { fetchSitemap, submitIndexNow } from './gsc-index.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('outbound HTTP response lifecycle', () => {
  it('keeps the homepage deadline active after headers arrive', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async (_url, { signal }) => new Response(new ReadableStream({
      start(controller) {
        signal.addEventListener('abort', () => controller.error(signal.reason), { once: true });
        controller.enqueue(new TextEncoder().encode('<html>partial'));
        // The remote site never completes its response body.
      },
    }))));
    const result = fetchHomeHtml('example.com');
    const rejected = expect(result).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cancels rejected homepage, peer and sitemap bodies without reading them', async () => {
    for (const run of [
      () => fetchHomeHtml('example.com').catch((e) => e.message),
      () => fetchPeerIdentity('example.com'),
      () => fetchSitemap('example.com'),
    ]) {
      const cancelled = vi.fn();
      const response = new Response(new ReadableStream({ cancel: cancelled }), { status: 503 });
      vi.stubGlobal('fetch', vi.fn(async () => response));
      await run();
      expect(cancelled).toHaveBeenCalledOnce();
    }
  });

  it('releases successful IndexNow responses and preserves the result', async () => {
    vi.stubEnv('INDEXNOW_KEY', 'synthetic-test-key');
    const cancelled = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({ cancel: cancelled }))));
    expect(await submitIndexNow('example.com', ['https://example.com/post'])).toEqual({ ok: true, urls: 1 });
    expect(cancelled).toHaveBeenCalledOnce();
  });

  it('still returns the complete homepage content and clears its timer', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>complete</html>')));
    expect(await fetchHomeHtml('example.com')).toBe('<html>complete</html>');
    expect(vi.getTimerCount()).toBe(0);
  });
});

// Shared HTTP helper for retrieval providers.
//
// Providers are metered services: a call that times out must not hang a run, and
// an HTTP error must be a typed failure the caller can attribute and charge for.
export class RetrievalUnavailable extends Error {
  constructor(message, { provider, status } = {}) {
    super(message);
    this.name = 'RetrievalUnavailable';
    this.provider = provider;
    this.status = status;
  }
}

export async function postJson(url, { headers, body, timeoutMs = 30_000, fetchImpl = fetch, provider = 'retrieval' } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('retrieval request timed out')), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new RetrievalUnavailable(`${provider} HTTP ${res.status}: ${text.slice(0, 200)}`, { provider, status: res.status });
    }
    return await res.json();
  } catch (err) {
    if (err instanceof RetrievalUnavailable) throw err;
    throw new RetrievalUnavailable(`${provider} unreachable: ${err.message}`, { provider });
  } finally {
    clearTimeout(timer);
  }
}

/** Canonical URL for dedupe: drop the hash and tracking params, fold trailing slash. */
export function normalizeUrl(raw) {
  try {
    const u = new URL(String(raw));
    u.hash = '';
    for (const key of [...u.searchParams.keys()]) {
      if (key.startsWith('utm_') || key === 'ref' || key.startsWith('ref_')) u.searchParams.delete(key);
    }
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
    let s = u.toString();
    if (s.endsWith('/')) s = s.slice(0, -1);
    return s;
  } catch {
    return String(raw || '').trim();
  }
}

/** Collapse a candidate list to one row per canonical URL, best score first. */
export function dedupeByUrl(items) {
  const seen = new Map();
  for (const item of items) {
    const key = normalizeUrl(item.url);
    if (!key) continue;
    const prev = seen.get(key);
    if (!prev || (Number(item.score) || 0) > (Number(prev.score) || 0)) {
      seen.set(key, { ...item, url: key });
    }
  }
  return [...seen.values()];
}

/** Bounded-parallel map: runs `fn` over `list` with at most `limit` in flight.
 * Order of results matches order of input. A rejection in one item does not
 * cancel the others; it rejects the whole call with the first error. */
export async function mapLimit(list, limit, fn) {
  const items = Array.isArray(list) ? list : [];
  const n = Math.max(1, Math.floor(Number(limit) || 1));
  const out = new Array(items.length);
  let next = 0;
  const workers = new Array(Math.min(n, items.length)).fill(0).map(async () => {
    while (next < items.length) {
      const i = next;
      next += 1;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

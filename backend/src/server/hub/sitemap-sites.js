// Hub identities mirror across networks; creator Site records and content do not.
// Check the network's authoritative public tenant endpoint, not Hub verification
// or content counts (a genuine new/empty creator still has a valid sitemap).
const API = { mainnet: 'https://api-subblogs.nibgate.xyz', testnet: 'https://testnet-api-subblogs.nibgate.xyz' };
const reserved = new Set('www api api-subblogs testnet testnet-api testnet-api-subblogs drnib private-drnib admin app blog dev staging test mail smtp pop imap webmail email help support docs status forum auth login signin register signup dashboard hub explore discover cdn static assets media files root home index main console manage management operator pay payment payments checkout webhook webhooks hook hooks ssl dns ns1 ns2 mx'.split(' '));
const platform = { mainnet: new Set(['www.nibgate.xyz', 'docs.nibgate.xyz']), testnet: new Set(['testnet.nibgate.xyz']) };

export function sitemapCandidate(domain, network) {
  if (!API[network] || typeof domain !== 'string') return null;
  const host = domain.trim().toLowerCase();
  if (platform[network].has(host)) return { host, tenant: null };
  const pattern = network === 'mainnet'
    ? /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.nibgate\.xyz$/
    : /^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.testnet\.nibgate\.xyz$/;
  const tenant = pattern.exec(host)?.[1];
  if (!tenant || reserved.has(tenant) || tenant.startsWith('testnet-')) return null;
  return { host, tenant };
}

export function createSitemapSiteResolver({ fetcher = (...args) => fetch(...args), now = Date.now } = {}) {
  const cache = new Map();
  const inFlight = new Map();
  async function exists(candidate, network, deadline) {
    const key = `${network}:${candidate.host}`;
    const previous = cache.get(key);
    if (previous && now() - previous.at < (previous.exists ? 300_000 : 60_000)) return previous.exists;
    if (inFlight.has(key)) return inFlight.get(key);
    const work = (async () => {
      try {
        const url = `${API[network]}/blog/public-site-v2?subdomain=${encodeURIComponent(candidate.tenant)}`;
        const response = await fetcher(url, { headers: { accept: 'application/json', 'x-site-subdomain': candidate.tenant, 'x-forwarded-host': candidate.host }, redirect: 'manual', signal: AbortSignal.any([AbortSignal.timeout(3000), deadline]) });
        let found;
        try {
          if (!/^application\/json(?:;|$)/i.test(response.headers.get('content-type') || '')) throw new Error('Unexpected tenant response');
          const body = await response.json();
          if (response.status === 404 && ['Site not found', 'Not found'].includes(body?.error) && (!body.subdomain || body.subdomain === candidate.tenant)) found = false;
          else if (response.ok && body?.success === true && body?.site?.subdomain === candidate.tenant) found = true;
          else throw new Error('Tenant lookup unavailable');
        } finally { await response.body?.cancel().catch(() => {}); }
        cache.set(key, { exists: found, at: now() });
        // Bound process-local memory independently of requests and old domains.
        if (cache.size > 2000) cache.delete(cache.keys().next().value);
        return found;
      } catch {
        // A brief outage must not remove a recently confirmed real creator.
        // Never use stale negative results or mistake an outage for absence.
        if (previous?.exists && now() - previous.at < 1_800_000) return true;
        throw new Error('Creator sitemap availability could not be verified');
      } finally { inFlight.delete(key); }
    })();
    inFlight.set(key, work);
    return work;
  }
  return async function resolveSitemapSites(domains, network) {
    if (!API[network]) throw new Error('Unknown sitemap network');
    const candidates = [...new Set(domains)].map(domain => sitemapCandidate(domain, network)).filter(Boolean);
    const result = new Array(candidates.length);
    const deadline = AbortSignal.timeout(10_000);
    let cursor = 0;
    let failed = false;
    // At most six metadata reads at once, including on the first cold request.
    await Promise.all(Array.from({ length: Math.min(6, candidates.length) }, async () => {
      while (cursor < candidates.length && !failed) {
        const index = cursor++;
        const candidate = candidates[index];
        try { result[index] = candidate.tenant === null || await exists(candidate, network, deadline) ? candidate.host : null; }
        catch { failed = true; }
      }
    }));
    if (failed) throw new Error('Creator sitemap availability could not be verified');
    return [...new Set(result.filter(Boolean))];
  };
}

export const resolveSitemapSites = createSitemapSiteResolver();

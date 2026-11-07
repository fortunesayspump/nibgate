// Public discovery is a current publication snapshot, never a projection of
// stale Hub Content rows. Verified ownership alone does not make a post public.
// Historical tables have no event-time visibility evidence and must not be read
// by public activity, ranking or money-stat surfaces.
const SITE_LIMIT = 100;
const PER_SITE_LIMIT = 20;
const JSON_LIMIT = 1024 * 1024;
const REQUEST_DEADLINE_MS = 10000;
const FINAL_SNAPSHOT_MAX_AGE_MS = 2000;
const HISTORY_STATUS = 'unavailable-no-event-visibility-proof';
const RESERVED = new Set(['www', 'api', 'docs', 'testnet', 'drnib', 'private-drnib', 'api-subblogs', 'testnet-api-subblogs']);

export function eventVisibilityUnavailable() {
  return Object.assign(new Error('Historical public activity and rankings are unavailable because publication visibility at the time of each event cannot be verified.'), {
    status: 503, code: 'event-visibility-unavailable',
  });
}
function sourceUnavailable() {
  return Object.assign(new Error('Current public publications are temporarily unavailable.'), { status: 503, code: 'public-source-unavailable' });
}
function invalidQuery() { return Object.assign(new Error('Invalid public discovery filters.'), { status: 400, code: 'invalid-public-filters' }); }

export function creatorSource(domain, network) {
  const value = String(domain || '').toLowerCase();
  let match;
  if (network === 'mainnet') {
    match = value.match(/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.nibgate\.xyz$/);
    if (!match || match[1].startsWith('testnet-')) return null;
  } else if (network === 'testnet') {
    match = value.match(/^([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.testnet\.nibgate\.xyz$/)
      || value.match(/^testnet-([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)\.nibgate\.xyz$/);
    if (!match) return null;
  } else return null;
  const subdomain = match[1];
  if (RESERVED.has(subdomain)) return null;
  const canonicalDomain = `${subdomain}${network === 'testnet' ? '.testnet' : ''}.nibgate.xyz`;
  return {
    subdomain, domain: canonicalDomain, origin: `https://${canonicalDomain}`,
    // Never fetch an arbitrary registered domain or follow a redirect. Both
    // routes belong to the platform's tenant-scoped, reviewed public contract.
    apiOrigin: network === 'mainnet' ? 'https://api-subblogs.nibgate.xyz' : 'https://testnet-api-subblogs.nibgate.xyz',
  };
}

async function fetchJson(source, path, fetchFn, signal) {
  try {
    const response = await fetchFn(`${source.apiOrigin}${path}`, {
      method: 'GET', cache: 'no-store', redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      headers: { Accept: 'application/json', 'x-site-subdomain': source.subdomain, 'x-forwarded-host': source.domain },
    });
    if (!response.ok || response.redirected || !response.headers.get('content-type')?.includes('application/json')) throw sourceUnavailable();
    const reader = response.body?.getReader();
    if (!reader) throw sourceUnavailable();
    let bytes = 0;
    const chunks = [];
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > JSON_LIMIT) { await reader.cancel(); throw sourceUnavailable(); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch { throw sourceUnavailable(); }
}

function validHome(home, source) {
  return home?.success === true && home.site?.subdomain === source.subdomain
    && typeof home.site.name === 'string' && Array.isArray(home.posts) && home.posts.length <= PER_SITE_LIMIT
    && home.posts.every(post => post && typeof post.id === 'string' && post.id.length > 0 && post.id.length <= 200
      && /^[a-zA-Z0-9_-]{1,200}$/.test(post.slug) && post.type === 'article' && typeof post.title === 'string'
      && (post.excerpt === null || typeof post.excerpt === 'string')
      && (post.coverUrl === null || typeof post.coverUrl === 'string')
      && (post.publishedAt === null || typeof post.publishedAt === 'string')
      && typeof post.updatedAt === 'string' && Number.isFinite(Date.parse(post.updatedAt))
      && (post.price === null || (typeof post.price === 'string' && post.price.trim() !== '' && Number.isFinite(Number(post.price)) && Number(post.price) >= 0)));
}
const text = value => value == null ? '' : String(value);
function stablePost(a, b) {
  return ['id', 'slug', 'type', 'title', 'excerpt', 'coverUrl', 'publishedAt', 'updatedAt', 'price'].every(key => text(a?.[key]) === text(b?.[key]));
}
function safeImage(value) {
  if (!value) return '';
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}

async function prepareSiteSnapshot(site, source, fetchFn, signal) {
  const home = await fetchJson(source, '/api/blog/public-home-v2', fetchFn, signal);
  if (!validHome(home, source)) throw sourceUnavailable();
  const manifest = await fetchJson(source, '/api/nibgate/manifest', fetchFn, signal);
  if (manifest?.origin !== source.origin || !Array.isArray(manifest.content)) throw sourceUnavailable();
  return { site, source, home, manifest };
}

function currentSitePublications({ site, source, home, manifest, finalHome }) {
  if (!validHome(finalHome, source)) throw sourceUnavailable();
  const latest = new Map(finalHome.posts.map(post => [post.id, post]));
  const manifestById = new Map();
  for (const entry of manifest.content) {
    if (!entry || typeof entry.id !== 'string' || manifestById.has(entry.id)) throw sourceUnavailable();
    manifestById.set(entry.id, entry);
  }
  const seen = new Set();
  return home.posts.flatMap(post => {
    if (seen.has(post.id)) throw sourceUnavailable();
    seen.add(post.id);
    const fresh = latest.get(post.id);
    const resource = manifestById.get(post.id);
    const path = `/writing/${post.slug}`;
    const url = `${source.origin}${path}`;
    // A changed, omitted, invite-only or unpublished record is excluded.
    // Malformed current records are a source failure, not an empty listing.
    if (!fresh || !stablePost(post, fresh) || !resource) return [];
    const rawPrice = resource.price;
    const price = rawPrice === null ? 0 : (typeof rawPrice === 'string' && rawPrice.trim() !== '' ? Number(rawPrice) : NaN);
    if (resource.currency !== 'USDC' || !Number.isFinite(price) || price < 0
      || typeof resource.title !== 'string' || typeof resource.summary !== 'string'
      || typeof resource.path !== 'string' || typeof resource.url !== 'string') throw sourceUnavailable();
    if (resource.type !== 'article' || resource.path !== path || resource.url !== url
      || resource.title !== post.title || text(resource.summary) !== text(post.excerpt)
      || price !== (fresh.price === null ? 0 : Number(fresh.price))) return [];
    // The manifest may carry a legacy imageUrl fallback absent from home.
    // Only the independently rechecked home cover is displayed.
    return [{
      id: post.id, identityScope: 'creator-publication', websiteId: site.id,
      websiteName: finalHome.site.name, websiteDomain: source.domain, websiteVerified: true,
      websiteVerificationStatus: 'verified', title: post.title, description: text(post.excerpt),
      imageUrl: safeImage(post.coverUrl), contentType: 'article', tags: '', tagList: [], url,
      manifestUrl: `${source.origin}/api/nibgate/manifest?path=${encodeURIComponent(path)}`,
      currency: 'USDC', price, createdAt: post.publishedAt, updatedAt: fresh.updatedAt,
      // Unknown is not zero. Present visibility cannot establish what was
      // public when a historical view, payment, rating or tip happened.
      views: null, unlocks: null, revenue: null, ratings: null,
      reputationScore: null, reputationStars: null,
    }];
  });
}

export async function getPublicDiscovery(db, args = {}, { network = process.env.NIBGATE_NETWORK || 'testnet', fetchFn = globalThis.fetch, now = Date.now } = {}) {
  const limit = Math.min(Math.max(Number.parseInt(args.limit || '100', 10) || 100, 1), 500);
  const skip = Math.max(Number.parseInt(args.skip || '0', 10) || 0, 0);
  const type = String(args.type || '').trim().toLowerCase();
  const requestedSort = String(args.sort || 'trending').trim().toLowerCase();
  const q = String(args.q || '').trim().toLowerCase();
  if (skip > 10000 || q.length > 200 || !['', 'all', 'article', 'music', 'video', 'image', 'document'].includes(type)
    || !['trending', 'best-sellers', 'hot-new', 'newest-publication'].includes(requestedSort)
    || !['mainnet', 'testnet'].includes(network)) throw invalidQuery();
  const startedAt = now();
  const signal = AbortSignal.timeout(REQUEST_DEADLINE_MS);
  const candidates = await db.website.findMany({
    where: { deletedAt: null, isVerified: true, verificationStatus: 'verified' },
    select: { id: true, domain: true }, orderBy: { domain: 'asc' }, take: SITE_LIMIT + 1,
  });
  const sources = [];
  const seenDomains = new Set();
  let unsupportedSites = 0;
  for (const site of candidates.slice(0, SITE_LIMIT)) {
    const source = creatorSource(site.domain, network);
    if (!source) { unsupportedSites++; continue; }
    if (seenDomains.has(source.domain)) continue;
    seenDomains.add(source.domain);
    sources.push({ site, source });
  }
  const snapshots = [];
  // Bounded parallel reads with a single request-wide deadline. No publication
  // snapshot or eligibility decision is cached across requests.
  for (let index = 0; index < sources.length; index += 8) {
    if (signal.aborted || now() - startedAt > REQUEST_DEADLINE_MS) throw sourceUnavailable();
    snapshots.push(...await Promise.all(sources.slice(index, index + 8).map(({ site, source }) => prepareSiteSnapshot(site, source, fetchFn, signal))));
  }
  // Revalidate all sites adjacent to serialization, after manifest collection.
  // This is a bounded distributed snapshot, not an atomic cross-site read.
  const finalSnapshots = [];
  for (let index = 0; index < snapshots.length; index += 16) {
    finalSnapshots.push(...await Promise.all(snapshots.slice(index, index + 16).map(async snapshot => ({
      ...snapshot, finalHome: await fetchJson(snapshot.source, '/api/blog/public-home-v2', fetchFn, signal), observedAt: now(),
    }))));
  }
  if (signal.aborted || now() - startedAt > REQUEST_DEADLINE_MS
    || finalSnapshots.some(snapshot => now() - snapshot.observedAt > FINAL_SNAPSHOT_MAX_AGE_MS)) throw sourceUnavailable();
  const publications = finalSnapshots.flatMap(currentSitePublications);
  const filtered = publications.filter(item => (!type || type === 'all' || type === item.contentType)
    && (!q || [item.title, item.description, item.websiteName, item.websiteDomain].some(value => value.toLowerCase().includes(q))));
  filtered.sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0) || a.websiteDomain.localeCompare(b.websiteDomain) || a.id.localeCompare(b.id));
  return {
    success: true, content: filtered.slice(skip, skip + limit), total: filtered.length, limit, skip,
    scope: 'current-public-creator-articles', sort: 'newest-publication', requestedSort,
    historyStatus: HISTORY_STATUS,
    coverage: { perSiteLimit: PER_SITE_LIMIT, siteLimit: SITE_LIMIT, sitesTruncated: candidates.length > SITE_LIMIT,
      checkedSites: sources.length, unsupportedSites, snapshot: 'bounded-distributed', maxFinalSnapshotAgeMs: FINAL_SNAPSHOT_MAX_AGE_MS, source: 'public-home-v2+manifest', contentTypes: ['article'] },
  };
}

export async function getPublicStats(db, options = {}) {
  const result = await getPublicDiscovery(db, { limit: 500, sort: 'newest-publication' }, options);
  // There may be >500 public rows. Avoid claiming an exhaustive site count from
  // a paginated subset; content count is the proven current discovery total.
  return { success: true, scope: result.scope, coverage: result.coverage, historyStatus: HISTORY_STATUS,
    stats: { creators: null, sites: result.total > 500 ? null : new Set(result.content.map(item => item.websiteDomain)).size,
      content: result.total, views: null, unlocks: null, revenue: null, protocolFees: null, tips: null, tipRevenue: null } };
}

export async function getPublicLedger(_db, _args = {}) { throw eventVisibilityUnavailable(); }
export async function getPublicLeaderboards(_db, _args = {}) { throw eventVisibilityUnavailable(); }

const prisma = require('./prisma');

const cache = new Map();
const CACHE_TTL_MS = 60_000;
const MAX_CACHE_ENTRIES = 1000;

function cacheKey(subdomain) {
  return `site:${subdomain}`;
}

function cached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  // Refresh recency without extending freshness.
  cache.delete(key);
  cache.set(key, entry);
  return entry.site;
}

async function resolveSite(subdomain) {
  const key = cacheKey(subdomain);
  const hit = cached(key);
  if (hit) return hit;

  const site = await prisma.site.findUnique({ where: { subdomain } });
  if (!site) return null;

  cache.delete(key);
  cache.set(key, { site, expiresAt: Date.now() + CACHE_TTL_MS });
  while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);

  return site;
}

function invalidateSite(subdomain) {
  cache.delete(cacheKey(subdomain));
}

module.exports = { resolveSite, invalidateSite };

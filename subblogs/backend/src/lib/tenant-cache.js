const prisma = require('./prisma');

const cache = new Map();
const CACHE_TTL_MS = 60_000;

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
  return entry.site;
}

async function resolveSite(subdomain) {
  const key = cacheKey(subdomain);
  const hit = cached(key);
  if (hit) return hit;

  const site = await prisma.site.findUnique({ where: { subdomain } });
  if (!site) return null;

  cache.set(key, { site, expiresAt: Date.now() + CACHE_TTL_MS });

  if (cache.size > 1000) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now > v.expiresAt) cache.delete(k);
    }
  }

  return site;
}

function invalidateSite(subdomain) {
  cache.delete(cacheKey(subdomain));
}

module.exports = { resolveSite, invalidateSite };

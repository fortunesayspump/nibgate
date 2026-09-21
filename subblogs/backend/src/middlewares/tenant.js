const { status } = require('http-status');
const { resolveSite } = require('../lib/tenant-cache');
const { isValidSubdomain } = require('../lib/validate');

const PUBLIC_PATHS = [
  '/api/auth/login', '/api/auth/register', '/api/setup', '/api/health', '/api/nibgate/gateway/balance',
  '/auth/login', '/auth/register', '/setup', '/health', '/nibgate/gateway/balance',
];

// Testnet aliases resolve to the same site row as the canonical subdomain:
//   <name>.testnet.nibgate.xyz   (canonical — covered by the *.testnet wildcard)
//   testnet-<name>.nibgate.xyz    (legacy exact domains, pre-wildcard backfill)
// The canonical subdomain (used for hub linking, hashes, and emails) stays `<name>`.
const TESTNET_PREFIX = 'testnet-';

function canonicalSubdomain(subdomain = '') {
  const clean = String(subdomain || '').trim().toLowerCase();
  if (clean.startsWith(TESTNET_PREFIX) && clean.length > TESTNET_PREFIX.length) {
    return clean.slice(TESTNET_PREFIX.length);
  }
  return clean;
}

// Raw request host (no port). Trusts x-forwarded-host behind the frontend proxy.
function requestHost(req) {
  return String(req.get?.('x-forwarded-host') || req.get?.('host') || req.headers?.['x-forwarded-host'] || req.headers?.host || '').split(':')[0].toLowerCase();
}

function requestOrigin(req) {
  const host = requestHost(req);
  return host ? `https://${host}` : '';
}

// The site's domain for THIS stack: the actual nibgate host in use when the
// request came through one, else the canonical subdomain host. Hub rows,
// hashes, ledger lookups, and link registrations must all use this form so
// testnet (<name>.testnet.nibgate.xyz) and mainnet (<name>.nibgate.xyz) never mix.
function requestSiteDomain(req, subdomain) {
  const host = requestHost(req);
  if (host && host.endsWith('.nibgate.xyz')) return host;
  const sub = canonicalSubdomain(subdomain || req.subdomain || req.site?.subdomain || '');
  return sub ? `${sub}.nibgate.xyz` : '';
}

function subdomainFromHost(host = '') {
  const h = host.split(':')[0].toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') return 'demo';
  const parts = h.split('.');
  if (parts.length >= 3 && parts[0] !== 'www') return parts[0];
  return parts[0] === 'www' ? parts[1] : parts[0];
}

async function resolveTenant(req, res, next) {
  const originalUrl = req.originalUrl || req.url;
  const isPublic = PUBLIC_PATHS.some((p) => originalUrl.startsWith(p) || req.path === p || req.path.startsWith(p + '/'));
  if (isPublic) return next();

  let subdomain = req.headers['x-site-subdomain'] || (req.query.subdomain ? String(req.query.subdomain).trim() : '') || subdomainFromHost(req.headers['x-forwarded-host'] || req.headers.host || 'localhost');
  subdomain = canonicalSubdomain(subdomain);
  if (!isValidSubdomain(subdomain)) {
    return res.status(400).json({ error: 'Invalid subdomain.', subdomain });
  }

  try {
    const site = await resolveSite(subdomain);
    if (!site) {
      if (req.headers.authorization?.startsWith('Bearer ')) {
        return next();
      }
      return res.status(status.NOT_FOUND).json({ error: 'Site not found', subdomain });
    }

    req.site = site;
    req.siteId = site.id;
    req.subdomain = subdomain;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { resolveTenant, subdomainFromHost, canonicalSubdomain, TESTNET_PREFIX, requestHost, requestOrigin, requestSiteDomain };

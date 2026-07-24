const { status } = require('http-status');
const { resolveSite } = require('../lib/tenant-cache');
const { isValidSubdomain } = require('../lib/validate');

const PUBLIC_PATHS = ['/api/auth/login', '/api/auth/register', '/api/setup', '/api/health', '/api/nibgate/gateway/balance'];

function subdomainFromHost(host = '') {
  const h = host.split(':')[0].toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') return 'demo';
  const parts = h.split('.');
  if (parts.length >= 3 && parts[0] !== 'www') return parts[0];
  return parts[0] === 'www' ? parts[1] : parts[0];
}

async function resolveTenant(req, res, next) {
  const isPublic = PUBLIC_PATHS.some((p) => req.path === p || req.path.startsWith(p + '/'));
  if (isPublic) return next();

  let subdomain = req.headers['x-site-subdomain'] || (req.query.subdomain ? String(req.query.subdomain).trim() : '') || subdomainFromHost(req.headers['x-forwarded-host'] || req.headers.host || 'localhost');
  subdomain = subdomain.trim().toLowerCase();
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

module.exports = { resolveTenant, subdomainFromHost };

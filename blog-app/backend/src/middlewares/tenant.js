const { status } = require('http-status');
const { resolveSite } = require('../lib/tenant-cache');

const PUBLIC_PATHS = ['/api/setup', '/api/health'];

function subdomainFromHost(host = '') {
  const h = host.split(':')[0].toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') return 'demo';
  const parts = h.split('.');
  if (parts.length >= 3 && parts[0] !== 'www') return parts[0];
  return parts[0] === 'www' ? parts[1] : parts[0];
}

async function resolveTenant(req, res, next) {
  if (PUBLIC_PATHS.some((p) => req.path.startsWith(p))) return next();

  const subdomain = req.headers['x-site-subdomain'] || subdomainFromHost(req.headers['x-forwarded-host'] || req.headers.host || 'localhost');

  try {
    const site = await resolveSite(subdomain);
    if (!site) {
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

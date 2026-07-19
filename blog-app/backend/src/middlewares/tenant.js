const { status } = require('http-status');
const { resolveSite } = require('../lib/tenant-cache');

const PLATFORM_DOMAINS = [
  '.up.railway.app', '.vercel.app', '.onrender.com', '.fly.dev',
  '.netlify.app', '.pages.dev', '.workers.dev',
];

function subdomainFromHost(host = '') {
  const h = host.split(':')[0].toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') return process.env.DEFAULT_SITE_SUBDOMAIN || 'demo';
  const parts = h.split('.');
  const fullDomain = parts.slice(-3).join('.');
  if (PLATFORM_DOMAINS.some((d) => fullDomain.endsWith(d))) {
    return process.env.DEFAULT_SITE_SUBDOMAIN || 'demo';
  }
  if (parts.length >= 3 && parts[0] !== 'www') return parts[0];
  return parts[0] === 'www' ? parts[1] : parts[0];
}

const PUBLIC_PATHS = ['/api/setup', '/api/health'];

async function resolveTenant(req, res, next) {
  if (PUBLIC_PATHS.some((p) => req.path.startsWith(p))) return next();

  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const subdomain = subdomainFromHost(host);

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

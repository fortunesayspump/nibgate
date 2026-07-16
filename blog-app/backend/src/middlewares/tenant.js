const { PrismaClient } = require('@prisma/client');
const { status } = require('http-status');

const prisma = new PrismaClient();

function domainFromHost(host = '') {
  const h = host.split(':')[0].toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1') return { subdomain: 'demo', isRoot: true };
  const parts = h.split('.');
  if (parts.length >= 3 && parts[0] !== 'www') {
    return { subdomain: parts[0], isRoot: false };
  }
  return { subdomain: parts[0] === 'www' ? parts[1] : parts[0], isRoot: true };
}

async function resolveTenant(req, res, next) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  const { subdomain } = domainFromHost(host);

  const site = await prisma.site.findUnique({ where: { subdomain } });
  if (!site) {
    return res.status(status.NOT_FOUND).json({ error: 'Site not found', subdomain });
  }

  req.site = site;
  req.siteId = site.id;
  next();
}

module.exports = { resolveTenant, domainFromHost };

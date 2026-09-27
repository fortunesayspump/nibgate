const config = require('../config/config');
const prisma = require('./prisma');
const { invalidateSite } = require('./tenant-cache');

// Self-heal an anchored subblog's hub linkage. Hosted nibgate subblogs are
// network-pinned and never adopted cross-stack by the hub, so a mainnet mirror
// of a linked testnet blog starts life with no settings.hubSiteId/hubToken and
// silently drops every view/unlock event the widget emits. Instead of a manual
// re-link, pull the linkage from the hub by domain (the hub only answers with
// the shared peer secret) and persist it. Best-effort: never blocks a request.
async function ensureHubLink(site, domain) {
  if (!site) return { linked: false, settings: {} };
  let settings = {};
  try { settings = site.settings ? JSON.parse(site.settings) : {}; } catch { settings = {}; }
  if (settings.hubSiteId && settings.hubToken) return { linked: true, settings };

  const secret = config.nibgate.peerSecret;
  if (!secret || !domain) {
    if (process.env.NIBGATE_HUB_LINK_DEBUG) console.warn('[hub-link] skip', { sub: site.subdomain, hasSecret: Boolean(secret), domain });
    return { linked: false, settings };
  }

  try {
    const res = await fetch(`${config.nibgate.hubApi}/hub/site/link-info?domain=${encodeURIComponent(domain)}`, {
      headers: { 'x-peer-secret': secret, accept: 'application/json' },
    });
    if (!res.ok) {
      if (process.env.NIBGATE_HUB_LINK_DEBUG) console.warn('[hub-link] hub refused', { sub: site.subdomain, domain, status: res.status });
      return { linked: false, settings };
    }
    const data = await res.json().catch(() => ({}));
    if (!data?.success || !data.siteId || !data.verifyToken) return { linked: false, settings };

    settings.hubSiteId = data.siteId;
    settings.hubToken = data.verifyToken;
    if (!settings.recipientWallet && data.ownerWallet) settings.recipientWallet = data.ownerWallet;

    await prisma.site.update({ where: { id: site.id }, data: { settings: JSON.stringify(settings) } });
    invalidateSite(site.subdomain);
    return { linked: true, settings };
  } catch {
    return { linked: false, settings };
  }
}

module.exports = { ensureHubLink };

import crypto from 'node:crypto';
import { createHubStore } from './hub-store.js';
import { verifySignedEnvelope } from '../../cli/packages/core/hub.js';

function badRequest(message, status = 400) {
  return { status, body: { error: message } };
}

function ok(body, status = 200) {
  return { status, body };
}

function currentHubUrl(req) {
  const forwardedProto = req.headers['x-forwarded-proto'];
  const host = req.headers.host;
  if (forwardedProto && host) return `${forwardedProto}://${host}`;
  return process.env.NIBGATE_HUB_PUBLIC_URL || 'http://localhost:3000';
}

export async function connectSite(req, body) {
  if (!body?.origin || !body?.site?.name) {
    return badRequest('origin and site.name are required');
  }

  const store = createHubStore();
  const existing = store.listSites().find((site) => site.origin === body.origin);
  const siteId = existing?.siteId || `site_${crypto.randomUUID()}`;
  const siteToken = existing?.siteToken || crypto.randomBytes(24).toString('hex');
  const verifyToken = existing?.verifyToken || crypto.randomBytes(16).toString('hex');
  const hubUrl = currentHubUrl(req);

  const nextSite = store.upsertSite({
    siteId,
    siteToken,
    verifyToken,
    verified: existing?.verified || false,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    name: body.site.name,
    origin: body.origin,
    domain: body.domain || '',
    resources: existing?.resources || [],
    stats: existing?.stats || { views: 0, unlocks: 0, revenue: '0.000000' },
    events: existing?.events || []
  });

  return ok({
    storageMode: store.storageMode,
    siteId: nextSite.siteId,
    siteToken: nextSite.siteToken,
    verifyToken: nextSite.verifyToken,
    verified: nextSite.verified,
    endpoints: {
      connect: `${hubUrl}/api/hub/sites/connect`,
      verify: `${hubUrl}/api/hub/sites/verify`,
      sync: `${hubUrl}/api/hub/sites/sync`,
      events: `${hubUrl}/api/hub/events`
    }
  }, existing ? 200 : 201);
}

function authenticatedSite(body, req) {
  const siteId = req.headers['x-nibgate-site-id'] || body?.siteId;
  const signature = req.headers['x-nibgate-signature'] || body?.signature;
  if (!siteId || !signature) return { error: badRequest('Missing site credentials', 401) };

  const store = createHubStore();
  const site = store.findSite(siteId);
  if (!site) return { error: badRequest('Unknown site', 404) };
  if (!verifySignedEnvelope(body.payload || body, site.siteToken, signature)) {
    return { error: badRequest('Invalid signature', 401) };
  }

  return { site, store };
}

export async function syncSiteManifest(req, body) {
  const auth = authenticatedSite(body, req);
  if (auth.error) return auth.error;

  const manifest = body.payload?.manifest || body.manifest;
  if (!manifest?.site || !Array.isArray(manifest?.resources)) {
    return badRequest('manifest.site and manifest.resources are required');
  }

  const site = auth.store.syncManifest(auth.site.siteId, manifest);
  return ok({
    ok: true,
    siteId: site.siteId,
    verified: site.verified,
    resourceCount: site.resources.length,
    lastSyncAt: site.lastSyncAt
  });
}

export async function verifySiteOwnership(_req, body) {
  const siteId = body?.siteId;
  if (!siteId) return badRequest('siteId is required');

  const store = createHubStore();
  const site = store.findSite(siteId);
  if (!site) return badRequest('Unknown site', 404);

  try {
    const manifestUrl = `${site.origin.replace(/\/$/, '')}/.well-known/nibgate.json`;
    const verificationUrl = `${site.origin.replace(/\/$/, '')}/.well-known/nibgate-verify.txt`;
    const [manifestRes, verificationRes] = await Promise.all([fetch(manifestUrl), fetch(verificationUrl)]);

    if (!manifestRes.ok || !verificationRes.ok) {
      return badRequest('Could not fetch verification assets from the site', 502);
    }

    const manifest = await manifestRes.json();
    const verificationFile = await verificationRes.text();
    const manifestToken = manifest?.verification?.token || '';

    if (manifestToken !== site.verifyToken || !verificationFile.includes(`token=${site.verifyToken}`)) {
      return badRequest('Verification token mismatch', 409);
    }

    const nextSite = store.upsertSite({
      ...site,
      verified: true,
      verificationCheckedAt: new Date().toISOString(),
      manifest,
      resources: manifest.resources || site.resources
    });

    return ok({
      ok: true,
      siteId: nextSite.siteId,
      verified: true,
      resourceCount: nextSite.resources.length
    });
  } catch (error) {
    return badRequest(error.message || 'Verification failed', 502);
  }
}

export async function ingestHubEvent(req, body) {
  const auth = authenticatedSite(body, req);
  if (auth.error) return auth.error;

  const event = body.payload?.event || body.event;
  if (!event?.type || !event?.occurredAt) {
    return badRequest('event.type and event.occurredAt are required');
  }

  const site = auth.store.recordEvent(auth.site.siteId, event);
  return ok({
    ok: true,
    siteId: site.siteId,
    lastEventAt: site.lastEventAt,
    stats: site.stats
  }, 202);
}

export async function getHubSummary() {
  const store = createHubStore();
  const sites = store.listSites().map((site) => ({
    siteId: site.siteId,
    name: site.name,
    origin: site.origin,
    domain: site.domain,
    verified: Boolean(site.verified),
    resourceCount: Array.isArray(site.resources) ? site.resources.length : 0,
    lastSyncAt: site.lastSyncAt || '',
    lastEventAt: site.lastEventAt || '',
    stats: site.stats || { views: 0, unlocks: 0, revenue: '0.000000' }
  }));

  return ok({
    storageMode: store.storageMode,
    siteCount: sites.length,
    sites
  });
}

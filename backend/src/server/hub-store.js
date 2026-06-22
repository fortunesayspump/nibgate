import fs from 'node:fs';
import path from 'node:path';
import { rootDir } from 'nibgate/src/core/config.js';

function defaultHubState() {
  return {
    storageMode: 'file-demo',
    sites: []
  };
}

function safeRead(statePath) {
  if (!fs.existsSync(statePath)) return defaultHubState();

  try {
    const raw = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    return {
      storageMode: raw.storageMode || 'file-demo',
      sites: Array.isArray(raw.sites) ? raw.sites : []
    };
  } catch {
    return defaultHubState();
  }
}

function sumRevenue(events = []) {
  return events.reduce((sum, event) => sum + Number(event.value || 0), 0);
}

export function createHubStore(statePath = path.join(rootDir, '.nibgate', 'hub.json')) {
  const absolutePath = path.resolve(statePath);
  let state = safeRead(absolutePath);

  function persist() {
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    fs.writeFileSync(absolutePath, `${JSON.stringify(state, null, 2)}\n`);
  }

  function listSites() {
    return [...state.sites];
  }

  function findSite(siteId) {
    return state.sites.find((site) => site.siteId === siteId) || null;
  }

  function upsertSite(nextSite) {
    const existing = findSite(nextSite.siteId);
    state = {
      ...state,
      sites: existing
        ? state.sites.map((site) => (site.siteId === nextSite.siteId ? nextSite : site))
        : [nextSite, ...state.sites]
    };
    persist();
    return nextSite;
  }

  function recordEvent(siteId, event) {
    const site = findSite(siteId);
    if (!site) return null;

    const nextSite = {
      ...site,
      lastEventAt: event.occurredAt,
      stats: {
        views: (site.stats?.views || 0) + (event.type === 'resource_view' ? 1 : 0),
        unlocks: (site.stats?.unlocks || 0) + (event.type === 'resource_unlock' ? 1 : 0),
        revenue: Number((site.stats?.revenue || 0) + (event.type === 'payment_completed' ? Number(event.value || 0) : 0)).toFixed(6)
      },
      events: [event, ...(site.events || [])].slice(0, 200)
    };

    return upsertSite(nextSite);
  }

  function syncManifest(siteId, manifest) {
    const site = findSite(siteId);
    if (!site) return null;

    const nextSite = {
      ...site,
      name: manifest.site?.name || site.name,
      origin: manifest.site?.origin || site.origin,
      domain: manifest.site?.domain || site.domain,
      verified: site.verified,
      resources: manifest.resources || [],
      manifest,
      lastSyncAt: new Date().toISOString(),
      stats: {
        views: site.stats?.views || 0,
        unlocks: site.stats?.unlocks || 0,
        revenue: site.stats?.revenue || Number(sumRevenue(site.events || [])).toFixed(6)
      }
    };

    return upsertSite(nextSite);
  }

  return {
    path: absolutePath,
    storageMode: state.storageMode,
    listSites,
    findSite,
    upsertSite,
    recordEvent,
    syncManifest
  };
}

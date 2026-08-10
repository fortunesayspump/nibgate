import crypto from 'node:crypto';

function stableJson(value) {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }

  return JSON.stringify(value);
}

function signPayload(payload, secret) {
  return crypto.createHmac('sha256', secret).update(stableJson(payload)).digest('hex');
}

function safeDomain(origin) {
  try {
    return new URL(origin).hostname;
  } catch {
    return origin;
  }
}

export function buildSiteManifest(config) {
  return {
    version: '0.1',
    generatedAt: new Date().toISOString(),
    site: {
      id: config.hub?.siteId || '',
      name: config.site.name,
      domain: safeDomain(config.site.origin),
      origin: config.site.origin,
      creatorWallet: config.site.creatorWallet,
      platformFeeBps: config.site.platformFeeBps
    },
    verification: {
      token: config.hub?.verifyToken || '',
      filePath: '/.well-known/nibgate-verify.txt'
    },
    hub: {
      apiBaseUrl: config.hub?.apiBaseUrl || '',
      eventsUrl: `${config.hub?.apiBaseUrl || ''}/hub/events`,
      syncUrl: `${config.hub?.apiBaseUrl || ''}/hub/sites/sync`
    },
    resources: config.routes.map((route) => ({
      id: route.id,
      path: route.path,
      title: route.title,
      type: route.type,
      price: route.price,
      agentPrice: route.agentPrice || route.price,
      currency: route.currency,
      network: route.network,
      unit: route.unit || 'unlock',
      license: route.license,
      originUrl: route.originUrl || '',
      splits: route.splits || []
    }))
  };
}

export function buildVerificationFile(config) {
  const domain = safeDomain(config.site.origin);
  return [
    'nibgate-site-verification',
    `site_id=${config.hub?.siteId || ''}`,
    `domain=${domain}`,
    `token=${config.hub?.verifyToken || ''}`
  ].join('\n');
}

export function buildHubEvent(config, event) {
  return {
    version: '0.1',
    id: crypto.randomUUID(),
    siteId: config.hub?.siteId || '',
    origin: config.site.origin,
    domain: safeDomain(config.site.origin),
    type: event.type,
    resourceId: event.resourceId || '',
    value: event.value || null,
    currency: event.currency || null,
    actor: event.actor || 'human',
    occurredAt: event.occurredAt || new Date().toISOString(),
    metadata: event.metadata || {}
  };
}

export function createSignedEnvelope(payload, secret) {
  return {
    payload,
    signature: signPayload(payload, secret)
  };
}

export function verifySignedEnvelope(payload, secret, signature) {
  if (!secret || !signature) return false;
  const expected = signPayload(payload, secret);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

async function postJson(url, payload, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...headers
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.error || `Request failed with ${response.status}`);
  }

  return data;
}

export async function connectSiteToHub(config) {
  return postJson(`${config.hub.apiBaseUrl.replace(/\/$/, '')}/hub/sites/connect`, {
    origin: config.site.origin,
    domain: safeDomain(config.site.origin),
    site: {
      name: config.site.name
    }
  });
}

export async function verifySiteWithHub(config) {
  return postJson(`${config.hub.apiBaseUrl.replace(/\/$/, '')}/hub/sites/verify`, {
    siteId: config.hub.siteId
  });
}

export async function syncSiteWithHub(config) {
  const payload = {
    siteId: config.hub.siteId,
    manifest: buildSiteManifest(config)
  };
  const envelope = createSignedEnvelope({ siteId: config.hub.siteId, manifest: payload.manifest }, config.hub.siteToken);

  return postJson(`${config.hub.apiBaseUrl.replace(/\/$/, '')}/hub/sites/sync`, {
    payload: {
      siteId: config.hub.siteId,
      manifest: payload.manifest
    }
  }, {
    'x-nibgate-site-id': config.hub.siteId,
    'x-nibgate-signature': envelope.signature
  });
}

export async function emitEventToHub(config, event) {
  const payload = {
    siteId: config.hub.siteId,
    event: buildHubEvent(config, event)
  };
  const envelope = createSignedEnvelope(payload, config.hub.siteToken);

  return postJson(`${config.hub.apiBaseUrl.replace(/\/$/, '')}/hub/events`, {
    payload
  }, {
    'x-nibgate-site-id': config.hub.siteId,
    'x-nibgate-signature': envelope.signature
  });
}

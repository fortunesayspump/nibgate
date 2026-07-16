import { normalizeServerResource as normalizeResource } from '../core/resource.js';
import { serverEnv } from './env.js';

export async function emitHubEvent(event, resourceInput, options = {}) {
  const resource = normalizeResource(resourceInput);
  const siteId = options.siteId || serverEnv('NIBGATE_SITE_ID') || '';
  const token = options.token || serverEnv('NIBGATE_SITE_TOKEN') || '';
  const apiBaseUrl = (options.apiBaseUrl || serverEnv('NIBGATE_API_BASE') || 'http://localhost:3000').replace(/\/$/, '');
  const origin = options.origin || serverEnv('NIBGATE_SITE_ORIGIN') || '';

  if (!siteId || !token) {
    return { skipped: true, reason: 'Missing NIBGATE_SITE_ID or NIBGATE_SITE_TOKEN' };
  }

  const response = await fetch(`${apiBaseUrl}/api/hub/evt`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(origin ? { origin } : {}),
      ...(options.headers || {})
    },
    body: JSON.stringify({
      siteId,
      token,
      event,
      resource,
      url: resource.url,
      path: resource.path,
      visitorId: options.visitorId || 'nibgate-visitor',
      sessionId: options.sessionId || 'nibgate-session',
      ...(options.payload || {})
    })
  });

  return { ok: response.ok, status: response.status, body: await response.text() };
}

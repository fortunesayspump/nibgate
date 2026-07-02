import { normalizeAccessPolicy, normalizeServerResource as normalizeResource } from '../core/resource.js';

export function actorFromRequest(request, fallback = 'human') {
  const explicit = request?.headers?.get?.('x-nibgate-actor') || request?.headers?.get?.('x-actor');
  if (explicit && String(explicit).toLowerCase() === 'agent') return 'agent';
  if (explicit && String(explicit).toLowerCase() === 'human') return 'human';

  const accept = request?.headers?.get?.('accept') || '';
  if (accept.includes('application/json') && request?.headers?.get?.('x402') === 'true') return 'agent';

  const userAgent = (request?.headers?.get?.('user-agent') || '').toLowerCase();
  if (/(bot|crawler|spider|agent|llm|gpt|claude|perplexity|anthropic|openai|mistral|gemini|firecrawl)/i.test(userAgent)) {
    return 'agent';
  }

  return fallback;
}

export function accessModeFor(resourceInput, actor = 'human') {
  const resource = normalizeResource(resourceInput);
  const access = normalizeAccessPolicy(resource.access);
  return actor === 'agent' ? access.agents : access.humans;
}

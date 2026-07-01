import crypto from 'node:crypto';

const DEFAULT_UNLOCK_SECONDS = 60 * 60 * 12;
const ACCESS_MODES = ['free', 'paid', 'blocked'];

function normalizeAccessMode(value, fallback = 'paid') {
  const mode = String(value || '').trim().toLowerCase();
  return ACCESS_MODES.includes(mode) ? mode : fallback;
}

function normalizeAccessPolicy(value = {}) {
  if (typeof value === 'string') {
    const mode = normalizeAccessMode(value);
    return { humans: mode, agents: mode };
  }

  return {
    humans: normalizeAccessMode(value.humans || value.human || value.default, 'paid'),
    agents: normalizeAccessMode(value.agents || value.agent || value.default, 'paid')
  };
}

function normalizeResource(resource = {}) {
  const input = typeof resource === 'string' ? { id: resource } : (resource || {});
  return {
    ...input,
    id: String(input.id || input.contentId || input.slug || '').trim(),
    title: String(input.title || input.name || input.id || 'Untitled content').trim(),
    type: String(input.type || input.contentType || 'article').trim().toLowerCase(),
    price: input.price ?? input.amount ?? '0',
    path: input.path || input.route || '/',
    currency: input.currency || 'USDC',
    access: normalizeAccessPolicy(input.access)
  };
}

function actorFromRequest(request, fallback = 'human') {
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

function accessModeFor(resourceInput, actor = 'human') {
  const resource = normalizeResource(resourceInput);
  const access = normalizeAccessPolicy(resource.access);
  return actor === 'agent' ? access.agents : access.humans;
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => stableJson(entry)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function fromBase64url(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

function getCookie(request, name) {
  const cookie = request?.headers?.get?.('cookie') || '';
  const parts = cookie.split(';').map((part) => part.trim());
  const match = parts.find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

function unlockCookieName(resource) {
  return `nibgate_unlock_${resource.id}`;
}

function jsonResponse(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(init.headers || {})
    }
  });
}

export function createUnlockToken(resourceInput, options = {}) {
  const resource = normalizeResource(resourceInput);
  const secret = options.secret || process.env.NIBGATE_SECRET || process.env.NIBGATE_UNLOCK_SECRET || 'nibgate-dev-secret';
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    contentId: resource.id,
    paymentId: options.paymentId || '',
    actor: options.actor || 'human',
    iat: now,
    exp: now + (options.expiresInSeconds || DEFAULT_UNLOCK_SECONDS)
  };
  const encoded = base64url(stableJson(payload));
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyUnlockToken(token, resourceInput, options = {}) {
  if (!token || !token.includes('.')) return null;
  const resource = normalizeResource(resourceInput);
  const secret = options.secret || process.env.NIBGATE_SECRET || process.env.NIBGATE_UNLOCK_SECRET || 'nibgate-dev-secret';
  const [encoded, signature] = token.split('.');
  const expected = sign(encoded, secret);
  const signatureBuffer = Buffer.from(signature || '');
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length) return null;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(fromBase64url(encoded));
    if (payload.contentId !== resource.id) return null;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (_error) {
    return null;
  }
}

export function createPaymentChallenge(resourceInput, options = {}) {
  const resource = normalizeResource(resourceInput);
  const origin = options.origin || process.env.NIBGATE_SITE_ORIGIN || '';
  const actor = options.actor || 'human';
  return {
    x402Version: options.x402Version || 2,
    status: 402,
    scheme: 'exact',
    paymentMode: options.paymentMode || process.env.NIBGATE_PAYMENT_MODE || 'demo',
    accepts: [
      {
        asset: resource.currency,
        network: options.network || process.env.NIBGATE_PAYMENT_NETWORK || 'eip155:5042002',
        amount: String(resource.price),
        recipient: options.recipient || process.env.NIBGATE_SELLER_ADDRESS || '',
        description: `Unlock ${resource.title}`,
        resource: resource.url || `${origin}${resource.path}`,
        mimeType: resource.type === 'article' ? 'text/html' : 'application/octet-stream',
        payTo: options.recipient || process.env.NIBGATE_SELLER_ADDRESS || '',
        maxTimeoutSeconds: options.maxTimeoutSeconds || 120
      }
    ],
    nibgate: {
      contentId: resource.id,
      title: resource.title,
      contentType: resource.type,
      price: String(resource.price),
      currency: resource.currency,
      path: resource.path,
      actor,
      access: resource.access
    }
  };
}

export function createNibgateServer(options = {}) {
  const secret = options.secret || process.env.NIBGATE_SECRET || process.env.NIBGATE_UNLOCK_SECRET || 'nibgate-dev-secret';
  const verifyPayment = options.verifyPayment || null;

  async function unlock(resourceInput, payment = {}) {
    const resource = normalizeResource(resourceInput);
    if (verifyPayment) {
      const verified = await verifyPayment({ resource, payment });
      if (!verified) {
        return { ok: false, status: 402, error: 'Payment verification failed', challenge: createPaymentChallenge(resource, options) };
      }
    }

    const unlockToken = createUnlockToken(resource, {
      secret,
      paymentId: payment.paymentId || payment.id || '',
      actor: payment.actor || 'human',
      expiresInSeconds: payment.expiresInSeconds || options.expiresInSeconds
    });

    return {
      ok: true,
      unlockToken,
      cookieName: unlockCookieName(resource),
      expiresInSeconds: payment.expiresInSeconds || options.expiresInSeconds || DEFAULT_UNLOCK_SECONDS,
      resource,
      payment
    };
  }

  function isUnlocked(request, resourceInput, checkOptions = {}) {
    const resource = normalizeResource(resourceInput);
    const token = request?.headers?.get?.('x-nibgate-unlock') || getCookie(request, unlockCookieName(resource));
    const payload = verifyUnlockToken(token, resource, { secret });
    if (!payload) return false;
    if (checkOptions.actor && payload.actor && payload.actor !== checkOptions.actor) return false;
    return true;
  }

  function accessFor(request, resourceInput, accessOptions = {}) {
    const resource = normalizeResource(resourceInput);
    const actor = accessOptions.actor || actorFromRequest(request, accessOptions.defaultActor || 'human');
    const mode = accessModeFor(resource, actor);
    const unlocked = isUnlocked(request, resource, { actor });
    return {
      actor,
      mode,
      unlocked,
      allowed: mode === 'free' || unlocked,
      blocked: mode === 'blocked',
      paid: mode === 'paid',
      resource
    };
  }

  function protect(resourceInput, handler, routeOptions = {}) {
    const resource = normalizeResource(resourceInput);
    return async function protectedHandler(request, context) {
      const access = accessFor(request, resource, routeOptions);
      if (access.allowed) {
        return handler(request, context);
      }

      if (access.blocked) {
        return jsonResponse({
          status: 403,
          error: `${access.actor} access is blocked for this resource`,
          nibgate: {
            contentId: resource.id,
            actor: access.actor,
            access: resource.access
          }
        }, { status: 403 });
      }

      const challenge = createPaymentChallenge(resource, { ...options, ...routeOptions, actor: access.actor });
      return jsonResponse(challenge, { status: 402 });
    };
  }

  return {
    unlock,
    isUnlocked,
    accessFor,
    protect,
    createPaymentChallenge: (resource, challengeOptions = {}) => createPaymentChallenge(resource, { ...options, ...challengeOptions }),
    createUnlockToken: (resource, tokenOptions = {}) => createUnlockToken(resource, { ...tokenOptions, secret }),
    verifyUnlockToken: (token, resource) => verifyUnlockToken(token, resource, { secret }),
    actorFromRequest,
    accessModeFor
  };
}

export function protect(resource, handler, options = {}) {
  return createNibgateServer(options).protect(resource, handler);
}

export const server = createNibgateServer();
export { actorFromRequest, accessModeFor, normalizeAccessPolicy };

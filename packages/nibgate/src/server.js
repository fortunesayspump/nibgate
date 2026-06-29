import crypto from 'node:crypto';

const DEFAULT_UNLOCK_SECONDS = 60 * 60 * 12;

function normalizeResource(resource = {}) {
  const input = typeof resource === 'string' ? { id: resource } : (resource || {});
  return {
    ...input,
    id: String(input.id || input.contentId || input.slug || '').trim(),
    title: String(input.title || input.name || input.id || 'Untitled content').trim(),
    type: String(input.type || input.contentType || 'article').trim().toLowerCase(),
    price: input.price ?? input.amount ?? '0',
    path: input.path || input.route || '/',
    currency: input.currency || 'USDC'
  };
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
      path: resource.path
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

  function isUnlocked(request, resourceInput) {
    const resource = normalizeResource(resourceInput);
    const token = request?.headers?.get?.('x-nibgate-unlock') || getCookie(request, unlockCookieName(resource));
    return Boolean(verifyUnlockToken(token, resource, { secret }));
  }

  function protect(resourceInput, handler, routeOptions = {}) {
    const resource = normalizeResource(resourceInput);
    return async function protectedHandler(request, context) {
      if (isUnlocked(request, resource)) {
        return handler(request, context);
      }

      const challenge = createPaymentChallenge(resource, { ...options, ...routeOptions });
      return jsonResponse(challenge, { status: 402 });
    };
  }

  return {
    unlock,
    isUnlocked,
    protect,
    createPaymentChallenge: (resource, challengeOptions = {}) => createPaymentChallenge(resource, { ...options, ...challengeOptions }),
    createUnlockToken: (resource, tokenOptions = {}) => createUnlockToken(resource, { ...tokenOptions, secret }),
    verifyUnlockToken: (token, resource) => verifyUnlockToken(token, resource, { secret })
  };
}

export function protect(resource, handler, options = {}) {
  return createNibgateServer(options).protect(resource, handler);
}

export const server = createNibgateServer();

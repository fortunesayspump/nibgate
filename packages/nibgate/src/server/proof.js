import crypto from 'node:crypto';
import { normalizeServerResource as normalizeResource } from '../core/resource.js';
import { serverEnv } from './env.js';

export const DEFAULT_UNLOCK_SECONDS = 60 * 60 * 12;

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

export function createUnlockToken(resourceInput, options = {}) {
  const resource = normalizeResource(resourceInput);
  const secret = options.secret || serverEnv('NIBGATE_SECRET') || serverEnv('NIBGATE_UNLOCK_SECRET') || 'nibgate-dev-secret';
  const now = Math.floor(Date.now() / 1000);
  const payment = options.payment || {};
  const payload = {
    contentId: resource.id,
    paymentId: options.paymentId || '',
    payment: {
      paymentId: payment.paymentId || options.paymentId || '',
      txHash: payment.txHash || '',
      memo: payment.memo || '',
      payer: payment.payer || '',
      recipient: payment.recipient || resource.recipient || resource.payTo || '',
      amount: Number(payment.amount || resource.price || 0),
      currency: payment.currency || resource.currency || 'USDC',
      network: payment.network || '',
      verified: Boolean(payment.verified)
    },
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
  const secret = options.secret || serverEnv('NIBGATE_SECRET') || serverEnv('NIBGATE_UNLOCK_SECRET') || 'nibgate-dev-secret';
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

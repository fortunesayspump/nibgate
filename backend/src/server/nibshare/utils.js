import crypto from 'node:crypto';
import { db } from '@nibgate/internal/db.js';
import { decryptBytes, unpackCipherBlob } from '@nibgate/sdk/server';
import { getBlob, unwrapKey } from '@nibgate/sdk/server';

// Nibshare is a PRIVATE sharing product. Content expires within 7 days, is revocable,
// and lives on Nibgate's R2 (no creator-verified domain behind it).
// Do NOT emit its events to /hub/evt, register content in hub discovery/ledger,
// or feed it into on-chain reputation. The activity bell reads only this DB.

export const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const SHARE_BASE = process.env.NIBGATE_SHARE_BASE_URL || 'https://nibgate.xyz/ns';
export const MAX_EXPIRY_HOURS = 24 * 7;
export const FREE_TIER_MAX_BYTES = 512 * 1024;

export function slugFromBytes(buf) {
  let n = BigInt('0x' + buf.toString('hex'));
  let out = '';
  const base = BigInt(58);
  while (n > 0n) {
    out = BASE58[Number(n % base)] + out;
    n = n / base;
  }
  return (out.padStart(8, BASE58[0])).slice(0, 8);
}

export async function uniqueSlug() {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const slug = slugFromBytes(crypto.randomBytes(8));
    const existing = await db.nibShare.findUnique({ where: { slug } });
    if (!existing) return slug;
  }
  throw new Error('Could not generate a unique slug');
}

export function primaryWallet(user) {
  return user?.wallets?.[0]?.address || user?.walletAddress || '';
}

export function parsePrice(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function proofSecret() {
  const secret = process.env.NIBGATE_GATEWAY_SECRET || process.env.NIBGATE_PROOF_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NIBGATE_GATEWAY_SECRET or NIBGATE_PROOF_SECRET is required in production');
  }
  return 'nibshare-local-proof-secret';
}

export function shareKeySecret() {
  const secret = process.env.NIBGATE_SHARE_KEY_SECRET || process.env.NIB_SHARE_KEY_SECRET;
  if (secret) return crypto.createHash('sha256').update(secret).digest();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NIBGATE_SHARE_KEY_SECRET is required in production');
  }
  return crypto.createHash('sha256').update('nibshare-local-key-wrapping-secret').digest();
}

// Accepts either a KEK-wrapped key (new) or a legacy raw 32-byte key (44-char
// base64) so pre-envelope rows keep decrypting until they are re-encrypted.
export function storedContentKey(stored) {
  if (!stored) return null;
  const buf = Buffer.from(String(stored), 'base64');
  if (buf.length === 32) return buf;
  return unwrapKey(shareKeySecret(), String(stored));
}

// Mint-time claim proof. Format: `wallet.iat.exp.mac` — the HMAC binds
// (shareId, wallet, iat, exp) so tampering with either claim breaks it, and the
// 12h exp mirrors the SDK's DEFAULT_UNLOCK_SECONDS. Legacy `wallet.mac` proofs
// (no claims, never expire) still verify for back-compat. Expiry is HARMLESS:
// entitlements (rule 6/7) decide access before any proof check, so an expired
// proof is simply re-minted on the next legit visit.
export function paymentProofFor(share, wallet) {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + 12 * 3600;
  const mac = crypto.createHmac('sha256', proofSecret()).update(`nibshare:${share.id}:${wallet}:${now}:${exp}`).digest('base64url');
  return `${wallet}.${now}.${exp}.${mac}`;
}

export function walletFromPaymentProof(share, proof) {
  if (typeof proof !== 'string') return null;
  const parts = proof.split('.');
  if (parts.length !== 2 && parts.length !== 4) return null;
  const wallet = parts[0];
  if (!/^0x[0-9a-fA-F]{40}$/.test(wallet)) return null;

  if (parts.length === 2) {
    const [mac = ''] = parts;
    const expected = crypto.createHmac('sha256', proofSecret()).update(`nibshare:${share.id}:${wallet}`).digest('base64url');
    return mac === expected ? wallet.toLowerCase() : null;
  }

  const [, iatRaw, expRaw, mac] = parts;
  const iat = Number(iatRaw);
  const exp = Number(expRaw);
  if (!Number.isFinite(iat) || !Number.isFinite(exp)) return null;
  const expected = crypto.createHmac('sha256', proofSecret()).update(`nibshare:${share.id}:${wallet}:${iat}:${exp}`).digest('base64url');
  if (mac !== expected) return null;
  if (exp < Math.floor(Date.now() / 1000)) return null;
  return wallet.toLowerCase();
}

export async function decryptShareBody(share) {
  const key = storedContentKey(share.encryptedKey);
  if (!key) return null;
  const blob = await getBlob({ storageRef: share.storageRef });
  const { iv, tag, ciphertext } = unpackCipherBlob(blob);
  const bodyBuf = decryptBytes(key, iv, tag, ciphertext);
  const text = bodyBuf.toString('utf8');
  try { return JSON.parse(text); } catch { return text; }
}

export async function decryptMediaBlob({ storageRef, encryptedKey }) {
  const key = storedContentKey(encryptedKey);
  if (!key) return null;
  const blob = await getBlob({ storageRef });
  const { iv, tag, ciphertext } = unpackCipherBlob(blob);
  return decryptBytes(key, iv, tag, ciphertext);
}

export function mediaItemFor(body, kind, index) {
  if (!body || typeof body !== 'object') return null;
  if (kind === 'photo') {
    const item = Array.isArray(body.media) ? body.media[Number(index) || 0] : null;
    return item && item.storageRef && item.encryptedKey ? item : null;
  }
  const holder = kind === 'music' ? body.audio : kind === 'video' ? body.file : kind === 'document' ? body.document : null;
  if (!holder) return null;
  return holder.storageRef && holder.encryptedKey ? holder : null;
}

export function expirySecondsFor(share) {
  if (share.expiresAt) return Math.max(0, Math.floor((new Date(share.expiresAt).getTime() - Date.now()) / 1000));
  return 7 * 24 * 3600;
}

export function sharePublicUrl(share) {
  return `${SHARE_BASE}/${share.slug}`;
}

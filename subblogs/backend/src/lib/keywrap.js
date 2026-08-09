const crypto = require('crypto');
const { wrapKey, unwrapKey } = require('@nibgate/sdk/server');

// Envelope encryption for subblogs (mirrors nibshare):
// content is encrypted with a per-content DEK (generateContentKey); the DEK is
// wrapped with a backend-only KEK (NIBGATE_SHARE_KEY_SECRET) before it is stored,
// so a DB dump alone cannot decrypt R2 ciphertext. KEK never touches content.

function kekSecret() {
  const secret = process.env.NIBGATE_SHARE_KEY_SECRET;
  if (secret) return crypto.createHash('sha256').update(secret).digest();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('NIBGATE_SHARE_KEY_SECRET is required in production');
  }
  return crypto.createHash('sha256').update('nibshare-local-key-wrapping-secret').digest();
}

function wrapContentKey(rawKeyBase64) {
  return wrapKey(kekSecret(), Buffer.from(rawKeyBase64, 'base64'));
}

// Accepts either a KEK-wrapped key (new) or a legacy raw 32-byte key (44-char
// base64) so pre-envelope rows keep decrypting until they are re-encrypted.
function storedToKey(stored) {
  if (!stored) return null;
  const buf = Buffer.from(String(stored), 'base64');
  if (buf.length === 32) return buf;
  return unwrapKey(kekSecret(), String(stored));
}

module.exports = { wrapContentKey, storedToKey };

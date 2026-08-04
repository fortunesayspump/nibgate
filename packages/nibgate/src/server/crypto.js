import crypto from 'node:crypto';
import { keccak256 } from 'viem';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

export function generateContentKey() {
  return crypto.randomBytes(32);
}

export function encryptBytes(key, plaintext) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { iv, tag, ciphertext };
}

export function decryptBytes(key, iv, tag, ciphertext) {
  const decipher = crypto.createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function packCipherBlob(enc) {
  return Buffer.concat([enc.iv, enc.tag, enc.ciphertext]);
}

export function unpackCipherBlob(blob) {
  if (!Buffer.isBuffer(blob) || blob.length < IV_LEN + TAG_LEN) {
    throw new Error('cipher blob is too short');
  }
  return {
    iv: blob.subarray(0, IV_LEN),
    tag: blob.subarray(IV_LEN, IV_LEN + TAG_LEN),
    ciphertext: blob.subarray(IV_LEN + TAG_LEN)
  };
}

export function wrapKey(secret, key) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, secret, iv);
  const wrapped = Buffer.concat([cipher.update(key), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, wrapped]).toString('base64');
}

export function unwrapKey(secret, wrappedB64) {
  const buf = Buffer.from(String(wrappedB64 || ''), 'base64');
  if (buf.length < IV_LEN + TAG_LEN) throw new Error('wrapped key is invalid');
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const wrapped = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, secret, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(wrapped), decipher.final()]);
}

export function contentHashFor(ownerWallet, storageRef, plaintext) {
  const payload = Buffer.from(`nibshare:v1|${ownerWallet}|${storageRef}|${plaintext}`, 'utf8');
  return keccak256(Uint8Array.from(payload));
}

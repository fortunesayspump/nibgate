import { createHash } from 'node:crypto';
// JSONB reorders object keys. The digest must survive database serialization.
export function canonicalCiphertext(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value);
    if (Array.isArray(value))
        return '[' + value.map(canonicalCiphertext).join(',') + ']';
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalCiphertext(value[k])).join(',') + '}';
}
export const ciphertextDigest = value => createHash('sha256').update(canonicalCiphertext(value)).digest('hex');

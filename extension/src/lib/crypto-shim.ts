// Browser shim for Node's `crypto`, aliased in build.mjs. @circle-fin/x402-batching
// imports `randomBytes` at module scope; browsers get it from WebCrypto.
export function randomBytes(size: number): { toString(encoding?: string): string; length: number } {
  const bytes = new Uint8Array(size);
  globalThis.crypto.getRandomValues(bytes);
  return {
    length: size,
    toString(encoding?: string) {
      if (encoding === 'hex') {
        let out = '';
        for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0');
        return out;
      }
      return String(bytes);
    },
  };
}

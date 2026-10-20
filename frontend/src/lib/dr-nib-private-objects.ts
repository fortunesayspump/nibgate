// Portable WebCrypto object envelopes. Plaintext exists only in the client or
// approved worker. No storage/network imports; the worker uses this wire format.
export type PrivateObjectPurpose = 'manifest' | 'source' | 'intent' | 'discussion' | 'export' | 'report' | 'event' | 'action-progress' | 'checkpoint';
export type PrivateObjectContext = {
    tenantId: string;
    vaultId: string;
    runId: string;
    objectId: string;
    revision: number;
    purpose: PrivateObjectPurpose;
};
export type PrivateObjectEnvelope = {
    version: 1;
    algorithm: 'AES-256-GCM';
    context: PrivateObjectContext;
    iv: string;
    ciphertext: string;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PURPOSES = new Set(['manifest', 'source', 'intent', 'discussion', 'export', 'report', 'event', 'action-progress', 'checkpoint']);
const encoder = new TextEncoder();
export function objectBytesToBase64(bytes: Uint8Array): string { let out = ''; for (let i = 0; i < bytes.length; i += 8192)
    out += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(out); }
export function objectBase64ToBytes(value: string, max = 4 * 1024 * 1024): Uint8Array {
    if (typeof value !== 'string' || value.length > Math.ceil(max * 4 / 3) + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value))
        throw Error('PRIVATE_OBJECT_UNAVAILABLE');
    const bytes = Uint8Array.from(atob(value), c => c.charCodeAt(0));
    if (bytes.length > max || objectBytesToBase64(bytes) !== value)
        throw Error('PRIVATE_OBJECT_UNAVAILABLE');
    return bytes;
}
export function privateObjectAad(c: PrivateObjectContext): Uint8Array {
    if (!c || Object.keys(c).sort().join(',') !== 'objectId,purpose,revision,runId,tenantId,vaultId' || !/^[A-Za-z0-9:_-]{1,128}$/.test(c.tenantId) ||
        ![c.vaultId, c.runId, c.objectId].every(v => UUID.test(v)) || !Number.isSafeInteger(c.revision) || c.revision < 1 || c.revision > 1000001 || !PURPOSES.has(c.purpose))
        throw Error('PRIVATE_OBJECT_UNAVAILABLE');
    return encoder.encode('drnib-client-object-v1\0' + JSON.stringify({ tenantId: c.tenantId, vaultId: c.vaultId, runId: c.runId, objectId: c.objectId, revision: c.revision, purpose: c.purpose }));
}
async function keyFor(stateKey: Uint8Array, c: PrivateObjectContext) {
    if (!(stateKey instanceof Uint8Array) || stateKey.length !== 32)
        throw Error('PRIVATE_OBJECT_UNAVAILABLE');
    const root = await crypto.subtle.importKey('raw', stateKey as BufferSource, 'HKDF', false, ['deriveKey']);
    return crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: encoder.encode(`drnib-client-object-v1\0${c.tenantId}\0${c.vaultId}\0${c.runId}`), info: encoder.encode(c.purpose) }, root, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function sealPrivateObject(stateKey: Uint8Array, context: PrivateObjectContext, plain: Uint8Array): Promise<PrivateObjectEnvelope> {
    try {
        const aad = privateObjectAad(context);
        if (!(plain instanceof Uint8Array) || plain.length < 1 || plain.length > 3 * 1024 * 1024 - 16)
            throw Error();
        const iv = crypto.getRandomValues(new Uint8Array(12)), key = await keyFor(stateKey, context);
        const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource, tagLength: 128 }, key, plain as BufferSource);
        return { version: 1, algorithm: 'AES-256-GCM', context: { ...context }, iv: objectBytesToBase64(iv), ciphertext: objectBytesToBase64(new Uint8Array(ciphertext)) };
    }
    catch {
        throw Error('PRIVATE_OBJECT_UNAVAILABLE');
    }
}
export async function openPrivateObject(stateKey: Uint8Array, expected: PrivateObjectContext, envelope: PrivateObjectEnvelope): Promise<Uint8Array> {
    try {
        const aad = privateObjectAad(expected);
        if (!envelope || Object.keys(envelope).sort().join(',') !== 'algorithm,ciphertext,context,iv,version' || envelope.version !== 1 || envelope.algorithm !== 'AES-256-GCM' ||
            !envelope.context || !Object.entries(expected).every(([k, v]) => envelope.context[k as keyof PrivateObjectContext] === v))
            throw Error();
        privateObjectAad(envelope.context);
        const iv = objectBase64ToBytes(envelope.iv, 12), cipher = objectBase64ToBytes(envelope.ciphertext, 3 * 1024 * 1024);
        if (iv.length !== 12 || cipher.length < 17)
            throw Error();
        return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv as BufferSource, additionalData: aad as BufferSource, tagLength: 128 }, await keyFor(stateKey, expected), cipher as BufferSource));
    }
    catch {
        throw Error('PRIVATE_OBJECT_UNAVAILABLE');
    }
}

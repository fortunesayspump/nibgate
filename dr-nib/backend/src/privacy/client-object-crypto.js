import { createCipheriv, createDecipheriv, randomBytes, hkdfSync } from 'node:crypto';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PURPOSES = new Set(['manifest', 'source', 'intent', 'discussion', 'export', 'report', 'event', 'action-progress','checkpoint']);
function denied() { return Error('PRIVATE_OBJECT_UNAVAILABLE'); }
function aad(c) {
    if (!c || Object.keys(c).sort().join(',') !== 'objectId,purpose,revision,runId,tenantId,vaultId' || !/^[A-Za-z0-9:_-]{1,128}$/.test(c.tenantId) ||
        ![c.vaultId, c.runId, c.objectId].every(v => UUID.test(v)) || !Number.isSafeInteger(c.revision) || c.revision < 1 || c.revision > 1000001 || !PURPOSES.has(c.purpose))
        throw denied();
    return Buffer.from('drnib-client-object-v1\0' + JSON.stringify({ tenantId: c.tenantId, vaultId: c.vaultId, runId: c.runId, objectId: c.objectId, revision: c.revision, purpose: c.purpose }));
}
function keyFor(key, c) { if (!(key instanceof Uint8Array) || key.length !== 32)
    throw denied(); return Buffer.from(hkdfSync('sha256', key, Buffer.from(`drnib-client-object-v1\0${c.tenantId}\0${c.vaultId}\0${c.runId}`), Buffer.from(c.purpose), 32)); }
function decode(v, max) { if (typeof v !== 'string' || v.length > Math.ceil(max * 4 / 3) + 4 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(v))
    throw denied(); const b = Buffer.from(v, 'base64'); if (b.length > max || b.toString('base64') !== v)
    throw denied(); return b; }
export function openClientObject(key, expected, envelope) {
    let derived;
    try {
        const data = aad(expected);
        if (!envelope || Object.keys(envelope).sort().join(',') !== 'algorithm,ciphertext,context,iv,version' || envelope.version !== 1 || envelope.algorithm !== 'AES-256-GCM' ||
            !envelope.context || !Object.entries(expected).every(([k, v]) => envelope.context[k] === v))
            throw denied();
        aad(envelope.context);
        const iv = decode(envelope.iv, 12), wire = decode(envelope.ciphertext, 3 * 1024 * 1024);
        if (iv.length !== 12 || wire.length < 17)
            throw denied();
        derived = keyFor(key, expected);
        const decipher = createDecipheriv('aes-256-gcm', derived, iv);
        decipher.setAAD(data);
        decipher.setAuthTag(wire.subarray(-16));
        return Buffer.concat([decipher.update(wire.subarray(0, -16)), decipher.final()]);
    }
    catch {
        throw denied();
    }
    finally {
        derived?.fill(0);
    }
}
export function sealClientObject(key, context, plaintext) {
    let derived;
    try {
        const data = aad(context);
        if (!(plaintext instanceof Uint8Array) || plaintext.length < 1 || plaintext.length > 3 * 1024 * 1024 - 16)
            throw denied();
        derived = keyFor(key, context);
        const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', derived, iv);
        cipher.setAAD(data);
        const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final(), cipher.getAuthTag()]);
        return { version: 1, algorithm: 'AES-256-GCM', context: { ...context }, iv: iv.toString('base64'), ciphertext: ciphertext.toString('base64') };
    }
    catch {
        throw denied();
    }
    finally {
        derived?.fill(0);
    }
}

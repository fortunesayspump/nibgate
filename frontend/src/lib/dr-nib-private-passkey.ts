import type { PrivatePasskeyRecord } from './dr-nib-private-vault';

type PrfExtensions = AuthenticationExtensionsClientInputs & {
    prf: { eval: { first: Uint8Array } };
};
type PrfResults = AuthenticationExtensionsClientOutputs & {
    prf?: { enabled?: boolean; results?: { first?: ArrayBuffer } };
};
const enc = new TextEncoder();
const unavailable = () => new Error('This passkey does not support private-project recovery. Your password and backup code still work.');
const bytes = (value: ArrayBuffer) => new Uint8Array(value.slice(0));
const base64 = (value: Uint8Array) => btoa(String.fromCharCode(...value));
function decodeId(value: string): Uint8Array {
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw unavailable();
    const result = Uint8Array.from(atob(value), c => c.charCodeAt(0));
    if (result.length < 16 || result.length > 2048 || base64(result) !== value) throw unavailable();
    return result;
}
function input(tenantId: string, vaultId: string, salt: Uint8Array): Uint8Array {
    return enc.encode(`drnib-private-passkey-v1\0${tenantId}\0${vaultId}\0${base64(salt)}`);
}
function result(credential: PublicKeyCredential): Uint8Array {
    const output = (credential.getClientExtensionResults() as PrfResults).prf?.results?.first;
    if (!(output instanceof ArrayBuffer) || output.byteLength !== 32) throw unavailable();
    return bytes(output);
}
export function privatePasskeySupported(): boolean {
    return typeof window !== 'undefined' && window.isSecureContext &&
        typeof PublicKeyCredential !== 'undefined' && !!navigator.credentials?.create && !!navigator.credentials?.get;
}
/** A recoverable passkey needs WebAuthn PRF. Creating an ordinary passkey alone
 * would authenticate the owner but could not decrypt the vault. */
export async function createPrivatePasskey(tenantId: string, vaultId: string): Promise<{
    credentialId: Uint8Array; salt: Uint8Array; output: Uint8Array;
}> {
    if (!privatePasskeySupported()) throw unavailable();
    const salt = crypto.getRandomValues(new Uint8Array(32));
    const first = input(tenantId, vaultId, salt);
    const created = await navigator.credentials.create({ publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Nibgate private projects', id: location.hostname },
        user: { id: crypto.getRandomValues(new Uint8Array(32)), name: 'Private project recovery', displayName: 'Private project recovery' },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'required' },
        attestation: 'none', timeout: 60_000,
        extensions: { prf: { eval: { first } } } as PrfExtensions,
    } }) as PublicKeyCredential | null;
    if (!created) throw unavailable();
    const credentialId = bytes(created.rawId);
    if (credentialId.length < 16 || credentialId.length > 2048) throw unavailable();
    // Require a fresh assertion even if registration returned a PRF output.
    // This proves the credential can reproduce the recovery key later.
    const output = await readPrivatePasskey({ credentialId: base64(credentialId), salt: base64(salt),
        envelope: { iv: '', ciphertext: '' } }, tenantId, vaultId);
    return { credentialId, salt, output };
}
export async function readPrivatePasskey(record: PrivatePasskeyRecord, tenantId: string,
    vaultId: string): Promise<Uint8Array> {
    if (!privatePasskeySupported()) throw unavailable();
    const credentialId = decodeId(record.credentialId);
    const salt = Uint8Array.from(atob(record.salt), c => c.charCodeAt(0));
    if (salt.length !== 32 || base64(salt) !== record.salt) throw unavailable();
    const assertion = await navigator.credentials.get({ publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [{ type: 'public-key', id: credentialId as BufferSource }],
        userVerification: 'required', timeout: 60_000,
        extensions: { prf: { eval: { first: input(tenantId, vaultId, salt) } } } as PrfExtensions,
    } }) as PublicKeyCredential | null;
    if (!assertion || base64(bytes(assertion.rawId)) !== record.credentialId) throw unavailable();
    return result(assertion);
}

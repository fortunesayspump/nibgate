import type { PrivateVault, PrivateVaultEnvelope, PrivateRecoveryEnvelope } from './dr-nib-private-vault';
export type EnrolledVault = {
    tenantId: string;
    vaultId: string;
    vault: PrivateVault;
    recoveryEnvelope: PrivateRecoveryEnvelope;
    revision: number;
    recoveryConfirmed: boolean;
    pendingReplacement?: EnrolledVault & { replacementProjects: Array<{ runId: string; expectedDigest: string; envelope: PrivateVaultEnvelope }> };
};
export type EnrolledProject = {
    tenantId: string;
    runId: string;
    vaultId: string;
    envelope: PrivateVaultEnvelope;
};
const NAME = 'drnib-private-vault-v1';
async function database(): Promise<IDBDatabase> {
    if (typeof indexedDB === 'undefined')
        throw Error('PRIVATE_LOCAL_STORAGE_UNAVAILABLE');
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(NAME, 1);
        request.onupgradeneeded = () => { const db = request.result; db.createObjectStore('vaults', { keyPath: 'tenantId' }); db.createObjectStore('projects', { keyPath: ['tenantId', 'runId'] }); };
        request.onsuccess = () => { request.result.onversionchange = () => request.result.close(); resolve(request.result); };
        request.onerror = () => reject(Error('PRIVATE_LOCAL_STORAGE_UNAVAILABLE'));
        request.onblocked = () => reject(Error('PRIVATE_LOCAL_STORAGE_BLOCKED'));
    });
}
async function transaction<T>(name: 'vaults' | 'projects', mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
    const db = await database();
    try {
        return await new Promise<T>((resolve, reject) => {
            const tx = db.transaction(name, mode), request = work(tx.objectStore(name));
            let value: T;
            request.onsuccess = () => { value = request.result; };
            // Request success is not a durable commit. Never resolve before tx completes.
            tx.oncomplete = () => resolve(value);
            tx.onerror = tx.onabort = () => reject(Error('PRIVATE_LOCAL_STORAGE_UNAVAILABLE'));
        });
    }
    finally {
        db.close();
    }
}
export function getEnrolledVault(tenantId: string): Promise<EnrolledVault | undefined> { return transaction('vaults', 'readonly', s => s.get(tenantId)); }
export async function addEnrolledVault(entry: EnrolledVault): Promise<void> {
    if (!entry.recoveryConfirmed || entry.vault.tenantId !== entry.tenantId || entry.vault.vaultId !== entry.vaultId || entry.vault.key.extractable)
        throw Error('PRIVATE_VAULT_ENROLLMENT_INVALID');
    await transaction('vaults', 'readwrite', s => s.add(entry));
}
export async function updateEnrolledVault(entry: EnrolledVault): Promise<void> {
    if (!entry.recoveryConfirmed || entry.vault.tenantId !== entry.tenantId || entry.vault.vaultId !== entry.vaultId || entry.vault.key.extractable)
        throw Error('PRIVATE_VAULT_ENROLLMENT_INVALID');
    await transaction('vaults', 'readwrite', s => s.put(entry));
}
export function getEnrolledProject(tenantId: string, runId: string): Promise<EnrolledProject | undefined> { return transaction('projects', 'readonly', s => s.get([tenantId, runId])); }
export async function addEnrolledProject(entry: EnrolledProject): Promise<void> { await transaction('projects', 'readwrite', s => s.add(entry)); }
// No pruning or automatic replacement of keys. Explicit recovery imports keep
// original legacy stores intact until a separate migration is acknowledged.

/** A replacement is staged in the existing durable record before the server
 * commit. A lost HTTP reply never removes the last usable enrolled key. */
export async function promoteEnrolledVault(entry: EnrolledVault): Promise<void> {
    if (!entry.recoveryConfirmed || entry.pendingReplacement || entry.vault.key.extractable ||
        entry.vault.tenantId !== entry.tenantId || entry.vault.vaultId !== entry.vaultId)
        throw Error('PRIVATE_VAULT_ENROLLMENT_INVALID');
    const db = await database();
    try {
        await new Promise<void>((resolve, reject) => {
            const tx = db.transaction(['vaults', 'projects'], 'readwrite');
            tx.objectStore('vaults').put(entry);
            const cursor = tx.objectStore('projects').openCursor();
            cursor.onsuccess = () => {
                const row = cursor.result;
                if (row) { if (row.value.tenantId === entry.tenantId) row.delete(); row.continue(); }
            };
            tx.oncomplete = () => resolve();
            tx.onerror = tx.onabort = () => reject(Error('PRIVATE_LOCAL_STORAGE_UNAVAILABLE'));
        });
    } finally { db.close(); }
}

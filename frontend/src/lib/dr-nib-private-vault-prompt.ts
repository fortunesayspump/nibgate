export type VaultPrompt = {
    mode: 'enroll' | 'recover' | 'replace';
    tenantId: string;
    recoveryCode?: string;
    resolve: (code: string) => void;
    reject: () => void;
};
const EVENT = 'drnib:private-vault-prompt';
type Detail = { request: VaultPrompt; accepted: boolean };
/** DOM-local dispatch survives separately loaded route chunks and development
 * module replacement. Recovery material never goes over a network or log. */
export function setPrivateVaultPrompt(handler: ((request: VaultPrompt) => void) | null): () => void {
    if (typeof window === 'undefined' || !handler) return () => {};
    const listener = (event: Event) => {
        const detail = (event as CustomEvent<Detail>).detail;
        if (!detail || detail.accepted) return;
        detail.accepted = true;
        handler(detail.request);
    };
    window.addEventListener(EVENT, listener);
    return () => window.removeEventListener(EVENT, listener);
}
export async function askPrivateVaultPrompt(request: Omit<VaultPrompt, 'resolve' | 'reject'>): Promise<string> {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined') return reject(Error('Private project unlock is not ready. Retry in a moment.'));
        const detail: Detail = { accepted: false, request: { ...request, resolve,
            reject: () => reject(Error('Private projects remain locked.')) } };
        window.dispatchEvent(new CustomEvent<Detail>(EVENT, { detail }));
        if (!detail.accepted) reject(Error('Private project unlock is not ready. Retry in a moment.'));
    });
}

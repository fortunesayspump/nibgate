export type VaultPrompt = {
    mode: 'set-password' | 'enroll' | 'recover' | 'replace';
    tenantId: string;
    recoveryCode?: string;
    hasPassword?: boolean;
    resolve: (credential: { method: 'password' | 'code'; secret: string }) => void;
    reject: () => void;
};
const EVENT = 'drnib:private-vault-prompt';
type Detail = { request: VaultPrompt; accepted: boolean };
type PromptBridge = { handler?: (request: VaultPrompt) => void; pending?: VaultPrompt };
const BRIDGE = '__drNibPrivateVaultPromptBridge';
function promptBridge(): PromptBridge {
    const target = window as typeof window & { [BRIDGE]?: PromptBridge };
    return target[BRIDGE] ??= {};
}
/** DOM-local dispatch survives separately loaded route chunks and development
 * module replacement. Recovery material never goes over a network or log. */
export function setPrivateVaultPrompt(handler: ((request: VaultPrompt) => void) | null): () => void {
    if (typeof window === 'undefined' || !handler) return () => {};
    const bridge = promptBridge();
    bridge.handler = handler;
    if (bridge.pending) {
        const pending = bridge.pending;
        delete bridge.pending;
        handler(pending);
    }
    const listener = (event: Event) => {
        const detail = (event as CustomEvent<Detail>).detail;
        if (!detail || detail.accepted) return;
        detail.accepted = true;
        handler(detail.request);
    };
    window.addEventListener(EVENT, listener);
    return () => {
        window.removeEventListener(EVENT, listener);
        if (bridge.handler === handler) delete bridge.handler;
    };
}
export async function askPrivateVaultPrompt(request: Omit<VaultPrompt, 'resolve' | 'reject'>): Promise<{ method: 'password' | 'code'; secret: string }> {
    return new Promise((resolve, reject) => {
        if (typeof window === 'undefined') return reject(Error('Private project unlock is not ready. Retry in a moment.'));
        const detail: Detail = { accepted: false, request: { ...request, resolve,
            reject: () => reject(Error('Private projects remain locked.')) } };
        window.dispatchEvent(new CustomEvent<Detail>(EVENT, { detail }));
        if (!detail.accepted) {
            const bridge = promptBridge();
            if (bridge.handler) bridge.handler(detail.request);
            else if (!bridge.pending) bridge.pending = detail.request;
            else reject(Error('Private project unlock is already waiting for confirmation.'));
        }
    });
}

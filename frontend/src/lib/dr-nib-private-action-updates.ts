// A receipt can change the browser's pending/error state without changing the
// encrypted manifest. Wake its subscriber even when the saved snapshot matches.
const listeners = new Set<(runId: string) => void>();
export function subscribePrivateActionUpdates(listener: (runId: string) => void) {
    listeners.add(listener);
    return () => { listeners.delete(listener); };
}
export function notifyPrivateActionUpdate(runId: string) {
    for (const listener of listeners) { try { listener(runId); } catch { /* Keep other run subscribers alive. */ } }
}

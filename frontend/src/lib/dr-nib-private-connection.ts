// Ephemeral transport progress only: no project content, keys or durable state.
export type PrivateConnectionPhase = 'connecting' | 'starting' | 'draining' | 'verifying';
export type PrivateConnection = {runId: string; phase: PrivateConnectionPhase};
const pending = new Map<string, PrivateConnection>();
const listeners = new Set<() => void>();
let snapshot: PrivateConnection | null = null;
export function privateConnectionProgress(runId: string, phase: PrivateConnectionPhase | null) {
  if (phase === null) pending.delete(runId);
  else pending.set(runId, {runId, phase});
  snapshot = [...pending.values()].at(-1) ?? null;
  for (const listener of listeners) listener();
}
export const subscribePrivateConnection = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
export const getPrivateConnection = () => snapshot;
export const getServerPrivateConnection = () => null;

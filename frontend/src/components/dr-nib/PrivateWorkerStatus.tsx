'use client';
import {useSyncExternalStore} from 'react';
import {Loader2, ShieldCheck} from 'lucide-react';
import {getPrivateConnection, getServerPrivateConnection, subscribePrivateConnection} from '@/lib/dr-nib-private-connection';

const labels = {
  connecting: 'Connecting to private worker…',
  starting: 'Waking private worker…',
  draining: 'Waiting for private worker to restart…',
  verifying: 'Verifying secure connection…',
};
export default function PrivateWorkerStatus() {
  const connection = useSyncExternalStore(subscribePrivateConnection, getPrivateConnection, getServerPrivateConnection);
  if (!connection) return null;
  return <section style={{color: 'var(--nib-page-fg)'}} role="status" aria-live="polite" aria-atomic="true" className="mx-auto mb-4 flex w-fit max-w-full items-center justify-center gap-2 rounded-full border border-dark-gray/20 px-4 py-2 text-xs">
    {connection.phase === 'verifying' ? <ShieldCheck size={14} className="shrink-0 motion-safe:animate-pulse" aria-hidden="true"/> : <Loader2 size={14} className="shrink-0 motion-safe:animate-spin" aria-hidden="true"/>}
    <p>{labels[connection.phase]}</p>
  </section>;
}

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
  return <section style={{background: 'var(--nib-page-bg)', color: 'var(--nib-page-fg)'}} role="status" aria-live="polite" aria-atomic="true" className="sticky top-0 z-20 flex items-start gap-3 rounded-2xl border border-dark-gray/30 p-4 text-sm">
    {connection.phase === 'verifying' ? <ShieldCheck size={18} className="mt-0.5 shrink-0 motion-safe:animate-pulse" aria-hidden="true"/> : <Loader2 size={18} className="mt-0.5 shrink-0 motion-safe:animate-spin" aria-hidden="true"/>}
    <div><p className="font-medium">{labels[connection.phase]}</p><p className="mt-1 text-xs leading-5 opacity-70">Your saved research is available below. New private work begins only after verification.</p></div>
  </section>;
}

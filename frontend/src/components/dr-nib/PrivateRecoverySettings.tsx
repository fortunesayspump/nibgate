'use client';
import { useState } from 'react';
import { privateBuildEnabled, replacePrivateRecoveryCode } from '@/lib/dr-nib-private-records';

export default function PrivateRecoverySettings() {
    const [busy, setBusy] = useState(false), [message, setMessage] = useState('');
    if (!privateBuildEnabled()) return null;
    async function replace() {
        if (busy) return;
        setBusy(true); setMessage('Preparing recovery replacement on this device…');
        try {
            await replacePrivateRecoveryCode();
            setMessage('Recovery code replaced. Keep the new code securely; other devices need it to unlock your projects.');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Recovery replacement could not finish. Keep this browser’s stored data and retry.');
        } finally { setBusy(false); }
    }
    return <section className="mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5" aria-labelledby="private-recovery-heading">
        <h2 id="private-recovery-heading" className="font-medium">Private project recovery</h2>
        <p className="mt-2 text-sm leading-7">Lost your recovery code? An enrolled browser can create a replacement while preserving your existing projects. Save the new code before confirming. Keep this browser’s stored data until replacement finishes.</p>
        <button type="button" onClick={replace} disabled={busy} className="mt-3 rounded-full border border-dark-gray px-4 py-2 text-sm disabled:opacity-50">{busy ? 'Preparing…' : 'Replace recovery code'}</button>
        <p role="status" aria-live="polite" className="mt-2 text-sm">{message}</p>
    </section>;
}

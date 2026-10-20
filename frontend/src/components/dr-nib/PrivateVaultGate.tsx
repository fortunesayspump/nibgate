'use client';
import { useEffect, useRef, useState } from 'react';
import { setPrivateVaultPrompt, type VaultPrompt } from '@/lib/dr-nib-private-records';
/** One-time enrollment/new-device unlock. Ordinary research screens remain
 * unchanged. Native dialog supplies focus containment and escape handling. */
export default function PrivateVaultGate() {
    const dialog = useRef<HTMLDialogElement>(null), [request, setRequest] = useState<VaultPrompt | null>(null), [code, setCode] = useState(''), [saved, setSaved] = useState(false);
    useEffect(() => setPrivateVaultPrompt(value => { setCode(''); setSaved(false); setRequest(value); }), []);
    useEffect(() => { if (request)
        dialog.current?.showModal();
    else
        dialog.current?.close(); }, [request]);
    function cancel() { request?.reject(); setRequest(null); }
    return <dialog ref={dialog} aria-labelledby="private-vault-title" onCancel={event => { event.preventDefault(); cancel(); }} className="fixed inset-0 m-auto h-fit max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-dark-gray/40 bg-white p-6 text-dark-gray backdrop:bg-black/40">
    {request && <>
    <h2 id="private-vault-title" className="text-xl font-medium">{request?.mode === 'replace' ? 'Save your replacement recovery code' : request?.mode !== 'recover' ? 'Protect your private projects' : 'Unlock your private projects'}</h2>
    <p className="mt-3 text-sm leading-6">{request?.mode === 'replace' ? 'Save this new code in your password manager before continuing. It replaces the old recovery code for all your private projects, including deleted projects. Other devices will need this new code. Documents, reports and project keys are preserved.' : request?.mode !== 'recover' ? 'Save this recovery code in your password manager. This device will remember your keys. You only need the code on another device or after clearing browser storage.' : 'Enter the recovery code you saved when setting up your private projects. Your wallet signs you in; this code unlocks your encrypted content.'}</p>
    {request?.mode !== 'recover' ? <><pre className="mt-4 whitespace-pre-wrap break-all rounded-lg bg-gray p-3 text-xs select-all">{request.recoveryCode?.match(/.{1,8}/g)?.join(' ')}</pre><p className="mt-2 text-xs">Nibgate cannot recover your projects if you lose all trusted devices and this code. Keep it secret.</p><label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)}/>I saved my recovery code securely.</label></> : <label className="mt-4 block text-sm">Recovery code<input autoFocus autoComplete="off" type="password" value={code} onChange={event => setCode(event.target.value)} className="mt-2 w-full rounded-lg border border-dark-gray/40 p-3"/></label>}
    <div className="mt-5 flex justify-end gap-3"><button type="button" onClick={cancel} className="px-4 py-2 text-sm underline">Cancel</button><button type="button" disabled={request?.mode !== 'recover' ? !saved : !/^[0-9a-f]{64}$/i.test(code.replace(/[\s-]/g, ''))} onClick={() => { request?.resolve(request.mode !== 'recover' ? request.recoveryCode! : code); setCode(''); setRequest(null); }} className="rounded-full bg-black px-5 py-2 text-sm text-white disabled:opacity-40">Continue</button></div>
    </>}
  </dialog>;
}

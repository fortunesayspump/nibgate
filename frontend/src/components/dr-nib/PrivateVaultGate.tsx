'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { setPrivateVaultPrompt, type VaultPrompt } from '@/lib/dr-nib-private-records';

type StrengthMeter = (password: string, tenantId: string) => number;
let strengthFlight: Promise<StrengthMeter> | undefined;
function loadStrength(): Promise<StrengthMeter> {
    return strengthFlight ??= Promise.all([
        import('@zxcvbn-ts/core'), import('@zxcvbn-ts/language-common'), import('@zxcvbn-ts/language-en')
    ]).then(([{ ZxcvbnFactory }, common, english]) => {
        const meter = new ZxcvbnFactory({ dictionary: { ...common.dictionary, ...english.dictionary },
            graphs: common.adjacencyGraphs, translations: english.translations });
        return (password, tenantId) => meter.check(password.normalize('NFC'), ['nibgate', 'dr nib', tenantId]).score;
    });
}
const normalizedCode = (value: string) => value.replace(/[\s-]/g, '').toLowerCase();

/** Password and backup code are independent client-side unlock methods. */
export default function PrivateVaultGate() {
    const dialog = useRef<HTMLDialogElement>(null);
    const [request, setRequest] = useState<VaultPrompt | null>(null);
    const [method, setMethod] = useState<'password' | 'code'>('password');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [code, setCode] = useState('');
    const [saved, setSaved] = useState(false);
    const [meter, setMeter] = useState<StrengthMeter | null>(null);
    const [strengthError, setStrengthError] = useState(false);
    useEffect(() => setPrivateVaultPrompt(value => {
        setPassword(''); setConfirmPassword(''); setCode(''); setSaved(false); setStrengthError(false);
        setMethod(value.hasPassword ? 'password' : 'code'); setRequest(value);
    }), []);
    useEffect(() => { if (request) dialog.current?.showModal(); else dialog.current?.close(); }, [request]);
    useEffect(() => {
        if (request?.mode !== 'set-password') return;
        let active = true;
        void loadStrength().then(value => { if (active) setMeter(() => value); })
            .catch(() => { strengthFlight = undefined; if (active) setStrengthError(true); });
        return () => { active = false; };
    }, [request?.mode]);
    function cancel() { request?.reject(); setPassword(''); setConfirmPassword(''); setCode(''); setRequest(null); }
    const creating = request?.mode === 'set-password';
    const recovering = request?.mode === 'recover';
    const showingBackup = request?.mode === 'enroll' || request?.mode === 'replace';
    const passwordScore = creating && password && meter ? meter(password, request.tenantId) : 0;
    const strong = !!meter && password.length >= 15 && password.length <= 256 && passwordScore === 4 &&
        password.normalize('NFC').toLowerCase() !== 'correct horse battery staple';
    const valid = creating ? strong && password.normalize('NFC') === confirmPassword.normalize('NFC') : showingBackup ?
        saved && normalizedCode(code) === request.recoveryCode?.toLowerCase() :
        method === 'code' ? /^[0-9a-f]{64}$/i.test(normalizedCode(code)) : password.length > 0;
    function continueFlow() {
        if (!request || !valid) return;
        request.resolve({ method: creating || (recovering && method === 'password') ? 'password' : 'code',
            secret: creating || (recovering && method === 'password') ? password : recovering ? code : request.recoveryCode! });
        setPassword(''); setConfirmPassword(''); setCode(''); setRequest(null);
    }
    return <dialog ref={dialog} aria-labelledby="private-vault-title" onCancel={event => { event.preventDefault(); cancel(); }}
        className="fixed inset-0 m-auto h-fit max-h-[calc(100dvh_-_2rem)] w-[calc(100%_-_2rem)] max-w-lg overflow-y-auto rounded-2xl border border-dark-gray/40 bg-white p-6 text-dark-gray backdrop:bg-black/40">
        {request && <>
            <h2 id="private-vault-title" className="text-xl font-medium">{creating ? 'Set your private-project password' : showingBackup ? 'Save your backup recovery code' : 'Unlock your private projects'}</h2>
            <p className="mt-3 text-sm leading-6">{creating ?
                'Choose a long, unique password for your encrypted private projects. This is separate from wallet sign-in. Save it in your password manager.' :
                showingBackup ? 'Save this random backup code separately from your password. It unlocks the same projects if you forget your password.' :
                request.hasPassword ? 'Wallet sign-in proves which projects are yours. Enter the separate private-project password or backup code to decrypt them here.' :
                'Wallet sign-in proves which projects are yours. This older vault uses the private-project recovery code saved at setup.'}</p>
            {creating ? <>
                <label className="mt-4 block text-sm">Private-project password
                    <input autoFocus autoComplete="new-password" type="password" value={password} maxLength={256}
                        onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-dark-gray/40 p-3" />
                </label>
                <p className="mt-2 text-xs" role="status">At least 15 characters; long passphrases welcome. No symbol or capital-letter rule. Strength: {strengthError ? 'unavailable; reload and try again' : !meter ? 'checking…' : password ? ['very weak', 'weak', 'fair', 'good', 'strong'][passwordScore] : 'waiting for password'}.</p>
                <label className="mt-4 block text-sm">Confirm private-project password
                    <input autoComplete="new-password" type="password" value={confirmPassword} maxLength={256}
                        onChange={event => setConfirmPassword(event.target.value)} className="mt-2 w-full rounded-lg border border-dark-gray/40 p-3" />
                </label>
                {password && !strong ? <p className="mt-2 text-xs">Choose a less predictable password or a longer phrase.</p> : null}
            </> : null}
            {showingBackup ? <>
                <pre className="mt-4 select-all whitespace-pre-wrap break-all rounded-lg bg-gray p-3 text-xs">{request.recoveryCode?.match(/.{1,8}/g)?.join(' ')}</pre>
                <p className="mt-2 text-xs">Keep this code private. Nibgate cannot decrypt your projects if both unlock methods and all enrolled browsers are lost.</p>
                <label className="mt-4 block text-sm">Confirm your saved backup code
                    <input autoComplete="off" type="text" value={code} onChange={event => setCode(event.target.value)} className="mt-2 w-full rounded-lg border border-dark-gray/40 p-3" />
                </label>
                <label className="mt-4 flex items-start gap-2 text-sm"><input type="checkbox" checked={saved} onChange={event => setSaved(event.target.checked)} />I saved my backup code securely.</label>
            </> : null}
            {recovering ? <>
                {request.hasPassword ? <div className="mt-4 flex gap-2" role="group" aria-label="Unlock method">
                    <button type="button" aria-pressed={method === 'password'} onClick={() => setMethod('password')} className="rounded-full border px-4 py-2 text-sm aria-pressed:bg-black aria-pressed:text-white">Password</button>
                    <button type="button" aria-pressed={method === 'code'} onClick={() => setMethod('code')} className="rounded-full border px-4 py-2 text-sm aria-pressed:bg-black aria-pressed:text-white">Backup code</button>
                </div> : null}
                <label className="mt-4 block text-sm">{method === 'password' ? 'Private-project password' : 'Backup recovery code'}
                    <input autoFocus autoComplete={method === 'password' ? 'current-password' : 'off'} type="password"
                        value={method === 'password' ? password : code}
                        onChange={event => method === 'password' ? setPassword(event.target.value) : setCode(event.target.value)}
                        className="mt-2 w-full rounded-lg border border-dark-gray/40 p-3" />
                </label>
                <div className="mt-4 rounded-xl border border-dark-gray/30 bg-gray p-4 text-sm leading-6">
                    <strong>Lost both?</strong> An enrolled browser that still opens these projects can replace them. Never enter a wallet recovery phrase here.
                    <Link href="/dr-nib/settings#private-recovery" onClick={cancel} className="mt-2 block font-medium underline">See recovery options in Help</Link>
                </div>
            </> : null}
            <div className="mt-5 flex justify-end gap-3">
                <button type="button" onClick={cancel} className="px-4 py-2 text-sm underline">Cancel</button>
                <button type="button" disabled={!valid} onClick={continueFlow} className="rounded-full bg-black px-5 py-2 text-sm text-white disabled:opacity-40">Continue</button>
            </div>
        </>}
    </dialog>;
}

'use client';

import { useEffect, useState } from 'react';
import { privateBuildEnabled, privateRecoveryAvailability, replacePrivateRecoveryCredentials } from '@/lib/dr-nib-private-records';

type Readiness = 'checking' | 'available' | 'available-legacy' | 'needs-code' | 'no-vault' | 'unavailable';

const steps = [
    { number: '01', title: 'Sign in', detail: 'Your wallet or account proves which projects are yours.' },
    { number: '02', title: 'Unlock the vault', detail: 'Use an enrolled browser, your private-project password, or your backup code.' },
    { number: '03', title: 'Read your projects', detail: 'Only your browser decrypts the saved private content.' },
];

export default function PrivateRecoverySettings() {
    const [readiness, setReadiness] = useState<Readiness>('checking');
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState('');

    async function checkBrowser() {
        setReadiness('checking');
        try { setReadiness(await privateRecoveryAvailability()); }
        catch { setReadiness('unavailable'); }
    }

    useEffect(() => {
        if (!privateBuildEnabled()) return;
        let active = true;
        void privateRecoveryAvailability().then(value => { if (active) setReadiness(value); })
            .catch(() => { if (active) setReadiness('unavailable'); });
        return () => { active = false; };
    }, []);

    async function replace() {
        if (busy || !['available', 'available-legacy'].includes(readiness)) return;
        setBusy(true);
        setMessage('Preparing a replacement on this enrolled browser…');
        try {
            const passwordReady = await replacePrivateRecoveryCredentials();
            if (passwordReady) setReadiness('available');
            setMessage(passwordReady ? 'Replacement confirmed. Save the new password and backup code securely; other devices now need one of them to unlock your projects.' :
                'An earlier code-only replacement was confirmed. Run this action once more to set a private-project password.');
        } catch (error) {
            setMessage(error instanceof Error ? error.message : 'Replacement did not finish. Keep this browser’s stored data and retry.');
        } finally { setBusy(false); }
    }

    if (!privateBuildEnabled()) return null;
    return <section id="private-recovery" className="mt-4 scroll-mt-24 rounded-2xl border-2 border-dark-gray bg-white p-5 md:p-7" aria-labelledby="private-recovery-heading">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] opacity-60">Start here if you cannot unlock</p>
        <h2 id="private-recovery-heading" className="mt-2 text-2xl font-medium">Need to unlock or recover private projects?</h2>
        <p className="mt-3 max-w-3xl text-sm leading-7">Your sign-in proves ownership. Your separate private-project password, backup code, or an already enrolled browser unlocks the encryption key. A wallet recovery phrase is different. Never enter a wallet phrase here or send any recovery secret to support or chat.</p>

        <ol className="mt-6 grid gap-3 md:grid-cols-3" aria-label="How private-project access works">
            {steps.map((step, index) => <li key={step.number} className="relative rounded-xl border border-dark-gray/30 bg-gray p-4">
                <span className="text-xs font-semibold tracking-widest opacity-60">{step.number}</span>
                <h3 className="mt-2 font-medium">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 opacity-75">{step.detail}</p>
                {index < steps.length - 1 ? <span aria-hidden="true" className="absolute -bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white px-1 text-lg leading-5 md:-right-3 md:bottom-auto md:left-auto md:top-1/2 md:translate-x-0 md:-translate-y-1/2"><span className="md:hidden">↓</span><span className="hidden md:inline">→</span></span> : null}
            </li>)}
        </ol>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-dark-gray/30 p-4">
                <h3 className="font-medium">If this browser already opens your private projects</h3>
                <p className="mt-2 text-sm leading-6">You can set a new strong password and backup code here. The browser rewraps the same project keys; it does not erase your reports. Keep this browser’s data until replacement is confirmed and saved.</p>
                <p className="mt-3 text-sm font-medium" role="status" aria-live="polite">
                    {readiness === 'checking' ? 'Checking this browser…' : readiness === 'available' ? 'Ready: this browser has an enrolled key.' : readiness === 'available-legacy' ? 'Ready: this browser has the key. Your older vault has code-only recovery; set a strong password and new backup code here.' : readiness === 'needs-code' ? 'This browser has no usable key for this account. Use your private-project password, backup code, or an enrolled browser.' : readiness === 'no-vault' ? 'No private vault exists for this account yet.' : 'Could not check this browser. Sign in and try again.'}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                    <button type="button" onClick={replace} disabled={busy || !['available', 'available-legacy'].includes(readiness)} className="rounded-full border border-current px-5 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60">{busy ? 'Preparing…' : readiness === 'available-legacy' ? 'Set password and new backup code' : 'Replace password and backup code'}</button>
                    <button type="button" onClick={() => void checkBrowser()} disabled={busy || readiness === 'checking'} className="text-sm underline disabled:opacity-40">Check this browser again</button>
                </div>
                <p role="status" aria-live="polite" className="mt-3 text-sm">{message}</p>
            </div>
            <div className="rounded-xl border border-dark-gray/30 p-4">
                <h3 className="font-medium">If this is a new browser or device</h3>
                <p className="mt-2 text-sm leading-6">Sign in to the same account, then enter your private-project password or saved backup code. Older projects set up before passwords were added use their recovery code. If you lost both, return to a browser that still opens those projects and replace them there.</p>
                <p className="mt-3 text-sm leading-6"><strong>If no unlock method remains:</strong> Nibgate cannot decrypt the old private projects or reset their key from wallet sign-in. Do not clear any old browser’s site data while searching for an enrolled one.</p>
            </div>
        </div>
        <p className="mt-5 text-sm leading-6">Older <a href="https://testnet.nibgate.xyz/dr-nib/legacy" className="underline">testnet Legacy history</a> is separate plaintext history and does not need a private-vault password or code. <a href="https://docs.nibgate.xyz/dr-nib/confidential/recovery" className="underline">Read the full encryption and recovery guide</a>.</p>
    </section>;
}

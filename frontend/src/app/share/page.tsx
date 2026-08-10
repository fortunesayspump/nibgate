'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount, useSignMessage } from 'wagmi';
import { ShareLayout, ShareTitle, ShareIntro, ShareError, ShareBtn } from '@/features/nibshare/components/ShareLayout';
import ShareForm from '@/features/nibshare/components/ShareForm';
import ShareWallet from '@/features/nibshare/components/ShareWallet';
import { useNibgateConnect } from '@/lib/useNibgateConnect';
import { HUB_SESSION_UPDATED_EVENT } from '@/lib/hubSession';
import { nibshareApi } from '@/features/nibshare/api';
import type { MeResponse } from '@/features/nibshare/types';
import { FiList } from 'react-icons/fi';

type AuthState = 'checking' | 'connect' | 'auth' | 'form';

export default function ShareCreatePage() {
  const { connect, busy: connecting, error: connectError, hasInjected } = useNibgateConnect();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [step, setStep] = useState<AuthState>('checking');
  const [authError, setAuthError] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [defaultRecipient, setDefaultRecipient] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let me: MeResponse | null = null;
      try {
        me = await nibshareApi.me();
      } catch {}
      if (cancelled) return;
      if (me && me.authenticated) {
        setDefaultRecipient(me.user?.wallets?.[0]?.address ?? '');
        setStep('form');
      } else {
        setStep(isConnected ? 'auth' : 'connect');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isConnected]);

  useEffect(() => {
    if (isConnected && step === 'connect') setStep('auth');
  }, [isConnected, step]);

  async function handleAuth() {
    if (!address) {
      setAuthError('Wallet not connected — tap "Connect wallet" first.');
      return;
    }
    setAuthError(null);
    setSigning(true);
    try {
      const { messageTemplate } = await nibshareApi.authNonce();
      const signature = await signMessageAsync({ message: messageTemplate });
      await nibshareApi.authVerify({ walletAddress: address, signature });
      const me = await nibshareApi.me();
      if (!me || !me.authenticated) throw new Error('Could not confirm your session');
      setDefaultRecipient(me.user?.wallets?.[0]?.address ?? '');
      setStep('form');
      window.dispatchEvent(new Event(HUB_SESSION_UPDATED_EVENT));
    } catch (err: any) {
      const msg = err?.message || 'Signing failed';
      const expired = msg.toLowerCase().includes('session expired') || msg.toLowerCase().includes('nonce');
      setAuthError(
        expired
          ? 'Your sign-in request expired — sign again below.'
          : `${msg}. If your wallet did not show a signature request, allow popups for nibgate.xyz and try again.`
      );
    } finally {
      setSigning(false);
    }
  }

  return (
    <ShareLayout
      backHref="/" backLabel="Back to Hub"
      right={
        <div className="flex items-center gap-2">
          <Link href="/share/mine" className="btn-ghost no-underline inline-flex items-center gap-1 text-xs">
            <FiList size={13} /> My Posts
          </Link>
          <ShareWallet />
        </div>
      }
    >
      <ShareTitle>New Post</ShareTitle>
      {step === 'checking' ? (
        <ShareIntro>Checking your session...</ShareIntro>
      ) : step === 'connect' ? (
        <>
          {connectError && <ShareError>{connectError}</ShareError>}
          {!hasInjected && (
            <ShareError>
              No wallet was detected in this browser. If you use the Mises browser, open its wallet and enable web3
              access, then reload this page. You can also use MetaMask or any Ethereum-compatible wallet.
            </ShareError>
          )}
          <ShareIntro>Connect your wallet to start creating.</ShareIntro>
          <ShareBtn onClick={() => void connect()} style={{ marginTop: '2rem' }} disabled={connecting}>
            {connecting ? 'Connecting...' : 'Connect wallet'}
          </ShareBtn>
        </>
      ) : step === 'auth' ? (
        <>
          {authError && <ShareError>{authError}</ShareError>}
          <ShareIntro>Sign the message to authenticate your wallet.</ShareIntro>
          <ShareBtn onClick={handleAuth} style={{ marginTop: '1rem' }} disabled={signing}>
            {signing ? 'Waiting for signature...' : 'Sign with wallet'}
          </ShareBtn>
        </>
      ) : (
        <ShareForm defaultRecipientWallet={defaultRecipient} />
      )}
    </ShareLayout>
  );
}

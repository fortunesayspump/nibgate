'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAccount, useSignMessage } from 'wagmi';
import { useAppKit } from '@reown/appkit/react';
import { ShareLayout, ShareTitle, ShareIntro, ShareError, ShareBtn } from '@/features/nibshare/components/ShareLayout';
import ShareForm from '@/features/nibshare/components/ShareForm';
import ShareWallet from '@/features/nibshare/components/ShareWallet';
import { nibshareApi } from '@/features/nibshare/api';
import type { MeResponse } from '@/features/nibshare/types';
import { FiList } from 'react-icons/fi';

type AuthState = 'checking' | 'connect' | 'auth' | 'form';

export default function ShareCreatePage() {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [step, setStep] = useState<AuthState>('checking');
  const [authError, setAuthError] = useState<string | null>(null);
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
    try {
      setAuthError(null);
      const { messageTemplate } = await nibshareApi.authNonce();
      const signature = await signMessageAsync({ message: messageTemplate });
      await nibshareApi.authVerify({ walletAddress: address, signature });
      const me = await nibshareApi.me();
      setDefaultRecipient(me.user?.wallets?.[0]?.address ?? '');
      setStep('form');
    } catch (err: any) {
      setAuthError(err.message);
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
          <ShareIntro>Connect your wallet to start creating.</ShareIntro>
          <ShareBtn onClick={() => open()} style={{ marginTop: '2rem' }}>Connect wallet</ShareBtn>
        </>
      ) : step === 'auth' ? (
        <>
          {authError && <ShareError>{authError}</ShareError>}
          <ShareIntro>Sign the message to authenticate your wallet.</ShareIntro>
          <ShareBtn onClick={handleAuth} style={{ marginTop: '1rem' }}>Sign with wallet</ShareBtn>
        </>
      ) : (
        <ShareForm defaultRecipientWallet={defaultRecipient} />
      )}
    </ShareLayout>
  );
}

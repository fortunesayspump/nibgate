'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ShareLayout, ShareTitle, ShareIntro, ShareError } from '@/features/nibshare/components/ShareLayout';
import ShareForm from '@/features/nibshare/components/ShareForm';
import ShareWallet from '@/features/nibshare/components/ShareWallet';
import { useNibgateConnect } from '@/lib/useNibgateConnect';
import { HUB_SESSION_UPDATED_EVENT } from '@/lib/hubSession';
import { nibshareApi } from '@/features/nibshare/api';
import type { MeResponse } from '@/features/nibshare/types';
import { FiList } from 'react-icons/fi';

export default function ShareCreatePage() {
  const { connect, busy: connecting, error: connectError } = useNibgateConnect();
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [defaultRecipient, setDefaultRecipient] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function check() {
      let me: MeResponse | null = null;
      try {
        me = await nibshareApi.me();
      } catch {}
      if (cancelled) return;
      if (me && me.authenticated) {
        setDefaultRecipient(me.user?.wallets?.[0]?.address ?? '');
        setAuthenticated(true);
      } else {
        setAuthenticated(false);
      }
      setChecking(false);
    }
    void check();
    window.addEventListener(HUB_SESSION_UPDATED_EVENT, check);
    return () => {
      cancelled = true;
      window.removeEventListener(HUB_SESSION_UPDATED_EVENT, check);
    };
  }, []);

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
      {checking ? (
        <ShareIntro>Checking your session...</ShareIntro>
      ) : (
        <>
          {connectError && <ShareError>{connectError}</ShareError>}
          <ShareForm
            defaultRecipientWallet={defaultRecipient}
            authenticated={authenticated}
            connecting={connecting}
            onConnect={() => void connect()}
          />
        </>
      )}
    </ShareLayout>
  );
}
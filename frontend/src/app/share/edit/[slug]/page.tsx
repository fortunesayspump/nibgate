'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ShareLayout, ShareTitle, ShareIntro, ShareError } from '@/features/nibshare/components/ShareLayout';
import ShareForm from '@/features/nibshare/components/ShareForm';
import ShareWallet from '@/features/nibshare/components/ShareWallet';
import { useNibgateConnect } from '@/lib/useNibgateConnect';
import { HUB_SESSION_UPDATED_EVENT } from '@/lib/hubSession';
import { nibshareApi } from '@/features/nibshare/api';
import type { EditSharePayload } from '@/features/nibshare/types';
import { FiList } from 'react-icons/fi';

export default function ShareEditPage() {
  const { connect, busy: connecting, error: connectError } = useNibgateConnect();
  const params = useParams();
  const slug = String(params.slug || '');
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [initial, setInitial] = useState<EditSharePayload | null>(null);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let authed = false;
      try {
        const me = await nibshareApi.me();
        authed = !!(me && me.authenticated);
      } catch {}
      if (cancelled) return;
      if (authed) {
        try {
          const data = await nibshareApi.getEdit(slug);
          if (cancelled) return;
          setInitial(data);
          setAuthenticated(true);
        } catch (err) {
          if (!cancelled) setLoadError(err instanceof Error ? err.message : 'Could not load this share for editing.');
        }
      } else {
        setAuthenticated(false);
      }
      if (!cancelled) setChecking(false);
    }
    void load();
    window.addEventListener(HUB_SESSION_UPDATED_EVENT, load);
    return () => {
      cancelled = true;
      window.removeEventListener(HUB_SESSION_UPDATED_EVENT, load);
    };
  }, [slug]);

  return (
    <ShareLayout
      backHref="/share/mine" backLabel="Back to My Posts"
      right={
        <div className="flex items-center gap-2">
          <Link href="/share/mine" className="btn-ghost no-underline inline-flex items-center gap-1 text-xs">
            <FiList size={13} /> My Posts
          </Link>
          <ShareWallet />
        </div>
      }
    >
      <ShareTitle>Edit Post</ShareTitle>
      {checking ? (
        <ShareIntro>Loading your post...</ShareIntro>
      ) : loadError ? (
        <ShareError>{loadError}</ShareError>
      ) : !authenticated ? (
        <ShareIntro>Connect your wallet to edit this post.</ShareIntro>
      ) : (
        <>
          {connectError && <ShareError>{connectError}</ShareError>}
          {initial && (
            <ShareForm
              defaultRecipientWallet=""
              authenticated={authenticated}
              connecting={connecting}
              onConnect={() => void connect()}
              editing={{ slug, initial }}
            />
          )}
        </>
      )}
    </ShareLayout>
  );
}
'use client';

import { NibgateTipCard } from '@nibgate/wallet/react';
import { apiBaseUrl } from '@/lib/api';
import type { ShareMeta } from '../types';

// Tip block under the share unlock flow. No reputation on nibshare —
// standalone shares resolve identity by owner wallet only. Tips record on
// the hub via apiBase (defaults to this deployment's hub API).
export default function ShareTip({ slug, meta, apiBase }: { slug: string; meta: ShareMeta; apiBase?: string }) {
  if (!meta.ownerWallet) return null;
  return (
    <NibgateTipCard
      resource={{
        url: `/ns/${slug}`,
        title: meta.title,
        price: meta.price || '0',
        recipient: meta.ownerWallet,
        // Keep nibshare tips labeled like their ledger entries: private, no site.
        domain: 'nibshare',
      }}
      recipient={meta.ownerWallet}
      apiBase={apiBase || apiBaseUrl()}
    />
  );
}

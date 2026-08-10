'use client';

import { useEffect, useState } from 'react';
import ContentViewer from './ContentViewer';
import UnlockGate from './UnlockGate';
import { nibshareApi } from '../api';
import type { AccessPayload, ShareMeta } from '../types';

export default function ShareClient({ slug, meta }: { slug: string; meta: ShareMeta }) {
  const [freePayload, setFreePayload] = useState<AccessPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      nibshareApi.recordView(slug).catch(() => {});
      if (!(Number(meta.price) > 0)) {
        try {
          const data = await nibshareApi.access(slug);
          if (!cancelled) setFreePayload(data);
        } catch (err: any) {
          if (!cancelled) setError(err?.message || 'Could not load this share.');
        }
      }
    })();
    return () => { cancelled = true; };
  }, [slug, meta.price]);

  if (Number(meta.price) > 0) {
    return (
      <>
        <UnlockGate resource={{ id: slug, title: meta.title, type: meta.contentType, price: meta.price, currency: meta.currency, path: `/ns/${slug}` }} />
        {error && <div className="nibshare-error-alert" style={{ marginTop: '1rem' }}>{error}</div>}
      </>
    );
  }

  if (!freePayload) {
    return error ? <div className="nibshare-error-alert">{error}</div> : <p className="small muted">Loading…</p>;
  }

  return <ContentViewer body={freePayload.content} title={meta.title} slug={slug} />;
}

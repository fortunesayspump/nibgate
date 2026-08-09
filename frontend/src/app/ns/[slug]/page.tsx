'use client';

import { use, useEffect, useState } from 'react';
import UnlockGate from '@/features/nibshare/components/UnlockGate';
import ContentViewer from '@/features/nibshare/components/ContentViewer';
import Footer from '@/features/nibshare/components/Footer';
import { nibshareApi } from '@/features/nibshare/api';
import { formatLongDate, readTime } from '@/features/nibshare/lib/format';
import type { AccessPayload, ShareMeta } from '@/features/nibshare/types';
import '@/styles/nibshare.css';

const TYPE_LABELS: Record<string, string> = { article: 'Writing', photo: 'Photos', music: 'Music', video: 'Video', document: 'Docs' };
const TYPE_ICONS: Record<string, string> = { article: '✎', photo: '▣', music: '♫', video: '▶', document: '▤' };

export default function ShareViewPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const [meta, setMeta] = useState<ShareMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [freePayload, setFreePayload] = useState<AccessPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const m = await nibshareApi.meta(slug);
        if (cancelled) return;
        setMeta(m);
        if (m?.status === 'active') {
          nibshareApi.recordView(slug).catch(() => {});
        }
        const expired = m?.expiresAt && new Date(m.expiresAt).getTime() < Date.now();
        if (m?.status === 'active' && !(Number(m.price) > 0) && !expired) {
          try {
            const data = await nibshareApi.access(slug);
            if (!cancelled) setFreePayload(data);
          } catch (err: any) {
            if (!cancelled) setError(err?.message || 'Could not load this share.');
          }
        }
      } catch {
        if (!cancelled) setMeta(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  function clearPaid() {
    try { localStorage.removeItem(`nibgate:payment-proof:${slug}`); } catch {}
    setFreePayload(null);
    setError(null);
  }

  const shell = (children: React.ReactNode) => (
    <div className="nibshare-root min-h-screen px-5 py-10">
      {children}
      <Footer />
    </div>
  );

  if (loading) {
    return shell(<p className="small muted" style={{ textAlign: 'center' }}>Loading…</p>);
  }

  if (!meta || meta.status !== 'active') {
    return shell(
      <div className="wrap" style={{ maxWidth: 'var(--wrap-normal)', margin: '0 auto' }}>
        <h1 style={{ marginTop: 0, marginBottom: '0.5em' }}>Share not found</h1>
        <p className="small muted">This Nibshare link is broken or has been revoked.</p>
      </div>,
    );
  }

  const isExpired = !!meta.expiresAt && new Date(meta.expiresAt).getTime() < Date.now();
  const isPremium = Number(meta.price) > 0;
  const resource = { id: slug, title: meta.title, type: meta.contentType, price: meta.price, currency: meta.currency, path: `/ns/${slug}` };
  const body = freePayload?.content;
  const bodyMarkdown = typeof body === 'object' && body !== null && 'markdown' in body && typeof (body as { markdown?: unknown }).markdown === 'string'
    ? (body as { markdown: string }).markdown
    : typeof body === 'string' ? body : '';

  return shell(
    <article
      data-nibgate-resource
      data-nibgate-id={slug}
      data-nibgate-title={meta.title}
      data-nibgate-type={meta.contentType}
      data-nibgate-price={meta.price || ''}
      data-nibgate-path={`/ns/${slug}`}
    >
      <div className="wrap" style={{ maxWidth: 'var(--wrap-normal)', margin: '0 auto' }}>
        <div className="small muted font-ui" style={{ marginBottom: '0.5em' }}>
          {TYPE_ICONS[meta.contentType] || '✎'} {TYPE_LABELS[meta.contentType] || meta.contentType}
        </div>
        <h1 style={{ marginTop: 0, marginBottom: '0.15em' }}>{meta.title}</h1>
        <div className="small muted font-ui pn1" style={{ paddingTop: '0.75em' }}>
          <time>{formatLongDate(meta.createdAt)}</time>
          {meta.contentType === 'article' && bodyMarkdown && <> · <span className="reading-time">{readTime(bodyMarkdown)}</span></>}
        </div>
        {meta.summary && (meta.contentType === 'document' || !isPremium) && (
          <p className="small muted" style={{ marginTop: '1em', marginBottom: '2em' }}>{meta.summary}</p>
        )}
      </div>

      <div className="wrap">
        {meta.coverUrl && (isPremium || meta.contentType === 'photo' || meta.contentType === 'video') && (
          <img src={meta.coverUrl} alt={meta.title} style={{ width: '100%', height: 'auto', display: 'block', borderRadius: '6px', border: '1px solid var(--border)', marginBottom: '1.5rem' }} />
        )}
        {isExpired ? (
          <div className="nibshare-error-alert">This share has expired.</div>
        ) : isPremium ? (
          freePayload ? (
            <>
              <ContentViewer body={freePayload.content} title={meta.title} slug={slug} />
              <p className="small muted" style={{ marginTop: '1.5rem' }}>
                Unlocked
                {freePayload.payment?.txHash ? ` · tx ${freePayload.payment.txHash.slice(0, 10)}…` : ''}
                <button
                  onClick={clearPaid}
                  style={{ background: 'none', border: 'none', color: 'var(--muted)', textDecoration: 'underline', cursor: 'pointer', marginLeft: '8px', fontSize: 'inherit', fontFamily: 'inherit', padding: 0 }}
                >
                  Clear
                </button>
              </p>
            </>
          ) : (
            <UnlockGate resource={resource} />
          )
        ) : freePayload ? (
          <ContentViewer body={freePayload.content} title={meta.title} slug={slug} />
        ) : (
          <p className="small muted">Loading…</p>
        )}
        {!freePayload && error && <div className="nibshare-error-alert" style={{ marginTop: '1rem' }}>{error}</div>}
      </div>
    </article>,
  );
}

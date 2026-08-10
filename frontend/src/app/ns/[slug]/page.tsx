import type { Metadata } from 'next';
import { apiUrl } from '@/lib/api';
import ShareClient from '@/features/nibshare/components/ShareClient';
import Footer from '@/features/nibshare/components/Footer';
import { formatLongDate } from '@/features/nibshare/lib/format';
import type { ShareMeta } from '@/features/nibshare/types';
import '@/styles/nibshare.css';

const SITE_ORIGIN = process.env.NEXT_PUBLIC_SITE_URL || 'https://nibgate.xyz';
const TYPE_LABELS: Record<string, string> = { article: 'Writing', photo: 'Photos', music: 'Music', video: 'Video', document: 'Docs' };
const TYPE_ICONS: Record<string, string> = { article: '✎', photo: '▣', music: '♫', video: '▶', document: '▤' };

type Props = { params: Promise<{ slug: string }> };

async function fetchMeta(slug: string): Promise<ShareMeta | null> {
  try {
    const res = await fetch(apiUrl(`/api/nibshare/${slug}/meta`), { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return (await res.json()) as ShareMeta;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const meta = await fetchMeta(slug);
  if (!meta || meta.status !== 'active') {
    return { title: 'Share not found', description: 'This Nibshare link is broken or has been revoked.' };
  }
  return {
    title: meta.title,
    description: meta.summary || `Pay-per-view ${meta.contentType} on Nibgate.`,
    robots: { index: false, follow: false },
    alternates: { canonical: `/ns/${slug}` },
    openGraph: {
      title: meta.title,
      description: meta.summary || undefined,
      type: 'article',
      url: `/ns/${slug}`,
    },
    other: {
      'nibgate:title': meta.title,
      'nibgate:summary': meta.summary || '',
      'nibgate:content-type': meta.contentType,
      'nibgate:price': meta.price,
      'nibgate:currency': meta.currency,
      'nibgate:status': meta.status,
      'nibgate:expires-at': meta.expiresAt || '',
      'nibgate:access': apiUrl(`/api/nibshare/${slug}/access`),
      'nibgate:manifest': apiUrl(`/api/nibshare/${slug}/manifest`),
    },
  };
}

export default async function SharePage({ params }: Props) {
  const { slug } = await params;
  const meta = await fetchMeta(slug);

  const shell = (children: React.ReactNode) => (
    <div className="nibshare-root min-h-screen px-5 py-10">
      {children}
      <Footer />
    </div>
  );

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
  const manifestUrl = apiUrl(`/api/nibshare/${slug}/manifest`);
  const accessUrl = apiUrl(`/api/nibshare/${slug}/access`);
  const pageUrl = `${SITE_ORIGIN}/ns/${slug}`;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: meta.title,
    description: meta.summary || undefined,
    url: pageUrl,
    isAccessibleForFree: !isPremium,
    ...(meta.coverUrl ? { image: meta.coverUrl } : {}),
    'nibgate:contentType': meta.contentType,
    'nibgate:price': meta.price,
    'nibgate:currency': meta.currency,
    'nibgate:status': meta.status,
    'nibgate:expiresAt': meta.expiresAt || undefined,
    'nibgate:access': accessUrl,
    'nibgate:manifest': manifestUrl,
  };

  return shell(
    <article
      data-nibgate-resource
      data-nibgate-id={slug}
      data-nibgate-title={meta.title}
      data-nibgate-type={meta.contentType}
      data-nibgate-price={meta.price || ''}
      data-nibgate-path={`/ns/${slug}`}
      data-nibgate-manifest={manifestUrl}
    >
      <link rel="alternate" type="application/json" href={manifestUrl} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <div className="wrap" style={{ maxWidth: 'var(--wrap-normal)', margin: '0 auto' }}>
        <div className="small muted font-ui" style={{ marginBottom: '0.5em' }}>
          {TYPE_ICONS[meta.contentType] || '✎'} {TYPE_LABELS[meta.contentType] || meta.contentType}
        </div>
        <h1 style={{ marginTop: 0, marginBottom: '0.15em' }}>{meta.title}</h1>
        <div className="small muted font-ui pn1" style={{ paddingTop: '0.75em' }}>
          <time>{formatLongDate(meta.createdAt)}</time>
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
        ) : (
          <ShareClient slug={slug} meta={meta} />
        )}
      </div>
    </article>,
  );
}

import React from 'react';
import { getServerUser } from '@/lib/getServerUser';
import Link from 'next/link';

function TechStackCard({ header, children }: { header: string; children: React.ReactNode }) {
  return (
    <div className="nib-platform-card">
      <h4>{header}</h4>

      <p>{children}</p>
    </div>
  );
}

export default async function Page() {
  const [user] = await getServerUser();
  const isLoggedIn = !!user;

  return (
    <main>
      <section className="nib-platform-hero-shell">
        <div className="nib-platform-app-grid">
          <header className="nib-platform-hero-copy">
            <p className="nib-platform-eyebrow">Multipublisher creator platform</p>
            <h1 className="nib-platform-heading">Profiles, media drops, and Nibgate tracking.</h1>
            <p className="nib-platform-subheading">A social publishing app where every creator gets a route, wallet identity, content library, and metrics layer.</p>
          </header>

          <aside className="nib-platform-preview" aria-label="Creator platform preview">
            <div className="nib-platform-preview-header">
              <div>
                <p>Creator route</p>
                <h2>platform.com/@alice</h2>
              </div>
              <span>Wallet linked</span>
            </div>
            <div className="nib-platform-resource-list">
              <article>
                <span>Article</span>
                <strong>The paid essay drop</strong>
                <small>1,204 views · 86 unlocks</small>
              </article>
              <article>
                <span>Video</span>
                <strong>Studio session cut</strong>
                <small>$4.00 · receipts synced</small>
              </article>
              <article>
                <span>Music</span>
                <strong>Two-minute preview</strong>
                <small>onchain activity indexed</small>
              </article>
            </div>
            <div className="nib-platform-command">nibgate.publisher("@alice")</div>
          </aside>

          <div className="nib-platform-actions">
            <Link href={isLoggedIn ? '/feed' : '/login'} className="nib-platform-hero-button nib-platform-hero-button-primary">
              <span>{isLoggedIn ? 'Browse feed' : 'Start publishing'}</span>
              <svg className="nib-platform-arrow" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8.7 1.3 15.4 8l-6.7 6.7-1.4-1.4L11.6 9H.5V7h11.1L7.3 2.7l1.4-1.4Z" />
              </svg>
            </Link>
            <Link href="/discover" className="nib-platform-hero-button nib-platform-hero-button-secondary">
              <span>Discover creators</span>
              <svg className="nib-platform-arrow" viewBox="0 0 16 16" aria-hidden="true">
                <path d="M8.7 1.3 15.4 8l-6.7 6.7-1.4-1.4L11.6 9H.5V7h11.1L7.3 2.7l1.4-1.4Z" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      <section className="nib-platform-section">
        <div className="nib-platform-section-inner">
          <p className="nib-platform-section-kicker">Platform layer</p>
          <h2 className="nib-platform-section-title">A real social product wrapped around the package</h2>
          <div className="nib-platform-card-grid">
          {[
            {
              header: 'Creator Routes',
              details: 'Every publisher has a profile route that can map to a Nibgate publisher identity.',
            },
            {
              header: 'Social Feed',
              details: 'Posts, comments, replies, likes, follows, search, and notifications are already present.',
            },
            {
              header: 'Media Posts',
              details: 'Image and video uploads become the starting point for Nibgate resource metadata.',
            },
            {
              header: 'Wallet Layer',
              details: 'Next step: connect creator accounts to verified wallet-backed publisher records.',
            },
            {
              header: 'Manifests',
              details: 'Next step: expose platform and per-publisher resource manifests to the Hub.',
            },
            {
              header: 'Tracking',
              details: 'Next step: report views, unlocks, receipts, ratings, and onchain activity per creator.',
            },
          ].map(({ header, details }) => (
            <TechStackCard header={header} key={header}>
              {details}
            </TechStackCard>
          ))}
          </div>
        </div>
      </section>
    </main>
  );
}

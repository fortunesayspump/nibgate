import Link from 'next/link';
import React from 'react';
import { getServerUser } from '@/lib/getServerUser';
import { Feather } from '@/svg_components';
import { HomeMobileDropdownMenu } from './HomeMobileDropdownMenu';

function HomeNavLink({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <Link href={href} className="nib-platform-nav-link">
      {children}
    </Link>
  );
}

export default async function Layout({ children }: { children: React.ReactNode }) {
  const [user] = await getServerUser();
  const isLoggedIn = !!user;

  return (
    <div className="min-h-screen bg-[var(--nib-page-bg)]">
      <header className="nib-platform-header">
        <div className="nib-platform-header-inner">
          <Link href="/" title="Home page" className="nib-platform-logo" aria-label="Nibgate Platform home">
            <span className="nib-platform-logo-mark" aria-hidden="true">
              <Feather stroke="currentColor" />
            </span>
            <span className="nib-platform-logo-text">
              <span>Nibgate</span>
              <small>Creator Platform</small>
            </span>
          </Link>

          <div className="nib-platform-nav">
            <HomeNavLink href="/feed">Feed</HomeNavLink>
            <HomeNavLink href="/discover">Creators</HomeNavLink>
            <HomeNavLink href="/terms">Terms</HomeNavLink>
            {!isLoggedIn && (
              <>
                <HomeNavLink href="/login">Login</HomeNavLink>
                <Link href="/register" className="nib-platform-header-action">
                  Create profile
                </Link>
              </>
            )}
          </div>
          <div className="lg:hidden">
            <HomeMobileDropdownMenu />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}

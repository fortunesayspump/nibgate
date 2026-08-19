"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAppKitAccount } from "@nibgate/wallet/react";
import { BarChart3, CircleDollarSign, FileLock2, Globe2, Menu, Newspaper, UserRound, X } from "lucide-react";

const BLOG_OWNER_WALLET = '0x558e7bfaf2cf1a494f44e50d92431afc060c9d12';

function primaryWalletAddress(user: any) {
  return String(user?.wallets?.find((wallet: any) => wallet.isPrimary)?.address || user?.wallets?.[0]?.address || user?.walletAddress || '').toLowerCase();
}

function normalizeWallet(address?: string | null) {
  return String(address || "").trim().toLowerCase();
}

const navLinks = [
  { name: 'Profile', description: 'Creator setup', path: '/dashboard/profile', id: 'profile', Icon: UserRound },
  { name: 'Sites', description: 'Connected origins', path: '/dashboard/sites', id: 'sites', Icon: Globe2 },
  { name: 'Contents', description: 'Protected routes', path: '/dashboard/contents', id: 'contents', Icon: FileLock2 },
  { name: 'Analytics', description: 'Views and unlocks', path: '/dashboard/analytics', id: 'analytics', Icon: BarChart3 },
  { name: 'Earnings', description: 'Revenue flow', path: '/dashboard/earnings', id: 'earnings', Icon: CircleDollarSign },
  { name: 'Blog', description: 'Product posts', path: '/dashboard/blog', id: 'blog', Icon: Newspaper }
];

export default function DashboardSidebar({ isMobileOpen, onMobileClose }: { isMobileOpen?: boolean; onMobileClose?: () => void }) {
  const pathname = usePathname();
  const appKitAccount = useAppKitAccount();
  const [canPublishBlog, setCanPublishBlog] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function checkBlogAccess() {
      const liveWalletAddress = normalizeWallet(appKitAccount.address);
      if (liveWalletAddress === BLOG_OWNER_WALLET) { setCanPublishBlog(true); return; }
      try {
        const res = await fetch("/auth/me", { credentials: "include" });
        if (!res.ok) return;
        const data = await res.json();
        const walletAddress = primaryWalletAddress(data.user);
        if (!cancelled) setCanPublishBlog(walletAddress === BLOG_OWNER_WALLET);
      } catch { if (!cancelled) setCanPublishBlog(false); }
    }
    void checkBlogAccess();
    return () => { cancelled = true; };
  }, [appKitAccount.address]);

  const visibleLinks = navLinks.filter((link) => link.id !== "blog" || canPublishBlog);

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && <div className="dashboard-mobile-overlay" onClick={onMobileClose} />}

      <nav aria-label="Main" className={`flex flex-col dashboard-sidebar ${isMobileOpen ? 'mobile-open' : ''}`} style={{ background: 'var(--nib-page-bg)' }}>
        {/* Mobile close button */}
        <button className="dashboard-mobile-close" onClick={onMobileClose} aria-label="Close sidebar">
          <X size={20} />
        </button>

        {visibleLinks.map((link, index) => {
          const isActive = pathname === link.path || pathname.startsWith(link.path + '/');
          const Icon = link.Icon;
          return (
            <Link
              key={link.id}
              title={link.name}
              href={link.path}
              className={`dashboard-box box-${index} flex-1 no-underline w-full h-full ${isActive ? 'active' : ''}`}
              data-tab={link.id}
              onClick={onMobileClose}
            >
              <Icon className="dashboard-box-icon" aria-hidden="true" strokeWidth={1.8} />
              <span className="dashboard-box-label">{link.name}</span>
              <span className="dashboard-box-description">{link.description}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

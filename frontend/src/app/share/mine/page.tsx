'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAppKitAccount, useAppKitProvider, signMessageWithProvider } from "@nibgate/wallet/react";
import type { Eip1193Provider } from "@nibgate/wallet";
import { FiPlus, FiEdit2, FiSearch } from 'react-icons/fi';
import { ShareLayout, ShareBtn, ShareIntro, ShareError } from '@/features/nibshare/components/ShareLayout';
import ActivityBell from '@/features/nibshare/components/ActivityBell';
import ShareWallet from '@/features/nibshare/components/ShareWallet';
import { useNibgateConnect } from '@/lib/useNibgateConnect';
import { HUB_SESSION_UPDATED_EVENT } from '@/lib/hubSession';
import { signInWithSiwe } from '@/lib/siweAuth';
import { PostRow } from '@/features/nibshare/components/mine/PostRow';
import { SettingsSheet } from '@/features/nibshare/components/mine/SettingsSheet';
import { nibshareApi } from '@/features/nibshare/api';
import { isEnded } from '@/features/nibshare/lib/shares';
import type { ShareSummary, ShareActivity } from '@/features/nibshare/types';

type ViewFilter = 'all' | 'active' | 'ended' | 'drafts';

export default function ShareMinePage() {
  const router = useRouter();
  const { connect, busy: connecting, error: connectError } = useNibgateConnect();
  const { address, isConnected } = useAppKitAccount();
  const { walletProvider } = useAppKitProvider<Eip1193Provider>("eip155");
  const [shares, setShares] = useState<ShareSummary[]>([]);
  const [activity, setActivity] = useState<ShareActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<'checking' | 'authed' | 'guest'>('checking');
  const [publishing, setPublishing] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [settingsFor, setSettingsFor] = useState<ShareSummary | null>(null);
  const [view, setView] = useState<ViewFilter>('all');
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await nibshareApi.listMine();
      setShares(data.shares || []);
      setActivity(data.activity || []);
      setError(null);
    } catch (err: any) {
      if (err.status === 401) setSession('guest');
      else setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const data = await nibshareApi.me();
        if (cancelled) return;
        if (data.authenticated) {
          setSession('authed');
          await load();
        } else {
          setSession('guest');
          setLoading(false);
        }
      } catch {
        if (!cancelled) setSession('guest');
      }
    }
    void check();
    window.addEventListener(HUB_SESSION_UPDATED_EVENT, check);
    return () => {
      cancelled = true;
      window.removeEventListener(HUB_SESSION_UPDATED_EVENT, check);
    };
  }, [load]);

  async function handleAuth() {
    if (!address) {
      setError('Wallet not connected — tap "Connect wallet" first.');
      return;
    }
    try {
      setError(null);
      if (!walletProvider || typeof walletProvider.request !== "function") {
        throw new Error("Wallet provider is not available. Reconnect your wallet and try again.");
      }
      await signInWithSiwe(address as `0x${string}`, (message) => signMessageWithProvider(walletProvider, address, message) as Promise<`0x${string}`>);
      setSession('authed');
      window.dispatchEvent(new Event(HUB_SESSION_UPDATED_EVENT));
      await load();
    } catch (err: any) {
      const msg = err?.message || 'Signing failed';
      const expired = msg.toLowerCase().includes('session expired') || msg.toLowerCase().includes('nonce');
      setError(
        expired
          ? 'Your sign-in request expired — sign again below.'
          : `${msg}. If your wallet did not show a signature request, allow popups for nibgate.xyz and try again.`
      );
    }
  }

  // SettingsSheet already persisted the revoke (DELETE) before calling back;
  // this handler only drops the row from the local list — no second DELETE.
  function handleRevoke(slug: string) {
    setShares((prev) => prev.filter((s) => s.slug !== slug));
  }

  function handleRotate(oldSlug: string, newSlug: string, url: string) {
    setShares((prev) => prev.map((s) => (s.slug === oldSlug ? { ...s, slug: newSlug, url } : s)));
  }

  async function handlePublish(slug: string) {
    if (publishing.has(slug)) return;
    setPublishing((prev) => new Set(prev).add(slug));
    try {
      await nibshareApi.publish(slug);
      setShares((prev) => prev.map((s) => (s.slug === slug ? { ...s, status: "active" } : s)));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to publish");
    } finally {
      setPublishing((prev) => { const next = new Set(prev); next.delete(slug); return next; });
    }
  }

  if (loading || session === 'checking') {
    return (
      <ShareLayout tight backHref="/" backLabel="Back to Hub" right={<ShareWallet />}>
        <div className="flex min-h-screen items-center justify-center text-sm" style={{ color: "var(--muted)" }}>Loading...</div>
      </ShareLayout>
    );
  }

  if (session === 'guest') {
    return (
      <ShareLayout tight backHref="/" backLabel="Back to Hub" right={<ShareWallet />}>
        <h1 className="text-lg font-semibold tracking-tight mt-5">Posts</h1>
        <div style={{ marginTop: '1rem' }}>
          <ShareIntro>Connect your wallet to see your posts.</ShareIntro>
          {connectError && <div style={{ marginTop: '0.75rem' }}><ShareError>{connectError}</ShareError></div>}
          {!isConnected ? (
            <ShareBtn onClick={() => void connect()} style={{ marginTop: '1rem' }} disabled={connecting}>
              {connecting ? 'Connecting...' : 'Connect wallet'}
            </ShareBtn>
          ) : (
            <>
              <ShareBtn onClick={handleAuth} style={{ marginTop: '1rem' }}>Sign with wallet</ShareBtn>
              {error && <p className="text-xs" style={{ color: '#c44', marginTop: '0.5rem' }}>{error}</p>}
            </>
          )}
        </div>
      </ShareLayout>
    );
  }

  if (error) {
    return (
      <ShareLayout tight backHref="/" backLabel="Back to Hub" right={<ShareWallet />}>
        <h1 className="text-lg font-semibold tracking-tight mt-5">Posts</h1>
        <p className="text-xs" style={{ color: '#c44', marginTop: '0.75rem' }}>{error}</p>
      </ShareLayout>
    );
  }

  const published = shares.filter((s) => s.status !== "draft");
  const drafts = shares.filter((s) => s.status === "draft");
  const active = published.filter((s) => !isEnded(s));
  const ended = published.filter((s) => isEnded(s));
  let visible = view === "drafts" ? drafts : view === "all" ? published : view === "active" ? active : ended;
  const q = search.trim().toLowerCase();
  if (q) visible = visible.filter((s) => s.title.toLowerCase().includes(q) || s.slug.includes(q));

  return (
    <ShareLayout tight backHref="/" backLabel="Back to Hub" right={<ShareWallet />}>
      <div className="flex items-center justify-between mt-5 mb-4">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Posts</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--muted)" }}>{published.length} post{published.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <ActivityBell activity={activity} />
          <Link href="/share" className="no-underline inline-flex items-center justify-center w-9 h-9 rounded-md border cursor-pointer" style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }} title="New Post">
            <FiPlus size={18} />
          </Link>
        </div>
      </div>

      <div className="flex gap-1 p-1 rounded-lg border mb-4" style={{ borderColor: "var(--border)", background: "var(--surface)" }}>
        {(["all", "active", "ended"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setView(t)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 rounded-md cursor-pointer transition-colors"
            style={view === t ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}
          >
            <span className="capitalize">{t}</span>
            <span style={{ opacity: 0.8 }}>{t === "all" ? published.length : t === "active" ? active.length : ended.length}</span>
          </button>
        ))}
        <div className="w-px self-stretch my-1" style={{ background: "var(--border)" }} />
        <button
          onClick={() => setView("drafts")}
          className="inline-flex items-center justify-center gap-1.5 text-xs font-medium py-1.5 px-3 rounded-md cursor-pointer transition-colors"
          style={view === "drafts" ? { background: "var(--accent)", color: "#fff" } : { color: "var(--muted)" }}
          title="Drafts"
        >
          <FiEdit2 size={12} /> Drafts
          <span style={{ opacity: 0.8 }}>{drafts.length}</span>
        </button>
      </div>

      {shares.length > 8 && (
        <div className="relative mb-3">
          <FiSearch className="absolute left-3 top-1/2 -translate-y-1/2" size={13} style={{ color: "var(--muted)" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search posts…"
            className="w-full text-xs px-3 py-2 rounded-md border pl-9"
            style={{ borderColor: "var(--border)", background: "var(--surface)", color: "var(--fg)" }}
          />
        </div>
      )}

      <div className="flex flex-col gap-px">
        {shares.length === 0 ? (          <div className="py-10 text-center">
            <p className="text-sm" style={{ color: "var(--muted)" }}>No posts yet.</p>
            <Link href="/share" className="btn-ghost no-underline inline-flex mt-2 text-xs">Create your first post</Link>
          </div>
        ) : visible.length === 0 ? (
          <p className="text-xs py-8 text-center" style={{ color: "var(--muted)" }}>No {view === "drafts" ? "drafts" : `${view} posts`}.</p>
        ) : (
          visible.map((share) => (
            <PostRow key={share.id} share={share} onSettings={() => setSettingsFor(share)} onPublish={handlePublish} publishing={publishing.has(share.slug)} />
          ))
        )}
      </div>
      {settingsFor && <SettingsSheet share={settingsFor} onClose={() => setSettingsFor(null)} onRotate={handleRotate} onRevoke={handleRevoke} />}
    </ShareLayout>
  );
}

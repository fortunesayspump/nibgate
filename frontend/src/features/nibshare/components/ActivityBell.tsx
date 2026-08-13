'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useAccount } from "@nibgate/wallet/react";
import { FiBell, FiUnlock, FiEye, FiLock, FiClock, FiX } from 'react-icons/fi';
import type { ShareActivity } from '../types';

function timeLabel(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const abs = Math.abs(diff);
  if (diff < 0) {
    if (abs < 3600e3) return `in ${Math.max(1, Math.floor(abs / 60e3))}m`;
    if (abs < 86400e3) return `in ${Math.floor(abs / 3600e3)}h`;
    return `in ${Math.floor(abs / 86400e3)}d`;
  }
  if (abs < 60e3) return `${Math.floor(abs / 1e3)}s ago`;
  if (abs < 3600e3) return `${Math.floor(abs / 60e3)}m ago`;
  if (abs < 86400e3) return `${Math.floor(abs / 3600e3)}h ago`;
  return `${Math.floor(abs / 86400e3)}d ago`;
}

const TYPE_META = {
  unlock: { Icon: FiUnlock, color: 'var(--accent)', verb: 'unlocked' },
  view: { Icon: FiEye, color: '#6d7a9a', verb: 'viewed' },
  revoke: { Icon: FiLock, color: '#b45309', verb: 'revoked access' },
  ban: { Icon: FiLock, color: '#c44', verb: 'banned' },
  expiring: { Icon: FiClock, color: '#c4a060', verb: 'expires' },
  expired: { Icon: FiClock, color: '#c44', verb: 'expired' },
};

export default function ActivityBell({ activity }: { activity: ShareActivity[] }) {
  const { address } = useAccount();
  const [open, setOpen] = useState(false);
  const [lastSeen, setLastSeen] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  const storageKey = address ? `nibshare-bell-seen-${address.toLowerCase()}` : null;

  useEffect(() => {
    if (!storageKey) return;
    setLastSeen(Number(localStorage.getItem(storageKey) || 0));
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const unseen = activity.filter((a) => new Date(a.createdAt).getTime() > lastSeen).length;

  function handleOpen() {
    const next = Date.now();
    setOpen(true);
    setLastSeen(next);
    if (storageKey) localStorage.setItem(storageKey, String(next));
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        onClick={handleOpen}
        className="inline-flex items-center justify-center w-9 h-9 rounded-md border cursor-pointer relative"
        style={{ borderColor: "var(--border)", background: "transparent" }}
        title="Notifications"
      >
        <FiBell size={17} />
        {unseen > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full inline-flex items-center justify-center text-white font-semibold" style={{ background: "#c44", fontSize: 9 }}>
            {unseen > 99 ? "99+" : unseen}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border shadow-xl z-50 overflow-hidden nibshare-root" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
          <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
            <span className="text-xs font-semibold">Recent activity</span>
            <button onClick={() => setOpen(false)} className="inline-flex items-center justify-center w-5 h-5 rounded" style={{ color: "var(--muted)" }} title="Close">
              <FiX size={13} />
            </button>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {activity.length === 0 ? (
              <p className="text-xs py-6 text-center" style={{ color: "var(--muted)" }}>No activity yet.</p>
            ) : (
              activity.map((a) => {
                const meta = TYPE_META[a.type] || TYPE_META.view;
                const Icon = meta.Icon;
                const isNew = new Date(a.createdAt).getTime() > lastSeen;
                return (
                  <div key={a.key} className="flex items-start gap-2 px-3 py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)", background: isNew ? "var(--surface)" : "transparent" }}>
                    <span className="shrink-0" style={{ color: meta.color, marginTop: 2 }}><Icon size={13} /></span>
                    <div className="min-w-0 flex-1">
                      <Link href={`/ns/${a.slug}`} className="no-underline text-xs font-medium truncate block" style={{ color: "var(--fg)" }}>
                        {a.title}
                      </Link>
                      <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--muted)" }}>
                        {a.type === "expiring" ? "expires" : meta.verb} {timeLabel(a.createdAt)}
                        {a.type === "unlock" && a.wallet ? ` · ${a.wallet.slice(0, 6)}…${a.wallet.slice(-4)}` : ""}
                        {a.type === "revoke" && a.wallet ? ` for ${a.wallet.slice(0, 6)}…${a.wallet.slice(-4)}` : ""}
                      </p>
                    </div>
                    {a.type === "unlock" && (
                      <span className="text-[11px] font-mono font-medium shrink-0" style={{ color: "var(--accent)" }}>
                        {(Number(a.amount) || 0).toFixed(2)} USDC
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

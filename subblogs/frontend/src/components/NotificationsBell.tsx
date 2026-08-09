"use client";

import { useEffect, useRef, useState } from "react";
import { apiAuthFetch } from "@/lib/api";
import { FiBell, FiX, FiEye, FiUnlock, FiCreditCard, FiStar } from "react-icons/fi";

type Activity = {
  type: string;
  id: string;
  contentTitle: string;
  amount?: number;
  revenue?: number;
  score?: number;
  timestamp: string;
  txHash?: string;
  payerWallet?: string | null;
};

const SEEN_KEY = "subblog-bell-seen";

function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const TYPE_META: Record<string, { label: string; Icon: React.ComponentType<{ size?: number }>; color: string }> = {
  view: { label: "View", Icon: FiEye, color: "#6d7a9a" },
  unlock: { label: "Unlock", Icon: FiUnlock, color: "#7c9a6d" },
  payment: { label: "Payment", Icon: FiCreditCard, color: "#9a6d8a" },
  rating: { label: "Rating", Icon: FiStar, color: "#c4a060" },
};

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [totals, setTotals] = useState<{ views: number; unlocks: number; payments: number; ratings: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSeen, setLastSeen] = useState(() => Number(localStorage.getItem(SEEN_KEY) || 0));
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    apiAuthFetch<{ success: boolean; activities: Activity[]; totals: typeof totals }>("/blog/admin/activity")
      .then((data) => {
        if (cancelled) return;
        setActivities(data.activities || []);
        setTotals(data.totals || null);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

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

  function handleOpen() {
    const next = Date.now();
    setOpen(true);
    setLastSeen(next);
    localStorage.setItem(SEEN_KEY, String(next));
  }

  const unseen = activities.filter((a) => new Date(a.timestamp).getTime() > lastSeen).length;
  const typeLabel: Record<string, string> = { view: "View", unlock: "Unlock", payment: "Payment", rating: "Rating" };

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
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full inline-flex items-center justify-center text-[10px] font-semibold text-white" style={{ background: "#c44", fontSize: 9 }}>
            {unseen > 99 ? "99+" : unseen}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-lg border shadow-xl z-50 overflow-hidden" style={{ borderColor: "var(--border)", background: "var(--bg)" }}>
          <div className="flex items-center justify-between px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
            <span className="text-xs font-semibold">Recent activity</span>
            <button onClick={() => setOpen(false)} className="inline-flex items-center justify-center w-5 h-5 rounded" style={{ color: "var(--muted)" }} title="Close">
              <FiX size={13} />
            </button>
          </div>

          {totals && (
            <div className="flex gap-1.5 flex-wrap px-3 py-2 border-b" style={{ borderColor: "var(--border)" }}>
              {[
                { label: "Views", value: totals.views },
                { label: "Unlocks", value: totals.unlocks },
                { label: "Payments", value: totals.payments },
                { label: "Ratings", value: totals.ratings },
              ].map((s) => (
                <span key={s.label} className="text-[11px] px-1.5 py-0.5 rounded" style={{ background: "var(--surface)", color: "var(--muted)" }}>
                  {s.label} <strong style={{ color: "var(--fg)" }}>{s.value}</strong>
                </span>
              ))}
            </div>
          )}

          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="text-xs py-6 text-center" style={{ color: "var(--muted)" }}>Loading activity...</p>
            ) : activities.length === 0 ? (
              <p className="text-xs py-6 text-center" style={{ color: "var(--muted)" }}>No activity yet.</p>
            ) : (
              activities.map((a) => {
                const meta = TYPE_META[a.type] || { label: a.type, Icon: FiEye, color: "var(--muted)" };
                const Icon = meta.Icon;
                const val =
                  a.type === "payment" ? `${a.amount} USDC` :
                  a.type === "unlock" && a.revenue ? `${a.revenue} USDC` :
                  a.type === "rating" && a.score ? `${"★".repeat(a.score)}` :
                  null;
                const isNew = new Date(a.timestamp).getTime() > lastSeen;
                return (
                  <div key={a.id} className="flex items-start gap-2 px-3 py-2 border-b last:border-b-0" style={{ borderColor: "var(--border)", background: isNew ? "var(--surface)" : "transparent" }}>
                    <span className="shrink-0" style={{ color: meta.color, marginTop: 2 }}><Icon size={13} /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs leading-snug">
                        <span style={{ color: meta.color }}>{typeLabel[a.type] || a.type}</span>
                        <span style={{ color: "var(--muted)" }}> on </span>
                        <span className="font-medium truncate">{a.contentTitle || "—"}</span>
                      </p>
                      <p className="text-[10px] mt-0.5 truncate" style={{ color: "var(--muted)" }}>
                        {timeAgo(a.timestamp)}
                        {a.type === "payment" && a.payerWallet ? ` · ${a.payerWallet.slice(0, 6)}…${a.payerWallet.slice(-4)}` : ""}
                      </p>
                    </div>
                    {val && <span className="text-[11px] font-mono font-medium shrink-0" style={{ color: a.type === "rating" ? meta.color : "#7c9a6d" }}>{val}</span>}
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

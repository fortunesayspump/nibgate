"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Activity = {
  type: string;
  id: string;
  contentTitle: string;
  domain: string;
  amount?: number;
  revenue?: number;
  score?: number;
  timestamp: string;
  txHash?: string;
  proof?: string;
};

export default function MiniLedger() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [totals, setTotals] = useState({ views: 0, unlocks: 0, payments: 0, ratings: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const site = await apiFetch<{ hub?: { siteId: string; token: string }; domain?: string }>("/site");
        const domain = site?.domain;
        if (!domain) { setLoading(false); return; }

        const res = await fetch(
          `https://api.nibgate.xyz/api/hub/ledger?domain=${encodeURIComponent(domain)}&limit=10`
        );
        const data = await res.json();
        if (!cancelled && data.success) {
          setActivities(data.activities || []);
          if (data.totals) setTotals(data.totals);
        }
      } catch {} finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div className="text-xs" style={{ color: "var(--muted)" }}>Loading activity...</div>;
  }

  function ta(d: string) {
    const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  }

  const typeLabel: Record<string, string> = { view: "View", unlock: "Unlock", payment: "Payment", rating: "Rating" };

  return (
    <div className="mt-8" style={{ borderTop: "1px solid var(--border)", paddingTop: "1.5rem" }}>
      <h2 className="text-sm font-semibold tracking-tight mb-3">Recent activity</h2>

      <div className="flex gap-2 flex-wrap mb-4">
        {[
          { label: "Views", value: totals.views },
          { label: "Unlocks", value: totals.unlocks },
          { label: "Payments", value: totals.payments },
          { label: "Ratings", value: totals.ratings },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border px-2.5 py-1.5 text-xs" style={{ borderColor: "var(--border)" }}>
            <span style={{ color: "var(--muted)" }}>{s.label}</span>
            <strong className="ml-1.5">{s.value}</strong>
          </div>
        ))}
      </div>

      {activities.length === 0 ? (
        <p className="text-xs" style={{ color: "var(--muted)" }}>No activity yet.</p>
      ) : (
        <div className="flex flex-col gap-px">
          {activities.map((a) => {
            const val =
              a.type === "payment" ? `${a.amount} USDC` :
              a.type === "unlock" && a.revenue ? `${a.revenue} USDC` :
              a.type === "rating" && a.score ? `${"★".repeat(a.score)}` :
              null;
            return (
              <div key={a.id} className="flex items-center justify-between py-1.5 border-b text-xs" style={{ borderColor: "var(--border)" }}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="shrink-0 font-medium" style={{ color: "var(--accent)" }}>{typeLabel[a.type] || a.type}</span>
                  <span className="truncate" style={{ color: "var(--muted)" }}>{a.contentTitle || "—"}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {val && <span className="font-mono">{val}</span>}
                  <span style={{ color: "var(--muted)" }}>{ta(a.timestamp)}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

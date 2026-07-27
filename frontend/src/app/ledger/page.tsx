"use client";

import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import Link from "next/link";

type Activity = {
  type: "view" | "unlock" | "payment" | "rating";
  actor: string;
  contentTitle: string;
  contentUrl: string;
  contentId: string;
  price?: number;
  currency?: string;
  score?: number;
  txHash?: string;
  timestamp: string;
};

const TYPE_ICONS: Record<string, string> = {
  view: "👁",
  unlock: "🔓",
  payment: "💳",
  rating: "⭐",
};

const TYPE_LABELS: Record<string, string> = {
  view: "viewed",
  unlock: "unlocked",
  payment: "paid for",
  rating: "rated",
};

function timeAgo(date: string) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function blockExplorerUrl(txHash: string) {
  return `https://testnet.arc.io/tx/${txHash}`;
}

export default function LedgerPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("");

  const fetchLedger = useCallback(async () => {
    try {
      const url = `/api/hub/ledger?limit=100${filter ? `&type=${filter}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) setActivities(data.activities || []);
    } catch {} finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchLedger();
    const interval = setInterval(fetchLedger, 30000);
    return () => clearInterval(interval);
  }, [fetchLedger]);

  return (
    <>
      <Header />
      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Network Ledger</h1>
          <p className="text-[var(--nib-ink-soft)]">
            Live activity across the Nibgate network — views, unlocks, payments, and ratings.
          </p>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {["", "views", "unlocks", "payments", "ratings"].map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={`px-4 py-1.5 rounded-full text-sm border transition ${
                filter === t
                  ? "bg-[var(--nib-olive)] text-black border-[var(--nib-olive)]"
                  : "bg-transparent text-[var(--nib-ink)] border-[var(--nib-border-soft)] hover:border-[var(--nib-olive)]"
              }`}
            >
              {t || "All"}
            </button>
          ))}
        </div>

        {/* Activity Feed */}
        {loading ? (
          <p className="text-[var(--nib-ink-soft)]">Loading...</p>
        ) : activities.length === 0 ? (
          <p className="text-[var(--nib-ink-soft)]">No activity yet.</p>
        ) : (
          <div className="space-y-3">
            {activities.map((a, i) => (
              <div
                key={`${a.type}-${a.timestamp}-${i}`}
                className="flex items-start gap-3 p-4 rounded-lg border border-[var(--nib-border-soft)] bg-[var(--nib-surface)]"
              >
                <span className="text-xl mt-0.5">{TYPE_ICONS[a.type]}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium">{a.actor}</span>{" "}
                    <span className="text-[var(--nib-ink-soft)]">{TYPE_LABELS[a.type]}</span>{" "}
                    <Link
                      href={a.contentUrl || "#"}
                      className="font-medium underline underline-offset-2 decoration-[var(--nib-border-soft)] hover:decoration-[var(--nib-olive)]"
                      target="_blank"
                    >
                      {a.contentTitle}
                    </Link>
                    {a.type === "unlock" && a.price && (
                      <span className="text-[var(--nib-ink-soft)]">
                        {" "}for {a.price} {a.currency}
                      </span>
                    )}
                    {a.type === "payment" && a.price && (
                      <span className="text-[var(--nib-ink-soft)]">
                        {" "}{a.price} {a.currency}
                      </span>
                    )}
                    {a.type === "rating" && a.score && (
                      <span className="text-yellow-500"> {"★".repeat(a.score)}{"☆".repeat(5 - a.score)}</span>
                    )}
                  </p>
                  <div className="flex gap-3 mt-1 text-xs text-[var(--nib-ink-soft)]">
                    <span>{timeAgo(a.timestamp)}</span>
                    {a.txHash && (
                      <a
                        href={blockExplorerUrl(a.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 hover:text-[var(--nib-olive)]"
                      >
                        tx {a.txHash.slice(0, 8)}...{a.txHash.slice(-4)}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-xs text-[var(--nib-ink-soft)] text-center">
          Ledger auto-refreshes every 30 seconds. Payments with on-chain tx hashes link to the Arc Testnet explorer.
        </p>
      </main>
    </>
  );
}

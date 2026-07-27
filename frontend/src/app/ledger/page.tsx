"use client";

import { useEffect, useState, useCallback } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";

type Activity = {
  type: "view" | "unlock" | "payment" | "rating";
  actor: string;
  contentTitle: string;
  contentUrl: string;
  contentId: string;
  timestamp: string;
  id: string;
  websiteId?: string;
  domain?: string;
  currency?: string;
  referrer?: string;
  durationMs?: number;
  revenue?: number;
  amount?: number;
  txHash?: string;
  paymentId?: string;
  paymentProvider?: string;
  chainId?: string;
  network?: string;
  receiptUrl?: string;
  recipientWallet?: string;
  payerWallet?: string;
  status?: string;
  score?: number;
  walletAddress?: string;
  proofType?: string;
  proof?: string;
};

const TYPE_ICONS: Record<string, string> = { view: "👁", unlock: "🔓", payment: "💳", rating: "⭐" };

function timeAgo(date: string) {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function blockExplorerUrl(txHash: string) {
  return `https://testnet.arc.io/tx/${txHash}`;
}

function shorten(s: string, len = 8) {
  return s.length > len + 4 ? `${s.slice(0, len)}...${s.slice(-4)}` : s;
}

export default function LedgerPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

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
      <div className="explore-page-shell">
        <main className="explore-body explore-main" role="main">
          <div className="explore-content">
            <div className="explore-header">
              <h1 className="explore-title">Network Ledger</h1>
              <p className="explore-subtitle">
                Live activity across the Nibgate network — every view, unlock, payment, and rating is recorded with verifiable proofs.
              </p>
            </div>

            <div className="flex gap-2 mb-6 flex-wrap">
              {["", "views", "unlocks", "payments", "ratings"].map((t) => (
                <button
                  key={t}
                  onClick={() => setFilter(t)}
                  className={`px-3 py-1 rounded text-xs font-medium border transition ${
                    filter === t
                      ? "bg-[var(--nib-olive)] text-black border-[var(--nib-olive)]"
                      : "bg-transparent text-[var(--nib-ink)] border-[var(--nib-border-soft)] hover:border-[var(--nib-olive)]"
                  }`}
                >
                  {t || "All"}
                </button>
              ))}
            </div>

            {loading ? (
              <p className="text-[var(--nib-ink-soft)] text-sm">Loading...</p>
            ) : activities.length === 0 ? (
              <p className="text-[var(--nib-ink-soft)] text-sm">No activity yet.</p>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--nib-ink-soft)] text-xs uppercase tracking-wider">
                      <th className="pb-3 pr-3 font-medium">Type</th>
                      <th className="pb-3 pr-3 font-medium">Time</th>
                      <th className="pb-3 pr-3 font-medium">Content</th>
                      <th className="pb-3 pr-3 font-medium">Actor</th>
                      <th className="pb-3 pr-3 font-medium">Value</th>
                      <th className="pb-3 pr-3 font-medium">Proof</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activities.map((a, i) => (
                      <tr key={`${a.id}-${i}`} className="border-t border-[var(--nib-border-soft)] hover:bg-[var(--nib-surface)] transition-colors">
                        <td className="py-3 pr-3 whitespace-nowrap">
                          <span title={a.type}>{TYPE_ICONS[a.type]}</span>
                        </td>
                        <td className="py-3 pr-3 whitespace-nowrap text-[var(--nib-ink-soft)] font-mono text-xs">
                          {timeAgo(a.timestamp)}
                        </td>
                        <td className="py-3 pr-3 min-w-[200px]">
                          <Link href={a.contentUrl || "#"} target="_blank" className="underline underline-offset-2 decoration-[var(--nib-border-soft)] hover:decoration-[var(--nib-olive)]">
                            {a.contentTitle.length > 40 ? `${a.contentTitle.slice(0, 40)}...` : a.contentTitle}
                          </Link>
                          <div className="text-[var(--nib-ink-soft)] text-xs font-mono mt-0.5">
                            {a.domain && <span>{a.domain}</span>}
                          </div>
                        </td>
                        <td className="py-3 pr-3 whitespace-nowrap font-mono text-xs" title={a.actor}>
                          {a.actor.length > 20 ? shorten(a.actor) : a.actor}
                        </td>
                        <td className="py-3 pr-3 whitespace-nowrap font-mono text-xs">
                          {a.type === "payment" && <span>{a.amount} {a.currency}</span>}
                          {a.type === "unlock" && a.revenue ? <span>{a.revenue} {a.currency}</span> : null}
                          {a.type === "rating" && a.score ? <span className="text-yellow-500">{"★".repeat(a.score)}</span> : null}
                          {a.type === "view" && a.durationMs ? <span>{(a.durationMs / 1000).toFixed(0)}s</span> : null}
                        </td>
                        <td className="py-3 pr-3 whitespace-nowrap font-mono text-xs">
                          {a.txHash ? (
                            <a href={blockExplorerUrl(a.txHash)} target="_blank" rel="noopener noreferrer"
                               className="underline underline-offset-2 text-[var(--nib-olive)]"
                               title={`Chain: ${a.chainId || "?"} | ${a.network || ""}`}>
                              tx {shorten(a.txHash, 6)}
                            </a>
                          ) : a.paymentId ? (
                            <span title={a.paymentId}>pid {shorten(a.paymentId, 6)}</span>
                          ) : a.proof ? (
                            <span title={a.proof}>{shorten(a.proof, 10)}</span>
                          ) : a.id ? (
                            <span className="text-[var(--nib-ink-soft)]" title={a.id}>#{shorten(a.id, 4)}</span>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-8 text-xs text-[var(--nib-ink-soft)] text-center max-w-lg mx-auto leading-relaxed">
              Every entry has a unique ID. Payments show on-chain tx hashes (Arc Testnet). Ratings show signed or on-chain proofs. All data is permanently stored — fully verifiable and cross-referencable.
            </p>
          </div>
        </main>
        <Footer showThemeToggle={true} />
      </div>
    </>
  );
}

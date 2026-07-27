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
  timestamp: string;
  id: string;
  websiteId?: string;
  domain?: string;
  currency?: string;
  // View
  referrer?: string;
  durationMs?: number;
  // Unlock
  revenue?: number;
  // Payment
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
  // Rating
  score?: number;
  walletAddress?: string;
  proofType?: string;
  proof?: string;
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
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-xs text-[var(--nib-ink-soft)] font-mono">
                    <span>{timeAgo(a.timestamp)}</span>
                    {a.domain && <span>{a.domain}</span>}
                    {a.id && <span title={a.id}>#{a.id.slice(0, 8)}</span>}

                    {a.type === "view" && a.referrer && <span title={a.referrer}>ref: {a.referrer.slice(0, 30)}</span>}
                    {a.type === "view" && a.durationMs && <span>{(a.durationMs / 1000).toFixed(0)}s</span>}

                    {a.type === "unlock" && a.revenue && <span>{a.revenue} {a.currency}</span>}

                    {a.type === "payment" && (
                      <>
                        <span>{a.amount} {a.currency}</span>
                        {a.txHash && (
                          <a href={blockExplorerUrl(a.txHash)} target="_blank" rel="noopener noreferrer"
                             className="underline underline-offset-2 hover:text-[var(--nib-olive)]"
                             title={`Chain: ${a.chainId || "?"} | Provider: ${a.paymentProvider || "?"}`}>
                            tx {a.txHash.slice(0, 8)}...{a.txHash.slice(-4)}
                          </a>
                        )}
                        {a.paymentId && <span title={a.paymentId}>pid: {a.paymentId.slice(0, 8)}...</span>}
                        {a.network && <span title={`Chain: ${a.chainId}`}>{a.network.replace("eip155:", "")}</span>}
                        {a.payerWallet && (
                          <span title={`Payer: ${a.payerWallet}`}>from: {a.payerWallet.slice(0, 6)}...{a.payerWallet.slice(-4)}</span>
                        )}
                        {a.recipientWallet && (
                          <span title={`Recipient: ${a.recipientWallet}`}>to: {a.recipientWallet.slice(0, 6)}...{a.recipientWallet.slice(-4)}</span>
                        )}
                        {a.status && <span>{a.status}</span>}
                      </>
                    )}

                    {a.type === "rating" && (
                      <>
                        <span className="text-yellow-500">{"★".repeat(a.score || 0)}</span>
                        {a.walletAddress && (
                          <span title={`Wallet: ${a.walletAddress}`}>{a.walletAddress.slice(0, 6)}...{a.walletAddress.slice(-4)}</span>
                        )}
                        {a.txHash && (
                          <a href={blockExplorerUrl(a.txHash)} target="_blank" rel="noopener noreferrer"
                             className="underline underline-offset-2 hover:text-[var(--nib-olive)]">
                            tx {a.txHash.slice(0, 8)}...{a.txHash.slice(-4)}
                          </a>
                        )}
                        {a.proof && <span title={a.proof}>proof: {a.proof.slice(0, 12)}...</span>}
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="mt-8 text-xs text-[var(--nib-ink-soft)] text-center max-w-xl mx-auto leading-relaxed">
          Every entry has a unique ID. Payments show on-chain tx hashes (linked to Arc Testnet explorer), payment IDs, chain/network, payer and recipient wallets. Ratings show wallet address, score, and proof type. View events show visitor fingerprint and referrer. All data is stored permanently — fully verifiable and cross-referencable.
        </p>
      </main>
    </>
  );
}

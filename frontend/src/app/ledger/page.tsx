"use client";

import { Fragment, useEffect, useState, useCallback } from "react";
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
const TYPE_LABELS: Record<string, string> = { view: "View", unlock: "Unlock", payment: "Payment", rating: "Rating" };

function timeAgo(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function fmt(d: string) {
  return new Date(d).toLocaleString();
}

function bx(tx: string) { return `https://testnet.arc.io/tx/${tx}`; }
function sn(s: string, l = 8) { return s.length > l + 4 ? `${s.slice(0, l)}...${s.slice(-4)}` : s; }

export default function LedgerPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchLedger = useCallback(async () => {
    try {
      let url = `/api/hub/ledger?limit=200${filter ? `&type=${filter}` : ""}`;
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

  const filtered = activities.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      a.contentTitle.toLowerCase().includes(q) ||
      a.id.toLowerCase().includes(q) ||
      (a.domain || "").toLowerCase().includes(q) ||
      (a.actor || "").toLowerCase().includes(q) ||
      (a.txHash || "").toLowerCase().includes(q) ||
      (a.paymentId || "").toLowerCase().includes(q) ||
      (a.walletAddress || "").toLowerCase().includes(q) ||
      (a.payerWallet || "").toLowerCase().includes(q) ||
      (a.recipientWallet || "").toLowerCase().includes(q)
    );
  });

  const stats = {
    views: activities.filter((a) => a.type === "view").length,
    unlocks: activities.filter((a) => a.type === "unlock").length,
    payments: activities.filter((a) => a.type === "payment").length,
    ratings: activities.filter((a) => a.type === "rating").length,
    total: activities.length,
  };

  const toggleRow = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <>
      <Header />
      <div className="explore-page-shell">
        <main className="explore-body explore-main" role="main">
          <div className="explore-content">
            <div className="explore-header">
              <h1 className="explore-title">Network Ledger</h1>
              <p className="explore-subtitle">
                Live activity feed — every view, unlock, payment, and rating across the Nibgate network.
              </p>
            </div>

            {/* Stats Summary */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
              {[
                { label: "Total", value: stats.total, color: "" },
                { label: "Views", value: stats.views, color: "" },
                { label: "Unlocks", value: stats.unlocks, color: "text-green-500" },
                { label: "Payments", value: stats.payments, color: "text-blue-500" },
                { label: "Ratings", value: stats.ratings, color: "text-yellow-500" },
              ].map((s) => (
                <div key={s.label} className="border border-[var(--nib-border-soft)] rounded-lg p-3 text-center">
                  <div className={`text-xl font-bold font-mono ${s.color || "text-[var(--nib-ink)]"}`}>{s.value}</div>
                  <div className="text-xs text-[var(--nib-ink-soft)] uppercase tracking-wider mt-1">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Search + Filters */}
            <div className="flex flex-col md:flex-row gap-3 mb-6">
              <input
                type="text"
                placeholder="Search by title, ID, site, wallet, tx..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="flex-1 px-3 py-2 text-sm border border-[var(--nib-border-soft)] rounded bg-transparent text-[var(--nib-ink)] outline-none focus:border-[var(--nib-olive)] placeholder:text-[var(--nib-ink-soft)] font-mono"
              />
              <div className="flex gap-2 flex-wrap">
                {["", "views", "unlocks", "payments", "ratings"].map((t) => (
                  <button key={t} onClick={() => setFilter(t)}
                    className={`px-3 py-1.5 rounded text-xs font-medium border transition ${
                      filter === t
                        ? "bg-[var(--nib-olive)] text-black border-[var(--nib-olive)]"
                        : "bg-transparent text-[var(--nib-ink)] border-[var(--nib-border-soft)] hover:border-[var(--nib-olive)]"
                    }`}>
                    {t || "All"}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            {loading ? (
              <p className="text-[var(--nib-ink-soft)] text-sm">Loading...</p>
            ) : filtered.length === 0 ? (
              <p className="text-[var(--nib-ink-soft)] text-sm">No activity found.</p>
            ) : (
              <div className="w-full overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[var(--nib-ink-soft)] text-xs uppercase tracking-wider">
                      <th className="pb-2 pr-2 font-medium w-8"></th>
                      <th className="pb-2 pr-3 font-medium">Type</th>
                      <th className="pb-2 pr-3 font-medium">Time</th>
                      <th className="pb-2 pr-3 font-medium">Content</th>
                      <th className="pb-2 pr-3 font-medium">Actor</th>
                      <th className="pb-2 pr-3 font-medium">Value</th>
                      <th className="pb-2 pr-3 font-medium">Proof / Ref</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a, i) => {
                      const key = `${a.id}-${i}`;
                      const open = expanded.has(key);
                      return (
                        <Fragment key={key}>
                          <tr className="border-t border-[var(--nib-border-soft)] hover:bg-[var(--nib-surface)] transition-colors cursor-pointer" onClick={() => toggleRow(key)}>
                            <td className="py-2.5 pr-2 text-[var(--nib-ink-soft)] text-xs">{open ? "−" : "+"}</td>
                            <td className="py-2.5 pr-3 whitespace-nowrap" title={TYPE_LABELS[a.type]}>{TYPE_ICONS[a.type]}</td>
                            <td className="py-2.5 pr-3 whitespace-nowrap text-[var(--nib-ink-soft)] font-mono text-xs">{timeAgo(a.timestamp)}</td>
                            <td className="py-2.5 pr-3 min-w-[180px]">
                              <Link href={a.contentUrl || "#"} target="_blank" onClick={(e) => e.stopPropagation()}
                                className="underline underline-offset-2 decoration-[var(--nib-border-soft)] hover:decoration-[var(--nib-olive)]">
                                {a.contentTitle.length > 45 ? `${a.contentTitle.slice(0, 45)}...` : a.contentTitle}
                              </Link>
                              {a.domain && <div className="text-[10px] text-[var(--nib-ink-soft)] font-mono mt-0.5">{a.domain}</div>}
                            </td>
                            <td className="py-2.5 pr-3 whitespace-nowrap font-mono text-xs max-w-[120px] truncate" title={a.actor}>
                              {sn(a.actor)}
                            </td>
                            <td className="py-2.5 pr-3 whitespace-nowrap font-mono text-xs">
                              {a.type === "payment" && <span>{a.amount} {a.currency}</span>}
                              {a.type === "unlock" && a.revenue ? <span>{a.revenue} {a.currency}</span> : null}
                              {a.type === "rating" && a.score ? <span className="text-yellow-500">{"★".repeat(a.score)}</span> : null}
                              {a.type === "view" && a.durationMs ? <span>{(a.durationMs / 1000).toFixed(0)}s</span> : null}
                            </td>
                            <td className="py-2.5 pr-3 whitespace-nowrap font-mono text-xs">
                              {a.txHash ? (
                                <a href={bx(a.txHash)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                   className="underline underline-offset-2 text-[var(--nib-olive)]" title={a.txHash}>
                                  tx {sn(a.txHash, 6)}
                                </a>
                              ) : a.paymentId ? (
                                <span title={a.paymentId}>pid {sn(a.paymentId, 6)}</span>
                              ) : a.proof ? (
                                <span title={a.proof}>{sn(a.proof, 10)}</span>
                              ) : (
                                <span className="text-[var(--nib-ink-soft)]" title={a.id}>#{sn(a.id, 4)}</span>
                              )}
                            </td>
                          </tr>
                          {open && (
                            <tr className="bg-[var(--nib-surface)]">
                              <td colSpan={7} className="p-4">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                                  <Detail label="Event ID" value={a.id} />
                                  <Detail label="Type" value={TYPE_LABELS[a.type]} />
                                  <Detail label="Content ID" value={a.contentId} />
                                  <Detail label="Timestamp" value={fmt(a.timestamp)} />
                                  <Detail label="Actor" value={a.actor} link />
                                  <Detail label="Site" value={a.domain || "—"} />
                                  {a.type === "view" && <Detail label="Referrer" value={a.referrer || "—"} />}
                                  {a.type === "view" && a.durationMs ? <Detail label="Duration" value={`${(a.durationMs / 1000).toFixed(1)}s`} /> : null}
                                  {a.type === "unlock" && <Detail label="Revenue" value={`${a.revenue || 0} ${a.currency || "USDC"}`} />}
                                  {a.type === "payment" && <Detail label="Amount" value={`${a.amount || 0} ${a.currency || "USDC"}`} />}
                                  {a.type === "payment" && a.paymentId ? <Detail label="Payment ID" value={a.paymentId} link /> : null}
                                  {a.txHash && <Detail label="Tx Hash" value={a.txHash} link />}
                                  {a.type === "payment" && a.chainId ? <Detail label="Chain ID" value={a.chainId} /> : null}
                                  {a.type === "payment" && a.network ? <Detail label="Network" value={a.network} /> : null}
                                  {a.type === "payment" && a.paymentProvider ? <Detail label="Provider" value={a.paymentProvider} /> : null}
                                  {a.type === "payment" && a.payerWallet ? <Detail label="Payer" value={a.payerWallet} link /> : null}
                                  {a.type === "payment" && a.recipientWallet ? <Detail label="Recipient" value={a.recipientWallet} link /> : null}
                                  {a.type === "payment" && a.status ? <Detail label="Status" value={a.status} /> : null}
                                  {a.type === "payment" && a.receiptUrl ? <Detail label="Receipt URL" value={a.receiptUrl} link /> : null}
                                  {a.type === "rating" && a.score ? <Detail label="Score" value={`${a.score}/5`} /> : null}
                                  {a.type === "rating" && a.walletAddress ? <Detail label="Rater Wallet" value={a.walletAddress} link /> : null}
                                  {a.type === "rating" && a.proofType ? <Detail label="Proof Type" value={a.proofType} /> : null}
                                  {a.type === "rating" && a.proof ? <Detail label="Proof" value={a.proof} link /> : null}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            <p className="mt-6 text-xs text-[var(--nib-ink-soft)] text-center max-w-lg mx-auto leading-relaxed">
              Click <strong>+</strong> to expand details. Tx hashes link to the Arc Testnet explorer. Search by title, ID, site domain, wallet address, or transaction hash. Auto-refreshes every 30s.
            </p>
          </div>
        </main>
        <Footer showThemeToggle={true} />
      </div>
    </>
  );
}

function Detail({ label, value, link }: { label: string; value: string; link?: boolean }) {
  const content = link && value.startsWith("http") ? (
    <a href={value} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-[var(--nib-olive)]">{sn(value, 16)}</a>
  ) : link && value.length > 30 ? (
    <span title={value}>{sn(value, 16)}</span>
  ) : (
    <span>{value}</span>
  );
  return (
    <div>
      <div className="text-[var(--nib-ink-soft)] uppercase tracking-wider text-[10px] mb-0.5">{label}</div>
      <div className="break-all">{content}</div>
    </div>
  );
}

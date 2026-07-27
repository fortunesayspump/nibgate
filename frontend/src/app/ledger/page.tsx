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

function ta(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function bx(t: string) { return `https://testnet.arc.io/tx/${t}`; }
function sn(s: string, l = 8) { return s.length > l + 4 ? `${s.slice(0, l)}...${s.slice(-4)}` : s; }

export default function LedgerPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const fetchLedger = useCallback(async () => {
    try {
      const url = `/api/hub/ledger?limit=200${filter ? `&type=${filter}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) setActivities(data.activities || []);
    } catch {} finally { setLoading(false); }
  }, [filter]);

  useEffect(() => {
    fetchLedger();
    const int = setInterval(fetchLedger, 30000);
    return () => clearInterval(int);
  }, [fetchLedger]);

  const filtered = activities.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [a.contentTitle, a.id, a.domain, a.actor, a.txHash, a.paymentId, a.walletAddress, a.payerWallet, a.recipientWallet]
      .some((v) => (v || "").toLowerCase().includes(q));
  });

  const stats = [
    { label: "Total", value: activities.length },
    { label: "Views", value: activities.filter((a) => a.type === "view").length },
    { label: "Unlocks", value: activities.filter((a) => a.type === "unlock").length },
    { label: "Payments", value: activities.filter((a) => a.type === "payment").length },
    { label: "Ratings", value: activities.filter((a) => a.type === "rating").length },
  ];

  const toggle = (k: string) => setExpanded((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });

  return (
    <div className="bg-gray min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 px-6 py-16 md:px-10 lg:px-[4vw]">
        <section className="mx-auto max-w-7xl">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xl font-medium">Ledger</p>
              <h1 className="nibgate-display-title mt-4 max-w-4xl text-5xl font-medium md:text-7xl">Network activity.</h1>
              <p className="mt-6 max-w-3xl text-xl leading-8 opacity-75">Live feed of views, unlocks, payments, and ratings across all sites — every entry is verifiable with on-chain proofs or signed receipts.</p>
            </div>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 my-8">
            {stats.map((s) => (
              <div key={s.label} className="border border-dark-gray/40 rounded-xl p-4 text-center bg-gray/50">
                <div className="text-2xl font-bold font-mono">{s.value}</div>
                <div className="text-xs opacity-60 uppercase tracking-wider mt-1">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Search + Filters */}
          <div className="flex flex-col md:flex-row gap-3 mb-6">
            <input type="text" placeholder="Search by title, ID, site, wallet, tx..."
              value={search} onChange={(e) => setSearch(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border border-dark-gray/40 rounded bg-transparent text-[var(--nib-ink)] outline-none focus:border-[var(--nib-olive)] placeholder:opacity-40 font-mono" />
            <div className="flex gap-2 flex-wrap">
              {["", "views", "unlocks", "payments", "ratings"].map((t) => (
                <button key={t} onClick={() => setFilter(t)}
                  className={`px-3 py-1.5 rounded text-xs font-medium border transition ${
                    filter === t
                      ? "bg-[var(--nib-olive)] text-black border-[var(--nib-olive)]"
                      : "bg-transparent text-[var(--nib-ink)] border-dark-gray/40 hover:border-[var(--nib-olive)]"
                  }`}>
                  {t || "All"}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <p className="opacity-60 text-sm">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="opacity-60 text-sm">No activity found.</p>
          ) : (
            <div className="w-full overflow-x-auto border border-dark-gray/40 rounded-xl bg-gray/50">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left opacity-60 text-xs uppercase tracking-wider border-b border-dark-gray/40">
                    <th className="p-3 font-medium w-6"></th>
                    <th className="p-3 font-medium">Type</th>
                    <th className="p-3 font-medium">Time</th>
                    <th className="p-3 font-medium">Content</th>
                    <th className="p-3 font-medium">Actor</th>
                    <th className="p-3 font-medium">Value</th>
                    <th className="p-3 font-medium">Proof</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((a, i) => {
                    const k = `${a.id}-${i}`;
                    const open = expanded.has(k);
                    return (
                      <Fragment key={k}>
                        <tr className="border-b border-dark-gray/20 hover:bg-gray/30 transition-colors cursor-pointer" onClick={() => toggle(k)}>
                          <td className="p-3 opacity-40 text-xs">{open ? "−" : "+"}</td>
                          <td className="p-3 whitespace-nowrap" title={TYPE_LABELS[a.type]}>{TYPE_ICONS[a.type]}</td>
                          <td className="p-3 whitespace-nowrap opacity-60 font-mono text-xs">{ta(a.timestamp)}</td>
                          <td className="p-3 min-w-[180px]">
                            <Link href={a.contentUrl || "#"} target="_blank" onClick={(e) => e.stopPropagation()}
                              className="underline underline-offset-2 decoration-dark-gray/40 hover:decoration-[var(--nib-olive)]">
                              {a.contentTitle.length > 50 ? `${a.contentTitle.slice(0, 50)}...` : a.contentTitle}
                            </Link>
                            {a.domain && <div className="text-[10px] opacity-40 font-mono mt-0.5">{a.domain}</div>}
                          </td>
                          <td className="p-3 whitespace-nowrap font-mono text-xs max-w-[100px] truncate" title={a.actor}>{sn(a.actor)}</td>
                          <td className="p-3 whitespace-nowrap font-mono text-xs">
                            {a.type === "payment" && <span>{a.amount} {a.currency}</span>}
                            {a.type === "unlock" && a.revenue ? <span>{a.revenue} {a.currency}</span> : null}
                            {a.type === "rating" && a.score ? <span className="text-yellow-500">{"★".repeat(a.score)}</span> : null}
                            {a.type === "view" && a.durationMs ? <span>{(a.durationMs / 1000).toFixed(0)}s</span> : null}
                          </td>
                          <td className="p-3 whitespace-nowrap font-mono text-xs">
                            {a.txHash ? (
                              <a href={bx(a.txHash)} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                                className="underline underline-offset-2 text-[var(--nib-olive)]" title={a.txHash}>tx {sn(a.txHash, 6)}</a>
                            ) : a.paymentId ? (
                              <span title={a.paymentId}>pid {sn(a.paymentId, 6)}</span>
                            ) : a.proof ? (
                              <span title={a.proof}>{sn(a.proof, 10)}</span>
                            ) : (
                              <span className="opacity-40" title={a.id}>#{sn(a.id, 4)}</span>
                            )}
                          </td>
                        </tr>
                        {open && (
                          <tr className="bg-gray/30">
                            <td colSpan={7} className="p-4 border-b border-dark-gray/20">
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-mono">
                                <Det label="Event ID" value={a.id} />
                                <Det label="Type" value={TYPE_LABELS[a.type]} />
                                <Det label="Content ID" value={a.contentId} />
                                <Det label="Timestamp" value={new Date(a.timestamp).toLocaleString()} />
                                <Det label="Actor" value={a.actor} />
                                <Det label="Site" value={a.domain || "—"} />
                                {a.type === "view" && <Det label="Referrer" value={a.referrer || "—"} />}
                                {a.type === "view" && a.durationMs ? <Det label="Duration" value={`${(a.durationMs / 1000).toFixed(1)}s`} /> : null}
                                {a.type === "unlock" && <Det label="Revenue" value={`${a.revenue || 0} ${a.currency || "USDC"}`} />}
                                {a.type === "payment" && <Det label="Amount" value={`${a.amount || 0} ${a.currency || "USDC"}`} />}
                                {a.paymentId && <Det label="Payment ID" value={a.paymentId} />}
                                {a.txHash && <Det label="Tx Hash" value={a.txHash} link />}
                                {a.chainId && <Det label="Chain ID" value={a.chainId} />}
                                {a.network && <Det label="Network" value={a.network} />}
                                {a.paymentProvider && <Det label="Provider" value={a.paymentProvider} />}
                                {a.payerWallet && <Det label="Payer" value={a.payerWallet} />}
                                {a.recipientWallet && <Det label="Recipient" value={a.recipientWallet} />}
                                {a.status && <Det label="Status" value={a.status} />}
                                {a.score && <Det label="Score" value={`${a.score}/5`} />}
                                {a.walletAddress && <Det label="Rater" value={a.walletAddress} />}
                                {a.proofType && <Det label="Proof Type" value={a.proofType} />}
                                {a.proof && <Det label="Proof" value={a.proof} />}
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

          <p className="mt-6 text-xs opacity-40 text-center max-w-lg mx-auto leading-relaxed">
            Click <strong>+</strong> to expand. Tx hashes link to the Arc Testnet block explorer. Search by title, ID, domain, wallet, or tx hash. Auto-refreshes every 30s.
          </p>
        </section>
      </main>
      <Footer showThemeToggle />
    </div>
  );
}

function Det({ label, value, link }: { label: string; value: string; link?: boolean }) {
  const c = link && value.startsWith("http")
    ? <a href={value} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-[var(--nib-olive)]">{sn(value, 20)}</a>
    : <span>{value}</span>;
  return (
    <div>
      <div className="opacity-40 uppercase tracking-wider text-[10px] mb-0.5">{label}</div>
      <div className="break-all">{c}</div>
    </div>
  );
}

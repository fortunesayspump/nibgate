"use client";

import { Fragment, useEffect, useState, useCallback, useRef } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Link from "next/link";
import { FiEye, FiUnlock, FiDollarSign, FiStar } from "react-icons/fi";

type Activity = {
  type: "view" | "unlock" | "payment" | "rating";
  actor: string;
  contentTitle: string;
  contentUrl: string;
  contentId: string;
  imageUrl?: string;
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

const TYPE_META: Record<string, { label: string; icon: React.ReactNode }> = {
  view: { label: "View", icon: <FiEye size={18} /> },
  unlock: { label: "Unlock", icon: <FiUnlock size={18} /> },
  payment: { label: "Payment", icon: <FiDollarSign size={18} /> },
  rating: { label: "Rating", icon: <FiStar size={18} /> },
};

function ta(d: string) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function bx(t: string) { return `https://testnet.arc.io/tx/${t}`; }
function sn(s: string, l = 8) { return s.length > l + 4 ? `${s.slice(0, l)}...${s.slice(-4)}` : s; }

export default function LedgerPage() {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [filter, setFilter] = useState("");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [hasMore, setHasMore] = useState(false);
  const [serverTotals, setServerTotals] = useState({ views: 0, unlocks: 0, payments: 0, ratings: 0, total: 0 });

  const activitiesRef = useRef<Activity[]>([]);
  activitiesRef.current = activities;

  const fetchLedger = useCallback(async (append = false) => {
    try {
      if (append) setLoadingMore(true); else setLoading(true);
      const currentSkip = append ? activitiesRef.current.length : 0;
      const url = `/api/hub/ledger?limit=50&skip=${currentSkip}${filter ? `&type=${filter}` : ""}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        if (append) setActivities((prev) => [...prev, ...(data.activities || [])]);
        else setActivities(data.activities || []);
        setHasMore(data.hasMore || false);
        if (data.totals) setServerTotals(data.totals);
      }
    } catch {} finally { setLoading(false); setLoadingMore(false); }
  }, [filter]);

  useEffect(() => {
    fetchLedger(false);
    const int = setInterval(() => fetchLedger(false), 30000);
    return () => clearInterval(int);
  }, [filter]);

  const filtered = activities.filter((a) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return [a.contentTitle, a.id, a.domain, a.actor, a.txHash, a.paymentId, a.walletAddress, a.payerWallet, a.recipientWallet]
      .some((v) => (v || "").toLowerCase().includes(q));
  });

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

          {/* Totals — from server (entire database) */}
          <div className="grid gap-3 mt-8 sm:grid-cols-5">
            {[
              { label: "Total", value: serverTotals.total },
              { label: "Views", value: serverTotals.views },
              { label: "Unlocks", value: serverTotals.unlocks },
              { label: "Payments", value: serverTotals.payments },
              { label: "Ratings", value: serverTotals.ratings },
            ].map((s) => (
              <div key={s.label} className="rounded-2xl border border-dark-gray/50 bg-gray px-4 py-3 text-sm">
                <span className="opacity-60">{s.label}</span>
                <strong className="ml-2">{s.value}</strong>
              </div>
            ))}
          </div>

          {/* Search + Filter */}
          <div className="mt-6 flex flex-col gap-3 lg:flex-row">
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, ID, site, wallet, tx..."
              className="flex-1 rounded-full border border-black/45 bg-white px-5 py-3 text-sm outline-none transition focus:border-black focus:ring-2 focus:ring-black/10"
            />
            <div className="flex gap-2 flex-wrap">
              {["", "views", "unlocks", "payments", "ratings"].map((t) => (
                <button key={t} onClick={() => setFilter(t)}
                  className={`rounded-full border px-5 py-3 text-sm font-medium transition ${filter === t ? "bg-black text-white" : "bg-white text-black hover:bg-gray"}`}>
                  {t || "All"}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <p className="mt-8 text-sm opacity-65">Loading...</p>
          ) : filtered.length === 0 ? (
            <p className="mt-8 text-sm opacity-65">No activity found.</p>
          ) : (
            <section className="mt-8 overflow-hidden border border-dark-gray/50 bg-white">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-left">
                  <thead>
                    <tr className="border-b border-dark-gray/50 bg-gray text-sm">
                      <th className="w-10 px-5 py-4 font-medium"></th>
                      <th className="px-5 py-4 font-medium">Type</th>
                      <th className="px-5 py-4 font-medium">Time</th>
                      <th className="px-5 py-4 font-medium">Content</th>
                      <th className="px-5 py-4 font-medium">Actor</th>
                      <th className="px-5 py-4 font-medium">Value</th>
                      <th className="px-5 py-4 font-medium">Proof</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a, i) => {
                      const k = `${a.id}-${i}`;
                      const open = expanded.has(k);
                      const meta = TYPE_META[a.type];
                      return (
                        <Fragment key={k}>
                          <tr className="border-b border-dark-gray/40 transition hover:bg-gray/70 cursor-pointer" onClick={() => toggle(k)}>
                            <td className="px-5 py-5 opacity-40 text-sm">{open ? "−" : "+"}</td>
                            <td className="px-5 py-5" title={meta.label}>{meta.icon}</td>
                            <td className="px-5 py-5 whitespace-nowrap opacity-60 text-sm">{ta(a.timestamp)}</td>
                            <td className="px-5 py-5 min-w-[180px]">
                              <div className="flex items-center gap-3">
                                {a.imageUrl ? (
                                  <img src={a.imageUrl} alt="" className="h-10 w-10 rounded-lg border border-dark-gray/40 object-cover shrink-0 bg-gray" />
                                ) : null}
                                <div className="min-w-0">
                                  <Link href={a.contentUrl || "#"} target="_blank" onClick={(e) => e.stopPropagation()}
                                    className="underline underline-offset-2 decoration-dark-gray/40 hover:decoration-black font-medium">
                                    {a.contentTitle.length > 50 ? `${a.contentTitle.slice(0, 50)}...` : a.contentTitle}
                                  </Link>
                                  {a.domain && <div className="text-sm opacity-60 truncate">{a.domain}</div>}
                                </div>
                              </div>
                            </td>
                            <td className="px-5 py-5 whitespace-nowrap text-sm max-w-[120px] truncate font-mono" title={a.actor}>{sn(a.actor)}</td>
                            <td className="px-5 py-5 whitespace-nowrap text-sm font-mono">
                              {a.type === "payment" && <span>{a.amount} {a.currency}</span>}
                              {a.type === "unlock" && a.revenue ? <span>{a.revenue} {a.currency}</span> : null}
                              {a.type === "rating" && a.score ? <span className="text-yellow-500">{"★".repeat(a.score)}</span> : null}
                              {a.type === "view" && a.durationMs ? <span>{(a.durationMs / 1000).toFixed(0)}s</span> : null}
                            </td>
                            <td className="px-5 py-5 whitespace-nowrap text-sm font-mono">
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
                            <tr className="bg-gray/50">
                              <td colSpan={7} className="border-b border-dark-gray/40">
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 px-5 py-5 text-sm">
                                  <Det label="Event ID" value={a.id} />
                                  <Det label="Type" value={meta.label} />
                                  <Det label="Content ID" value={a.contentId} />
                                  <Det label="Timestamp" value={new Date(a.timestamp).toLocaleString()} />
                                  <Det label="Actor" value={a.actor} />
                                  <Det label="Site" value={a.domain || "—"} />
                                  {a.type === "view" && <Det label="Referrer" value={a.referrer || "—"} />}
                                  {a.type === "view" && a.durationMs ? <Det label="Duration" value={`${(a.durationMs / 1000).toFixed(1)}s`} /> : null}
                                  {a.type === "unlock" && <Det label="Revenue" value={`${a.revenue || 0} ${a.currency || "USDC"}`} />}
                                  {a.type === "payment" && <Det label="Amount" value={`${a.amount || 0} ${a.currency || "USDC"}`} />}
                                  {a.paymentId && <Det label="Payment ID" value={a.paymentId} />}
                                  {a.txHash && <Det label="Tx Hash" value={a.txHash} />}
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
            </section>
          )}

          {hasMore && !loading && !loadingMore && (
            <div className="mt-6 text-center">
              <button onClick={() => fetchLedger(true)}
                className="rounded-full border border-black/45 bg-white px-6 py-3 text-sm font-medium hover:bg-gray transition">
                Load more
              </button>
            </div>
          )}
          {loadingMore && <p className="mt-6 text-sm opacity-60 text-center">Loading more...</p>}

          <p className="mt-6 text-sm opacity-60 text-center max-w-lg mx-auto leading-relaxed">
            Click <strong>+</strong> to expand row details. Tx hashes link to Arc Testnet. Search by title, ID, domain, wallet, or tx hash. Auto-refreshes every 30s.
          </p>
        </section>
      </main>
      <Footer showThemeToggle />
    </div>
  );
}

function Det({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="opacity-60 text-xs uppercase tracking-wider mb-0.5">{label}</div>
      <div className="break-all font-mono text-sm">{value}</div>
    </div>
  );
}

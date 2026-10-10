"use client";

import { FormEvent, useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import Image from "next/image";
import { activeNetworkName, apiUrl } from "@/lib/api";

type HeldTip = {
  id: string;
  title?: string | null;
  contentUrl: string;
  domain?: string | null;
  imageUrl?: string | null;
  amount: number;
  currency?: string | null;
  createdAt: string;
  payerWallet?: string | null;
  paymentProvider?: string | null;
  network?: string | null;
  paymentId?: string | null;
  txHash?: string | null;
};

type HeldTipsResult = {
  domain: string;
  tips: HeldTip[];
  count: number;
  total: number;
};

const NETWORK = activeNetworkName();

export default function PendingTipsPage() {
  const [domain, setDomain] = useState("");
  const [result, setResult] = useState<HeldTipsResult | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function checkTips(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const query = new URLSearchParams({ domain: domain.trim(), limit: "100" });
      const response = await fetch(apiUrl(`/hub/tips/held?${query.toString()}`), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || `Tip lookup failed (${response.status}).`);
      }
      const tips: HeldTip[] = Array.isArray(data.tips) ? data.tips : [];
      const normalizedInput = domain.trim();
      const fallbackDomain = new URL(normalizedInput.includes("://") ? normalizedInput : `https://${normalizedInput}`)
        .hostname.toLowerCase().replace(/^www\./, "");
      setResult({
        domain: data.domain || fallbackDomain,
        tips,
        count: Number.isFinite(data.count) ? data.count : tips.length,
        total: Number.isFinite(data.total) ? data.total : tips.reduce((sum, tip) => sum + (Number(tip.amount) || 0), 0),
      });
    } catch (lookupError) {
      setError(lookupError instanceof Error ? lookupError.message : "Could not check pending tips.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray">
      <Header />
      <main className="flex-1 px-6 py-16 md:px-10 lg:px-[4vw]">
        <section className="mx-auto max-w-4xl">
          <p className="text-xl font-medium">Nib Tips</p>
          <h1 className="nibgate-display-title mt-4 text-5xl font-medium md:text-7xl">Check for tips waiting.</h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 opacity-75">
            Look up funded tips waiting to be claimed for your site. Any public domain can be checked, including external sites that are not registered with Nibgate.
          </p>

          <div className="mt-8 inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm" style={{ borderColor: "var(--nib-border-soft)", backgroundColor: "var(--nib-surface)" }}>
            <span className={`h-2 w-2 rounded-full ${NETWORK === "mainnet" ? "bg-emerald-500" : "bg-amber-500"}`} />
            Checking {NETWORK === "mainnet" ? "Arc mainnet" : "testnet"} tips
          </div>
          {NETWORK === "testnet" && (
            <p className="mt-3 text-sm opacity-65">This is testnet data and test USDC only. Mainnet tips are checked on nibgate.xyz.</p>
          )}

          <form onSubmit={checkTips} className="mt-8 flex flex-col gap-3 rounded-3xl border p-5 sm:flex-row sm:p-6" style={{ borderColor: "var(--nib-border-soft)", backgroundColor: "var(--nib-surface)" }}>
            <label className="sr-only" htmlFor="tip-check-domain">Your site domain or page URL</label>
            <input
              id="tip-check-domain"
              type="text"
              required
              autoComplete="url"
              placeholder="your-site.com or https://your-site.com/a-post"
              value={domain}
              onChange={(event) => setDomain(event.target.value)}
              className="min-w-0 flex-1 rounded-full border border-black/30 bg-white px-5 py-3 text-sm outline-none focus:border-black focus:ring-2 focus:ring-black/10"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-black px-6 py-3 text-sm font-medium text-white transition hover:bg-black/80 disabled:cursor-wait disabled:opacity-60"
            >
              {loading ? "Checking..." : "Check pending tips"}
            </button>
          </form>
          <p className="mt-3 text-sm opacity-60">Enter a domain or any page URL on that site. This lookup is read-only and does not claim or move funds.</p>

          {error && (
            <p role="alert" className="mt-6 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-800">
              {error}
            </p>
          )}

          {result && (
            <section aria-live="polite" className="mt-8">
              <div className="flex flex-col gap-2 rounded-3xl border p-6 sm:flex-row sm:items-end sm:justify-between" style={{ borderColor: "var(--nib-border-soft)", backgroundColor: "var(--nib-surface)" }}>
                <div>
                  <p className="text-sm opacity-60">Pending tips for</p>
                  <h2 className="mt-1 text-2xl font-medium">{result.domain}</h2>
                </div>
                <div className="sm:text-right">
                  <p className="text-sm opacity-60">{result.count} {result.count === 1 ? "tip" : "tips"} waiting</p>
                  <p className="mt-1 text-2xl font-medium tabular-nums">{result.total.toFixed(2)} USDC</p>
                </div>
              </div>

              {result.count === 0 ? (
                <p className="mt-5 rounded-2xl border p-5 text-sm opacity-70" style={{ borderColor: "var(--nib-border-soft)", backgroundColor: "var(--nib-surface)" }}>
                  No funded, unclaimed tips were found for this domain on {NETWORK}.
                </p>
              ) : (
                <div className="mt-5 space-y-3">
                  {result.tips.map((tip) => (
                    <article key={tip.id} className="rounded-2xl border p-5 sm:flex sm:items-center sm:justify-between sm:gap-5" style={{ borderColor: "var(--nib-border-soft)", backgroundColor: "var(--nib-surface)" }}>
                      <div className="min-w-0">
                        <div className="flex items-start gap-3">
                          {tip.imageUrl && (
                            <Image src={tip.imageUrl} alt="" width={56} height={56} unoptimized className="h-14 w-14 shrink-0 rounded-lg object-cover" />
                          )}
                          <div className="min-w-0">
                            <h3 className="truncate font-medium">{tip.title || tip.contentUrl}</h3>
                            <a href={tip.contentUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block truncate text-sm underline underline-offset-2 opacity-65">
                              {tip.contentUrl}
                            </a>
                            <p className="mt-2 text-xs opacity-55">
                              {new Date(tip.createdAt).toLocaleString()} · Held · {tip.paymentProvider || "payment"}
                            </p>
                          </div>
                        </div>
                        {(tip.payerWallet || tip.network || tip.paymentId || tip.txHash) && (
                          <details className="mt-3 text-xs">
                            <summary className="cursor-pointer opacity-65">Available payment details</summary>
                            <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                              {tip.payerWallet && <div><dt className="opacity-55">Payer</dt><dd className="break-all font-mono">{tip.payerWallet}</dd></div>}
                              {tip.network && <div><dt className="opacity-55">Network</dt><dd>{tip.network}</dd></div>}
                              {tip.paymentId && <div><dt className="opacity-55">Payment ID</dt><dd className="break-all font-mono">{tip.paymentId}</dd></div>}
                              {tip.txHash && <div><dt className="opacity-55">Transaction</dt><dd className="break-all font-mono">{tip.txHash}</dd></div>}
                            </dl>
                          </details>
                        )}
                      </div>
                      <p className="mt-3 shrink-0 font-mono text-lg sm:mt-0">
                        {Number(tip.amount).toFixed(2)} {tip.currency || "USDC"}
                      </p>
                    </article>
                  ))}
                  {result.count > result.tips.length && (
                    <p className="text-sm opacity-60">Showing the latest {result.tips.length} of {result.count} pending tips.</p>
                  )}
                </div>
              )}
              <p className="mt-5 text-sm leading-6 opacity-60">
                Page titles and other details depend on what the tipper or extension supplied, or whether matching content is indexed. JEV can enrich eligible indexed content, but it does not guarantee complete metadata for every external page.
              </p>
            </section>
          )}
        </section>
      </main>
      <Footer showThemeToggle />
    </div>
  );
}

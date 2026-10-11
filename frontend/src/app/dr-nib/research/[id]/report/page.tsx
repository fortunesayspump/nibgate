"use client";

// Full report as its own article page: title, meta, the complete formatted
// report (no preview clamp), then the numbered sources the [n] chips jump
// to. Same data as the run detail, reading posture instead of ops posture.
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { drNibApi } from "@/lib/dr-nib-api";
import { ReportArticle, ReportEvidence, ReportQA } from "@/components/dr-nib/ReportMarkdown";
import { TrustChip } from "@/components/dr-nib/common";
import { explorerTxUrl } from "@nibgate/wallet";

export default function RunReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [linkCopied, setLinkCopied] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r: any = await drNibApi.getRun(id);
        setRun(r);
        setError("");
        if (r.status === "complete" || (r.reports || []).length) {
          try {
            setReport(await drNibApi.getReport(id));
          } catch {
            /* report still writing — article lands on retry */
          }
        }
      } catch (e: any) {
        setError(e?.message || "Could not load report.");
      }
    })();
  }, [id, attempt]);

  if (error) return (
    <div className="mx-auto max-w-2xl py-10 text-center">
      <p className="text-sm font-medium">Couldn&apos;t load this report</p>
      <p className="mx-auto mt-2 max-w-md text-sm opacity-60">{error}</p>
      <div className="mt-4 flex justify-center gap-2">
        <button onClick={() => { setError(""); setAttempt((a) => a + 1); }} className="bg-black px-6 py-2 text-sm font-medium text-white">Retry</button>
        <Link href={`/dr-nib/research/${id}`} className="border border-dark-gray/60 px-4 py-2 text-sm font-medium hover:bg-black hover:text-white">Run activity</Link>
      </div>
    </div>
  );
  if (!run) return (
    <div className="mx-auto max-w-2xl py-6" aria-hidden="true">
      <div className="h-8 w-3/4 animate-pulse rounded bg-black/10" />
      <div className="mt-5 rounded-2xl border border-dark-gray/50 bg-white p-5">
        <div className="h-3 w-full animate-pulse rounded bg-black/10" />
        <div className="mt-2 h-3 w-11/12 animate-pulse rounded bg-black/10" />
        <div className="mt-2 h-3 w-4/6 animate-pulse rounded bg-black/10" />
        <p className="mt-4 text-xs opacity-60">Loading report…</p>
      </div>
    </div>
  );

  const topic = run.brief?.topic || run.title || "Untitled run";
  const spent = Number(run.spent || 0);
  const sources: any[] = run.sources || [];
  const esc = (run.metadata && run.metadata.escrow) || null;
  const steer = report ? (run.metadata?.versionPrompts || {})[report.version] : null;
  function shareLink() {
    if (!report) return;
    const url = `${window.location.origin}/dr-nib/research/${id}/report?version=${report.version}`;
    (async () => {
      try {
        await navigator.clipboard.writeText(url);
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      } catch { /* clipboard blocked — the URL bar already holds it */ }
    })();
  }
  const imageFor = (url: string) => {
    for (const s of run.steps || []) {
      for (const d of s.output?.documents || []) {
        if (d.url === url && d.image) return d.image as string;
      }
    }
    return null;
  };

  return (
    <div className="mx-auto max-w-2xl py-6">
      <Link href={`/dr-nib/research/${id}`} className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider opacity-60 hover:opacity-100">
        <ArrowLeft size={13} /> Run activity
      </Link>
      <p className="mt-4 text-[11px] font-medium uppercase tracking-wider opacity-50">
        Dr. Nib report{report ? ` · v${report.version}` : ""} · {sources.length} sources · ${spent.toFixed(2)} spent
      </p>
      <h1 className="nibgate-display-title mt-1 text-3xl font-medium md:text-4xl">{topic}</h1>
      <div className="mt-5 rounded-2xl border border-dark-gray/50 bg-white p-5 md:p-7">
        {report ? (
          <>
            {steer ? <p className="mb-3 text-xs opacity-60">v{report.version} steered by: “{String(steer).slice(0, 160)}”</p> : null}
            <ReportArticle markdown={report.markdown} sources={sources} />
            <ReportEvidence claims={run.claims} sources={sources} />
            <ReportQA claims={run.claims} sources={sources} />
            <div className="mt-4 flex items-center gap-3 border-t border-dark-gray/30 pt-3">
              <button onClick={shareLink} className="text-xs font-medium underline opacity-60 hover:opacity-100" title="Copy a link to this exact report version">
                {linkCopied ? "✓ Link copied" : "Share this version"}
              </button>
              {esc?.completeTx ? (
                <a href={explorerTxUrl(esc.completeTx)} target="_blank" rel="noreferrer" className="text-xs font-medium underline opacity-60 hover:opacity-100">
                  Settle tx ↗
                </a>
              ) : null}
              {Number(run.refunded ?? 0) > 0 ? (
                <span className="text-xs opacity-60">${Number(run.refunded).toFixed(2)} refunded</span>
              ) : null}
            </div>
          </>
        ) : (
          <p className="text-sm opacity-60">No report yet — it lands here once the run produces one.</p>
        )}
      </div>
      <section id="drnib-sources" className="mt-6 scroll-mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5 md:p-7">
        <p className="text-sm font-medium">Sources ({sources.length})</p>
        {sources.length === 0 ? (
          <p className="mt-2 text-sm opacity-60">No scored sources on this run.</p>
        ) : (
          <ol className="mt-3 space-y-3">
            {sources.map((s: any, i: number) => {
              const img = imageFor(s.url);
              return (
                <li key={s.id || i} className="flex gap-3">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" loading="lazy" className="h-16 w-16 shrink-0 rounded-xl border border-dark-gray/40 object-cover" />
                  ) : null}
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-6">[{i + 1}] {s.title || s.url}</p>
                    <p className="break-all font-mono text-[11px] opacity-50">{s.url}</p>
                    <p className="mt-0.5 flex items-center gap-2 text-[11px] opacity-60">
                      <span>{s.domain || ""}</span>
                      {typeof s.trust === "number" ? <TrustChip trust={s.trust >= 0.7 ? "high" : s.trust >= 0.4 ? "medium" : "low"} /> : null}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}

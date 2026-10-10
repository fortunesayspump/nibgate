"use client";

// Full report as its own article page: title, meta, the complete formatted
// report (no preview clamp), then the numbered sources the [n] chips jump
// to. Same data as the run detail, reading posture instead of ops posture.
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { drNibApi } from "@/lib/dr-nib-api";
import { ReportArticle } from "@/components/dr-nib/ReportMarkdown";
import { TrustChip } from "@/components/dr-nib/common";

export default function RunReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const r: any = await drNibApi.getRun(id);
        setRun(r);
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
  }, [id]);

  if (error) return <p className="text-sm text-red-700">Could not load report: {error}</p>;
  if (!run) return <p className="text-sm opacity-60">Loading report…</p>;

  const topic = run.brief?.topic || run.title || "Untitled run";
  const spent = Number(run.spent || 0);
  const sources: any[] = run.sources || [];
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
          <ReportArticle markdown={report.markdown} />
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

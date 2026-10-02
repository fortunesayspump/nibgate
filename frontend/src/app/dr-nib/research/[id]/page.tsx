"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Pause, Play } from "lucide-react";
import { drNibApi } from "@/lib/dr-nib-api";
import { subscribeRunEvents } from "@/lib/dr-nib-events";
import { PageHeader, TrustChip } from "@/components/dr-nib/common";

function secs(startedAt?: string, endedAt?: string): number | null {
  if (!startedAt || !endedAt) return null;
  return Math.max(0, Math.round((new Date(endedAt).getTime() - new Date(startedAt).getTime()) / 1000));
}

function StepRow({ s }: { s: any }) {
  const [open, setOpen] = useState(false);
  const out = s.output || {};
  const dur = secs(s.startedAt, s.endedAt);
  const queries: string[] = out.queries || [];
  const urls: string[] = out.urls || [];
  const verdicts: any[] = out.verdicts || [];
  const hasDetail = Boolean(out.why || queries.length || urls.length || verdicts.length);
  return (
    <li className="rounded-xl border border-dark-gray/40 bg-gray">
      <button onClick={() => hasDetail && setOpen((o) => !o)} disabled={!hasDetail}
        className={`flex w-full items-start gap-3 p-3 text-left ${hasDetail ? "" : "cursor-default"}`}>
        <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s.status === "done" ? "" : s.status === "active" ? "animate-pulse bg-black" : "bg-black/20"}`} style={s.status === "done" ? { background: "var(--nib-teal)" } : undefined} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium capitalize">{s.kind}</span>
            {dur !== null ? (
              <span className="rounded-full bg-black/10 px-2 py-0.5 text-[11px]">took {dur}s</span>
            ) : s.status === "active" ? (
              <span className="rounded-full bg-black px-2 py-0.5 text-[11px] font-medium text-white">running…</span>
            ) : null}
            <span className="text-[11px] opacity-60">{s.status}</span>
          </span>
          {out.why ? <span className="mt-1 block text-[13px] opacity-75">{out.why}</span> : null}
        </span>
        {hasDetail ? <ChevronDown size={15} aria-hidden="true" className={`mt-1 shrink-0 opacity-60 transition ${open ? "rotate-180" : ""}`} /> : null}
      </button>
      {open && hasDetail ? (
        <div className="space-y-2 border-t border-dark-gray/40 px-3 py-2.5 text-xs">
          {queries.length > 0 && (
            <div><p className="mb-1 font-medium uppercase tracking-wider opacity-60" style={{ fontSize: 10 }}>Queries issued</p>
              <ul className="space-y-0.5">{queries.map((q) => (<li key={q} className="font-mono opacity-80">“{q}”</li>))}</ul></div>
          )}
          {urls.length > 0 && (
            <div><p className="mb-1 font-medium uppercase tracking-wider opacity-60" style={{ fontSize: 10 }}>Pages opened</p>
              <ul className="space-y-0.5">{urls.map((u) => (<li key={u} className="break-all font-mono opacity-80">{u}</li>))}</ul></div>
          )}
          {verdicts.length > 0 && (
            <div><p className="mb-1 font-medium uppercase tracking-wider opacity-60" style={{ fontSize: 10 }}>JEV verdicts</p>
              <ul className="space-y-0.5">{verdicts.map((v: any) => (<li key={v.url} className="opacity-80">{v.keep ? "kept" : "dropped"} · rel {v.relevance} · trust {v.trust} · <span className="break-all font-mono">{v.url}</span></li>))}</ul></div>
          )}
        </div>
      ) : null}
    </li>
  );
}

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState("");
  const [streamLive, setStreamLive] = useState(true);
  const [exportError, setExportError] = useState("");

  async function load() {
    try {
      const r = await drNibApi.getRun(id);
      setRun(r);
      try { setReport(await drNibApi.getReport(id)); } catch { setReport(null); }
    } catch (e: any) { setError(e.message); }
  }

  // Exports render on demand from the finished report and download directly.
  async function downloadExport(format: string) {
    setExportError("");
    try {
      const out = await drNibApi.createExport(id, format);
      const blob = new Blob([out.content ?? ""], { type: out.contentType || "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = out.filename || `report.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setExportError(e?.message || "Export failed.");
    }
  }

  // Live first, polling never: the run page follows the run's event log over
  // SSE, and the server replays anything a reconnect missed. Only if the
  // stream itself fails does the page degrade to slow polling — silence is
  // never an option while a run is moving.
  useEffect(() => {
    load();
    let poll: ReturnType<typeof setInterval> | null = null;
    const unsub = subscribeRunEvents(
      id,
      () => { load(); },
      () => {
        setStreamLive(false);
        if (!poll) poll = setInterval(load, 5000);
      },
    );
    return () => { unsub(); if (poll) clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (error) return <p className="text-sm text-red-700">Could not load run: {error}</p>;
  if (!run) return <p className="text-sm opacity-60">Loading run…</p>;

  const topic = run.brief?.topic || "Untitled run";
  const spent = Number(run.spent || 0);
  const cap = Number(run.budgetCap || 0);
  const pct = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0;

  return (
    <div>
      <PageHeader
        eyebrow="Dr. Nib · Research"
        title={topic.length > 70 ? topic.slice(0, 70) + "…" : topic}
        desc={`${run.status} · ${run.brief?.depth || "standard"} depth · $${spent.toFixed(2)} of $${cap.toFixed(2)} spent`}
        action={
          <div className="flex gap-2">
            <Link href="/dr-nib/projects" className="rounded-full border border-dark-gray/50 bg-white px-6 py-3 text-sm font-medium">Projects</Link>
            {run.status === "running" && (
              <button onClick={() => drNibApi.pauseRun(id).then(load)} className="flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-medium text-white"><Pause size={15} aria-hidden="true" /> Pause</button>
            )}
            {run.status === "paused" && (
              <button onClick={() => drNibApi.resumeRun(id).then(load)} className="flex items-center gap-2 rounded-full bg-black px-6 py-3 text-sm font-medium text-white"><Play size={15} aria-hidden="true" /> Resume</button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0">
          <section className="rounded-2xl border border-dark-gray/50 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Activity</p>
              <span className="rounded-full border border-dark-gray/50 px-2.5 py-0.5 text-[11px] font-medium uppercase">{run.status}</span>
            </div>
            {(run.steps || []).length === 0 ? (
              <p className="text-sm opacity-60">No steps yet — approve the plan to start.</p>
            ) : (
              <ol className="space-y-2">
                {run.steps.map((s: any) => (<StepRow key={s.id} s={s} />))}
              </ol>
            )}
            <div className="mt-4 border-t border-dark-gray/40 pt-3">
              <div className="flex justify-between text-xs opacity-70"><span>Budget used</span><span>${spent.toFixed(2)} / ${cap.toFixed(2)}</span></div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--nib-teal)" }} /></div>
            </div>
          </section>

          {!report && (run.status === "running" || run.status === "paused") && (
            <section className="mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5">
              <p className="text-sm font-medium">Report</p>
              <div className="mt-3 space-y-2" aria-hidden="true">
                <div className="h-3 w-3/4 animate-pulse rounded bg-black/10" />
                <div className="h-3 w-full animate-pulse rounded bg-black/10" />
                <div className="h-3 w-5/6 animate-pulse rounded bg-black/10" />
              </div>
              <p className="mt-3 text-xs opacity-60">Drafting sections as steps complete — they appear here live.</p>
            </section>
          )}

          {report && (
            <section className="mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">Report · v{report.version}</p>
                <div className="flex flex-wrap items-center gap-2">
                  {["md", "json", "bibtex"].map((f) => (
                    <button key={f} onClick={() => downloadExport(f)} className="border border-dark-gray/60 px-2.5 py-1 text-[11px] font-medium uppercase">{f}</button>
                  ))}
                </div>
              </div>
              {exportError ? <p className="mb-2 text-xs text-red-700">{exportError}</p> : null}
              <p className="mb-3 text-[11px] opacity-60">PDF, Word, Excel, and PowerPoint renderers are not wired yet.</p>
              <article className="whitespace-pre-wrap text-sm leading-7">{report.markdown}</article>
            </section>
          )}

          <section className="mt-4 border border-dark-gray/50 bg-white">
            <div className="border-b border-dark-gray/40 px-4 py-3">
              <p className="text-sm font-medium">Ask about this run</p>
              <p className="text-xs opacity-60">
                {streamLive ? "Live — this view follows the run as it happens." : "Stream unavailable — refreshing slowly instead."}
              </p>
            </div>
            <div className="p-4">
              <p className="text-sm opacity-60">
                Follow-up chat will answer only from what this run collected, on its own small balance.
                It is not connected yet — nothing here will guess at an answer.
              </p>
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="border border-dark-gray/50 bg-white p-4">
            <p className="mb-3 text-sm font-medium">Sources ({(run.sources || []).length})</p>
            {(run.sources || []).length === 0 ? (
              <p className="text-xs opacity-60">Sources appear here as the run finds and scores them.</p>
            ) : (
              <ul className="space-y-2">
                {run.sources.map((s: any, i: number) => (
                  <li key={s.id} className="rounded-xl border border-dark-gray/40 bg-gray p-2.5">
                    <p className="text-[13px] font-medium leading-snug">[{i + 1}] {s.title || s.url}</p>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="break-all text-[11px] opacity-60">{s.domain || s.url}</span>
                      {typeof s.trust === "number" ? <TrustChip trust={s.trust >= 0.7 ? "high" : s.trust >= 0.4 ? "medium" : "low"} /> : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="border border-dark-gray/50 bg-white p-4 text-sm">
            <p className="mb-2 font-medium">Run budget</p>
            <p className="text-2xl font-medium leading-none">${cap.toFixed(2)}</p>
            <p className="mt-1 text-xs opacity-60">cap · ${spent.toFixed(2)} spent</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

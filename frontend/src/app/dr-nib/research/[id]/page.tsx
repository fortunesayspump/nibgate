"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, Loader2, Pause, Play } from "lucide-react";
import { drNibApi } from "@/lib/dr-nib-api";
import { PageHeader, TrustChip } from "@/components/dr-nib/common";

type ChatMsg = { id: number; role: "user" | "assistant"; text: string; cites?: number[] };

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
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);

  async function load() {
    try {
      const r = await drNibApi.getRun(id);
      setRun(r);
      try { setReport(await drNibApi.getReport(id)); } catch { setReport(null); }
    } catch (e: any) { setError(e.message); }
  }

  useEffect(() => {
    load();
    const t = setInterval(async () => {
      try {
        const r = await drNibApi.getRun(id);
        setRun(r);
        if (r.status === "complete" || r.status === "failed") {
          clearInterval(t);
          try { setReport(await drNibApi.getReport(id)); } catch {}
        }
      } catch {}
    }, 2500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function ask() {
    const text = draft.trim();
    if (!text || thinking) return;
    const sources = run?.sources || [];
    setChat((m) => [...m, { id: Date.now(), role: "user", text }]);
    setDraft("");
    setThinking(true);
    setTimeout(() => {
      const cites = sources.slice(0, 3).map((_: any, i: number) => i + 1);
      setChat((m) => [...m, {
        id: Date.now() + 1,
        role: "assistant",
        text: sources.length
          ? `Based on what this run found: the strongest evidence comes from the top-ranked sources, and I'd treat anything single-sourced as provisional. Ask me about a specific claim and I'll point at the passage.`
          : `This run hasn't gathered sources yet — check back once the activity feed shows fetched pages.`,
        cites,
      }]);
      setThinking(false);
    }, 1200);
  }

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
                <div className="flex flex-wrap gap-2">
                  {["pdf", "word", "excel", "powerpoint"].map((f) => (
                    <button key={f} onClick={() => drNibApi.createExport(id, f)} className="border border-dark-gray/60 px-2.5 py-1 text-[11px] font-medium uppercase">{f}</button>
                  ))}
                </div>
              </div>
              <article className="whitespace-pre-wrap text-sm leading-7">{report.markdown}</article>
            </section>
          )}

          <section className="mt-4 border border-dark-gray/50 bg-white">
            <div className="border-b border-dark-gray/40 px-4 py-3">
              <p className="text-sm font-medium">Ask about this run</p>
              <p className="text-xs opacity-60">Follow-ups cite this run's sources.</p>
            </div>
            <div className="max-h-80 space-y-3 overflow-y-auto p-4">
              {chat.length === 0 ? (
                <p className="text-sm opacity-60">e.g. “Which claim is weakest?” or “Why trust source 1 over source 4?”</p>
              ) : chat.map((m) => (
                <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                  <div className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${m.role === "user" ? "bg-black text-white" : "border border-dark-gray/40 bg-gray"}`}>
                    {m.text}
                    {m.cites && m.cites.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {m.cites.map((c) => (<span key={c} className="rounded border border-dark-gray/50 bg-white px-1.5 py-0.5 text-[11px]">[{c}] {(run.sources || [])[c - 1]?.domain}</span>))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {thinking && (<div className="flex items-center gap-2 text-sm opacity-60"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> thinking…</div>)}
            </div>
            <div className="flex items-end gap-2 border-t border-dark-gray/40 p-3">
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }} rows={2}
                placeholder="Ask about this research…" className="flex-1 resize-none border border-dark-gray/50 bg-gray rounded-xl px-3 py-2 text-sm outline-none" />
              <button onClick={ask} disabled={thinking} className="flex h-10 items-center bg-black px-4 text-sm font-medium text-white disabled:opacity-50" aria-label="Send">Send</button>
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

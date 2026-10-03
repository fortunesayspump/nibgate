"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pause, Play, Send } from "lucide-react";
import { drNibApi } from "@/lib/dr-nib-api";
import { subscribeRunEvents } from "@/lib/dr-nib-events";
import { TrustChip } from "@/components/dr-nib/common";

// One chronological feed from three sources: the agent's reads (intake
// thinking), the steps with their full outputs, and the tool calls with
// their results. Like the opencode TUI, every tool row shows what it was
// asked AND what came back — a call without its result is a cliffhanger.
function buildFeed(run: any): any[] {
  const items: any[] = [];
  for (const d of run.decisions || []) {
    if (d.kind === "thinking" && d.output?.text) items.push({ t: "thinking", at: d.createdAt, text: d.output.text });
  }
  for (const s of run.steps || []) items.push({ t: "step", at: s.createdAt, step: s });
  for (const e of run.events || []) {
    if (e.type === "tool.call") items.push({ t: "tool", at: e.at, e });
    else if (e.type === "awaiting") items.push({ t: "parked", at: e.at, e });
    else if (e.type === "failed" || e.type === "complete") items.push({ t: "marker", at: e.at, e });
  }
  items.sort((a, b) => +new Date(a.at || 0) - +new Date(b.at || 0));
  return items;
}

function ToolResult({ e }: { e: any }) {
  const r = e.result;
  if (!r) return null;
  if (e.tool === "run_code") {
    return (
      <details className="mt-1">
        <summary className="cursor-pointer text-[11px] opacity-60">exit {r.exitCode ?? "?"} — stdout</summary>
        <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] opacity-80">{r.stdout || "(empty)"}</pre>
        {r.stderr ? <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] text-red-700">{r.stderr}</pre> : null}
      </details>
    );
  }
  if (e.tool === "http_request") {
    return <p className="mt-1 font-mono text-[11px] opacity-70">→ {r.status ?? "?"} · {r.bytes ?? 0} bytes</p>;
  }
  const items: any[] = r.items || [];
  if (!items.length) return <p className="mt-1 font-mono text-[11px] opacity-70">→ {r.hits ?? r.pages ?? r.searched ?? 0} result{(r.hits ?? r.pages ?? 0) === 1 ? "" : "s"}</p>;
  return (
    <details className="mt-1" open={false}>
      <summary className="cursor-pointer font-mono text-[11px] opacity-70">
        → {r.hits ?? r.pages ?? items.length} result{(r.hits ?? r.pages ?? items.length) === 1 ? "" : "s"}: {items.slice(0, 2).map((i: any) => i.title).filter(Boolean).join(" · ").slice(0, 90)}
      </summary>
      <ul className="mt-1 space-y-0.5">
        {items.map((i: any, n: number) => (
          <li key={n} className="text-[11px] leading-5"><span className="font-medium">{i.title || "(untitled)"}</span>{i.url ? <span className="block break-all font-mono opacity-50">{i.url}</span> : null}</li>
        ))}
      </ul>
    </details>
  );
}

function StepDetail({ step, open }: { step: any; open: boolean }) {
  const out = step.output || {};
  return (
    <div className="rounded-xl border border-dark-gray/40 bg-gray p-3">
      <p className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className={`h-1.5 w-1.5 rounded-full ${step.status === "done" ? "" : step.status === "active" ? "animate-pulse bg-black" : "bg-black/25"}`} style={step.status === "done" ? { background: "var(--nib-teal)" } : undefined} />
        <span className="font-medium capitalize">{step.kind}</span>
        <span className="opacity-50">{step.status}</span>
        {Number(out.costUsd) > 0 ? <span className="font-mono text-[11px] opacity-50">${Number(out.costUsd).toFixed(3)}</span> : null}
      </p>
      {out.why ? <p className="mt-1.5 text-[13px] leading-6 opacity-80">{out.why}</p> : null}
      {out.error ? <p className="mt-1.5 text-[13px] text-red-700">{out.error}</p> : null}
      {(out.providers || []).length > 0 || out.fallback === true || out.attempted === false ? (
        <p className="mt-1.5 font-mono text-[11px] opacity-60">
          {out.fallback === true || out.attempted === false ? "offline stub — no provider reached" : `via ${(out.providers || []).join(" + ") || "providers"}`}
        </p>
      ) : null}
      {(out.queries || []).length > 0 ? (
        <div className="mt-2">
          <p className="text-[10px] font-medium uppercase tracking-wider opacity-50">Queries</p>
          <ul className="mt-0.5 space-y-0.5">{out.queries.map((q: string) => (<li key={q} className="font-mono text-[11px] opacity-70">“{q}”</li>))}</ul>
        </div>
      ) : null}
      {(out.results || []).length > 0 ? (
        <details className="mt-2" open={open}>
          <summary className="cursor-pointer text-[11px] font-medium opacity-70">{out.results.length} hits{out.providers?.length ? ` · ${out.providers.join(" + ")}` : ""}</summary>
          <ul className="mt-1 space-y-1.5">
            {out.results.map((r: any, n: number) => (
              <li key={r.url || n} className="text-[12px] leading-5">
                <span className="font-medium">{r.title || r.url}</span>
                {r.url ? <span className="block break-all font-mono text-[11px] opacity-50">{r.url}</span> : null}
                {r.snippet || r.content ? <span className="block opacity-60">{String(r.snippet || r.content).slice(0, 220)}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {(out.documents || []).length > 0 ? (
        <details className="mt-2" open={open}>
          <summary className="cursor-pointer text-[11px] font-medium opacity-70">{out.documents.length} pages read</summary>
          <ul className="mt-1 space-y-1.5">
            {out.documents.map((d: any, n: number) => (
              <li key={d.url || n} className="text-[12px] leading-5">
                <span className="font-medium">{d.title || d.url}</span>
                <span className="font-mono text-[11px] opacity-50"> · {String(d.text || "").length.toLocaleString()} chars</span>
                {d.text ? <span className="block opacity-60">{String(d.text).slice(0, 220)}…</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {(out.verdicts || []).length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-[11px] font-medium opacity-70">{out.verdicts.filter((v: any) => v.keep).length}/{out.verdicts.length} sources kept</summary>
          <ul className="mt-1 space-y-0.5">
            {out.verdicts.map((v: any, n: number) => (
              <li key={v.url || n} className="font-mono text-[11px] opacity-70">{v.keep ? "kept" : "dropped"} · rel {v.relevance} · trust {v.trust} · <span className="break-all">{v.url}</span></li>
            ))}
          </ul>
        </details>
      ) : null}
      {(out.learnings || []).length > 0 ? (
        <ul className="mt-2 space-y-1">{out.learnings.map((l: string, n: number) => (<li key={n} className="text-[12px] leading-5 opacity-80">✓ {l}</li>))}</ul>
      ) : null}
      {(out.followUps || []).length > 0 ? (
        <ul className="mt-1 space-y-1">{out.followUps.map((l: string, n: number) => (<li key={n} className="text-[12px] leading-5 opacity-60">→ next: {l}</li>))}</ul>
      ) : null}
    </div>
  );
}

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [run, setRun] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState("");
  const [streamLive, setStreamLive] = useState(true);
  const [exportError, setExportError] = useState("");
  const [awaitingText, setAwaitingText] = useState("");
  const [awaitingBusy, setAwaitingBusy] = useState(false);
  const [awaitingError, setAwaitingError] = useState("");

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

  // Answer the mid-run question a parked run is waiting on. Nothing moves
  // until this lands — it is the whole unblock.
  async function answerAwaiting() {
    const text = awaitingText.trim();
    if (!text || awaitingBusy) return;
    setAwaitingBusy(true);
    setAwaitingError("");
    try {
      await drNibApi.answerAwaiting(id, text);
      setAwaitingText("");
      await load();
    } catch (e: any) {
      setAwaitingError(e?.message || "That didn't go through — retry.");
    } finally {
      setAwaitingBusy(false);
    }
  }
  // SSE, and the server replays anything a reconnect missed. Only if the
  // stream itself fails does the page degrade to slow polling — silence is
  // never an option while a run is moving.
  // Guidance typed while the run is moving. The server holds it until the
  // current stage ends, then the worker picks it up — the box always
  // accepts it, the run applies it when safe.
  const [guidance, setGuidance] = useState("");
  const [guidanceBusy, setGuidanceBusy] = useState(false);
  const [guidanceNote, setGuidanceNote] = useState("");
  async function sendGuidance() {
    const text = guidance.trim();
    if (!text || guidanceBusy) return;
    setGuidanceBusy(true);
    setGuidanceNote("");
    try {
      await drNibApi.sendGuidance(id, text);
      setGuidance("");
      setGuidanceNote("Noted — applies at the next stage boundary.");
      await load();
    } catch (e: any) {
      setGuidanceNote(e?.message || "That didn't go through — retry.");
    } finally {
      setGuidanceBusy(false);
    }
  }

  // Live log behavior: the feed is a tail — new activity pins to the bottom
  // only if the reader is already there, so reading back never yanks.
  const feedRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef(true);
  useEffect(() => {
    const el = feedRef.current;
    if (el && tailRef.current) el.scrollTop = el.scrollHeight;
  }, [run]);

  // Live first, polling never: the run page follows the run's event log over
  // SSE, and the server replays anything a reconnect missed. Only if the
  // stream itself fails does the page degrade to slow polling.
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

  const statusStyle: Record<string, string> = {
    running: "bg-black text-white",
    awaiting: "bg-white text-black border-2 border-black",
    paused: "bg-black/10 text-black",
    complete: "bg-emerald-100 text-emerald-900 border border-emerald-300",
    failed: "bg-red-100 text-red-800 border border-red-300",
  };
  const pill = statusStyle[run.status] || "bg-black/10 text-black";

  const banner: Record<string, string> = {
    planning: "Planning the run — breaking the brief into answerable questions.",
    planned: "Plan is ready — approve it from Research to start spending.",
    running: (run.steps || []).length === 0
      ? "Approved — starting the first pass now."
      : "Running — steps, sources, and the report appear below as they land.",
    awaiting: "Parked — Dr. Nib needs one answer from you to continue.",
    paused: run.pauseReason === "cap"
      ? "Parked at the budget cap — raise it to continue."
      : "Paused by you — resume when ready.",
    complete: "Complete — the report below is the finished product.",
    failed: "This run failed — the unspent balance was refunded.",
    ended: "Ended — the unspent balance was refunded.",
  };

  return (
    <div>
      {/* Run header: its own compact design, not the site display header.
          Title is content, not a billboard — status and money lead. */}
      <header className="mb-4 border border-dark-gray/50 bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-dark-gray/30 px-4 py-2">
          <Link href="/dr-nib/projects" className="inline-flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider opacity-60 hover:opacity-100">
            <ArrowLeft size={13} /> Projects
          </Link>
          <span className="flex items-center gap-2">
            {run.status === "running" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-black" />}
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase ${pill}`}>{run.status}</span>
          </span>
        </div>
        <div className="px-4 py-4 md:px-5">
          <h1 className="text-xl font-medium leading-snug md:text-2xl">{topic}</h1>
          <p className="mt-1.5 text-xs opacity-60">
            {run.brief?.depth || "standard"} depth · ${(run.plan?.estimate ?? 0).toFixed(2)} est · ${spent.toFixed(2)} of ${cap.toFixed(2)} spent · {(run.sources || []).length} sources
          </p>
          {banner[run.status] && <p className="mt-2.5 border-l-2 border-black/60 pl-3 text-sm leading-6">{banner[run.status]}</p>}
          {(run.status === "running" || run.status === "paused") && (
            <div className="mt-3 flex gap-2">
              {run.status === "running" && (
                <button onClick={() => drNibApi.pauseRun(id).then(load)} className="inline-flex items-center gap-2 border border-black bg-black px-4 py-1.5 text-sm font-medium text-white"><Pause size={14} aria-hidden="true" /> Pause</button>
              )}
              {run.status === "paused" && (
                <button onClick={() => drNibApi.resumeRun(id).then(load)} className="inline-flex items-center gap-2 border border-black bg-black px-4 py-1.5 text-sm font-medium text-white"><Play size={14} aria-hidden="true" /> Resume</button>
              )}
            </div>
          )}
        </div>
      </header>

      {/* Parked questions live in the right-side composer, not up here: the
          question replaces the guidance box the way an opencode permission
          prompt takes over the prompt area. */}

      {/* Command-center layout: the left column is the work product and scrolls
          with the page; the right column is the agent — the wider panel, fixed
          in place with its own scroll and the composer pinned at the bottom. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="min-w-0">
          {!report && (run.status === "running" || run.status === "paused") && (
            <section className="rounded-2xl border border-dark-gray/50 bg-white p-5">
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
            <section className="rounded-2xl border border-dark-gray/50 bg-white p-5">
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

          {!report && run.status !== "running" && run.status !== "paused" && (
            <section className="rounded-2xl border border-dark-gray/50 bg-white p-5">
              <p className="text-sm font-medium">Report</p>
              <p className="mt-2 text-sm opacity-60">No report yet — it lands here once the run produces one.</p>
            </section>
          )}

          <section className="mt-4 border border-dark-gray/50 bg-white p-4">
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

          <section className="mt-4 border border-dark-gray/50 bg-white p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium">Run budget</p>
              <p className="text-xs opacity-60">${spent.toFixed(2)} of ${cap.toFixed(2)}</p>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--nib-teal)" }} /></div>
          </section>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-4">
          <section className="flex min-h-[60vh] flex-col border border-dark-gray/50 bg-white xl:h-[calc(100vh-9rem)]">
            <div className="flex items-center justify-between gap-2 border-b border-dark-gray/40 px-4 py-3">
              <p className="text-sm font-medium">Agent activity</p>
              <span className="flex items-center gap-1.5 text-[11px] opacity-60">
                <span className={`h-1.5 w-1.5 rounded-full ${streamLive ? "animate-pulse bg-black" : "bg-black/30"}`} />
                {streamLive ? "Live" : "Polling"}
              </span>
            </div>
            <div ref={feedRef} onScroll={(e) => { const el = e.currentTarget; tailRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {(() => {
                const items = buildFeed(run);
                if (!items.length) return <p className="text-sm opacity-60">{run.status === "awaiting" ? "Parked — the question in the box below unblocks it." : "No steps yet — approve the plan to start."}</p>;
                return items.map((item: any, i: number) => {
                  const last = i === items.length - 1;
                  if (item.t === "thinking") {
                    return (
                      <div key={`th-${i}`} className="border-l-2 border-black/40 pl-3">
                        <p className="text-[10px] font-medium uppercase tracking-wider opacity-50">Dr. Nib&apos;s read</p>
                        <p className="mt-0.5 text-[13px] italic leading-6 opacity-80">{item.text}</p>
                      </div>
                    );
                  }
                  if (item.t === "tool") {
                    return (
                      <div key={`tool-${i}`} className="rounded-xl border border-dark-gray/40 bg-white p-2.5">
                        <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[12px]">
                          <span className={item.e.ok ? "opacity-70" : "text-red-700"}>{item.e.ok ? "→" : "✗"} {item.e.tool}</span>
                          {item.e.detail ? <span className="break-all opacity-60">{item.e.detail}</span> : null}
                          {Number(item.e.costUsd) > 0 ? <span className="opacity-50">${Number(item.e.costUsd).toFixed(3)}</span> : null}
                        </p>
                        {!item.e.ok && item.e.error ? <p className="mt-1 font-mono text-[11px] text-red-700">{item.e.error}</p> : null}
                        <ToolResult e={item.e} />
                      </div>
                    );
                  }
                  if (item.t === "parked") {
                    return (
                      <div key={`park-${i}`} className="rounded-xl border-2 border-black bg-white p-2.5">
                        <p className="text-[12px] font-medium">△ Parked with a question — answer it in the box below.</p>
                      </div>
                    );
                  }
                  if (item.t === "marker") {
                    return <p key={`mk-${i}`} className="text-center text-[11px] uppercase tracking-wider opacity-50">— {item.e.type} —</p>;
                  }
                  return <StepDetail key={item.step.id} step={item.step} open={last && item.step.status !== "done"} />;
                });
              })()}
            </div>
            <div className="border-t border-dark-gray/40 p-3">
              {["ended", "complete", "failed"].includes(run.status) ? (
                <p className="px-1 py-2 text-xs opacity-60">Run is over — guidance is closed.</p>
              ) : run.status === "awaiting" && run.pendingQuestion ? (
                <div className="border-2 border-black bg-white p-3">
                  <p className="text-xs font-medium uppercase tracking-wider opacity-60">△ Waiting on you</p>
                  <p className="mt-1 text-[15px] font-medium leading-7">{run.pendingQuestion.prompt}</p>
                  {run.pendingQuestion.why && <p className="mt-0.5 text-xs opacity-70">{run.pendingQuestion.why}</p>}
                  <div className="relative mt-2">
                    <textarea value={awaitingText} onChange={(e) => setAwaitingText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); answerAwaiting(); } }}
                      rows={2} placeholder='Answer, or type "either"'
                      className="w-full resize-none rounded-xl border border-dark-gray/50 bg-white px-3 py-2.5 pb-10 text-sm outline-none" />
                    <button onClick={answerAwaiting} disabled={awaitingBusy || !awaitingText.trim()} aria-label="Send answer"
                      className="absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center bg-black text-white disabled:opacity-50">
                      <Send size={14} aria-hidden="true" />
                    </button>
                  </div>
                  {awaitingError && <p className="mt-1.5 text-[11px] text-red-700">{awaitingError}</p>}
                </div>
              ) : (
                <>
                  <div className="relative">
                    <textarea value={guidance} onChange={(e) => setGuidance(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendGuidance(); } }}
                      rows={2} placeholder="Steer the run — applies at the next stage boundary…"
                      className="w-full resize-none rounded-xl border border-dark-gray/50 bg-white px-3 py-2.5 pb-10 text-sm outline-none" />
                    <button onClick={sendGuidance} disabled={guidanceBusy || !guidance.trim()} aria-label="Send guidance"
                      className="absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center bg-black text-white disabled:opacity-50">
                      <Send size={14} aria-hidden="true" />
                    </button>
                  </div>
                  {guidanceNote && <p className="mt-1.5 px-1 text-[11px] opacity-60">{guidanceNote}</p>}
                </>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

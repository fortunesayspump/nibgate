"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Pause, Play, Send } from "lucide-react";
import { drNibApi } from "@/lib/dr-nib-api";
import { subscribeRunEvents } from "@/lib/dr-nib-events";
import { TrustChip } from "@/components/dr-nib/common";
import { ReportArticle } from "@/components/dr-nib/ReportMarkdown";

// One chronological feed from three sources: the agent's reads (intake
// thinking), the steps with their full outputs, and the tool calls with
// their results. Like the opencode TUI, every tool row shows what it was
// asked AND what came back — a call without its result is a cliffhanger.
function buildFeed(run: any): any[] {
  const items: any[] = [];
  for (const d of run.decisions || []) {
    if (d.kind === "thinking" && d.output?.text) items.push({ t: "thinking", at: d.createdAt, text: d.output.text });
    // Every question asked and every answer given, intake and mid-run alike:
    // the transcript is the run's memory and the owner should see all of it.
    if (d.kind === "question") items.push({ t: "qa", at: d.answeredAt || d.createdAt, d });
    // Every judgement: JEV's pick, its probabilities, and what it read.
    // Technical by design — this is the audit trail, not a summary.
    if (d.kind === "decision" || d.kind === "round-review") items.push({ t: "judge", at: d.createdAt, d });
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

// A JEV judgement as a first-class row: what was decided, the probabilities
// behind it, and the full prompt + output one expand away. Technical on
// purpose — owners audit the decision seat here, not in a log file.
function JudgeRow({ d, enter }: { d: any; enter: string }) {
  const out = d.output || {};
  const label: Record<string, string> = {
    "intake-stop": "Intake call",
    "midrun-ask": "Branch call",
    "source-trust": "Trust call",
    "source-grade": "Grade call",
    "round-continue": "Round call",
  };
  if (d.kind === "round-review") {
    const learnings: string[] = out.learnings || [];
    const followUps: string[] = out.followUps || [];
    return (
      <div className={`rounded-xl border border-dark-gray/40 bg-gray p-2.5${enter}`}>
        <p className="font-mono text-[12px]"><span className="opacity-70">◈ Round review</span>
          {out.source ? <span className="opacity-50"> · {String(out.source)}{out.model ? ` · ${String(out.model).split("/").pop()}` : ""}</span> : null}
        </p>
        {learnings.length > 0 && (
          <ul className="mt-1.5 space-y-0.5">
            {learnings.slice(0, 6).map((l: string, n: number) => (<li key={n} className="text-[12px] leading-5">✓ {l}</li>))}
          </ul>
        )}
        {followUps.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {followUps.slice(0, 4).map((l: string, n: number) => (<li key={n} className="font-mono text-[11px] opacity-60">→ next: {l}</li>))}
          </ul>
        )}
      </div>
    );
  }
  const pick = out.decision || d.answer?.picked || "";
  const probs = out.probabilities ?? out.probability ?? null;
  const probText = probs == null ? "" : typeof probs === "object"
    ? Object.entries(probs).map(([k, v]) => `${k} ${typeof v === "number" ? v.toFixed(2) : v}`).join(" · ")
    : `p=${Number(probs).toFixed(2)}`;
  return (
    <div className={`rounded-xl border border-dark-gray/40 bg-gray p-2.5${enter}`}>
      <p className="font-mono text-[12px]">
        <span className="opacity-70">◈ {label[d.step] || d.step || "Judgement"}</span>
        {pick ? <span className="font-medium"> → {String(pick)}</span> : null}
      </p>
      {probText ? <p className="mt-0.5 font-mono text-[11px] opacity-60">{probText}</p> : null}
      {out.model ? <p className="font-mono text-[11px] opacity-50">{String(out.model)}{out.source && out.source !== out.model ? ` · ${out.source}` : ""}{Number(out.usage?.costUsd) > 0 ? ` · $${Number(out.usage.costUsd).toFixed(4)}` : ""}</p> : null}
      <details className="mt-1">
        <summary className="cursor-pointer font-mono text-[11px] opacity-60">prompt + output</summary>
        {d.prompt ? <p className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] opacity-70">{String(d.prompt).slice(0, 800)}</p> : null}
        <pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] opacity-70">{JSON.stringify(out, null, 1).slice(0, 2000)}</pre>
      </details>
    </div>
  );
}

// Lead image for a source, joined from the fetch step's documents by URL
// (no schema change: images ride step output, sources join at render).
function sourceImage(run: any, url: string): string | null {
  if (!url) return null;
  for (const s of run.steps || []) {
    for (const d of s.output?.documents || []) {
      if (d.url === url && d.image) return d.image;
    }
  }
  return null;
}

// Full chat transcript as markdown: every question, answer, read,
// judgement, step, and tool call with its costs. The ops audit in one file.
function chatTranscript(run: any): string {
  const L: string[] = [];
  const money = (v: any) => (Number(v) > 0 ? ` $${Number(v).toFixed(4)}` : "");
  L.push(`# Dr. Nib run: ${run.brief?.topic || run.title || run.id}`);
  L.push(`- status: ${run.status} · spent $${Number(run.spent || 0).toFixed(2)} of $${Number(run.budgetCap || 0).toFixed(2)} · report v${run.versions || 0}`);
  L.push(`- run: ${run.id}`);
  const decisions: any[] = run.decisions || [];
  const qa = decisions.filter((d: any) => d.kind === "question");
  if (qa.length) {
    L.push(`\n## Questions & answers`);
    for (const d of qa) {
      L.push(`\n### [${d.step === "midrun" ? "mid-run" : "intake"}] ${d.prompt || d.question?.prompt || ""}`);
      L.push(d.answer != null ? `You: ${formatAnswer(d) || "(skipped)"}` : `(unanswered)`);
    }
  }
  const reads = decisions.filter((d: any) => d.kind === "thinking" && d.output?.text);
  if (reads.length) {
    L.push(`\n## Reads`);
    for (const d of reads) L.push(`- (${d.output?.model || d.step || "note"}) ${d.output.text}`);
  }
  const judges = decisions.filter((d: any) => d.kind === "decision" || d.kind === "round-review");
  if (judges.length) {
    L.push(`\n## Judgements`);
    for (const d of judges) {
      const out = d.output || {};
      if (d.kind === "round-review") {
        L.push(`- round review [${d.step}]: ${(out.learnings || []).join(" / ")}${(out.followUps || []).length ? ` → next: ${out.followUps.join(" / ")}` : ""}`);
      } else {
        const probs = out.probabilities ?? out.probability;
        L.push(`- ${d.step}: ${out.decision || d.answer?.picked || "?"}${probs != null ? ` (${JSON.stringify(probs)})` : ""}${out.model ? ` · ${out.model}` : ""}${money(out.usage?.costUsd)}`);
      }
    }
  }
  const steps: any[] = run.steps || [];
  if (steps.length) {
    L.push(`\n## Steps`);
    for (const s of steps) {
      const out = s.output || {};
      L.push(`\n### ${s.kind} (${s.status}${money(out.costUsd)})`);
      if (out.why) L.push(out.why);
      if (out.queries?.length) L.push(`queries: ${out.queries.join(" / ")}`);
      if (out.providers?.length) L.push(`via: ${out.providers.map((p: any) => (typeof p === "string" ? p : `${p.name}${p.ok === false ? " (failed: " + p.error + ")" : ` · ${p.count ?? ""}`}`)).join(" + ")}`);
      if (out.tips?.length) L.push(`tips: ${out.tips.map((t: any) => `${t.ok ? "✓" : "✗"} ${t.why || t.tool}${t.txHash ? ` (${t.txHash})` : ""}${t.error ? ` — ${t.error}` : ""}`).join(" / ")}`);
    }
  }
  const events: any[] = run.events || [];
  const tools = events.filter((e: any) => e.type === "tool.call");
  if (tools.length) {
    L.push(`\n## Tool calls`);
    for (const e of tools) {
      L.push(`- ${e.ok === false ? "✗" : "→"} ${e.tool}${e.detail ? ` — ${e.detail}` : ""}${money(e.costUsd)}${e.ok === false && e.error ? ` — ${e.error}` : ""}`);
    }
  }
  if ((run.sources || []).length) {
    L.push(`\n## Sources`);
    for (const [n, s] of (run.sources as any[]).entries()) {
      L.push(`[${n + 1}] ${s.title || s.url} — ${s.url}${typeof s.trust === "number" ? ` (trust ${s.trust})` : ""}`);
    }
  }
  return L.join("\n");
}

// An answer is one of several shapes (typed text, picked options, checked
// options) — render what the owner actually said, not the JSON.
function formatAnswer(d: any): string {
  const a = d.answer;
  if (a == null) return "";
  if (typeof a.text === "string" && a.text.trim()) return a.text.trim();
  const q = d.question || {};
  const opts: any[] = Array.isArray(q.options) ? q.options : [];
  const label = (id: string) => opts.find((o) => o.id === id)?.label || id;
  if (typeof a.picked === "string") return label(a.picked);
  if (Array.isArray(a.picked)) return a.picked.map(label).join(", ");
  if (typeof a === "string") return a;
  return "";
}

function StepDetail({ step, open }: { step: any; open: boolean }) {
  const out = step.output || {};
  const active = step.status === "active";
  const activity: Record<string, string> = {
    plan: "Breaking the brief into questions…",
    search: "Searching providers…",
    fetch: "Reading pages…",
    data: "Calling primary sources…",
    score: "Judging sources…",
    write: "Writing the report…",
  };
  return (
    <div className="rounded-xl border border-dark-gray/40 bg-gray p-3">
      <p className="flex flex-wrap items-center gap-2 text-[13px]">
        <span className={`h-1.5 w-1.5 rounded-full ${step.status === "done" ? "" : active ? "animate-pulse bg-black" : "bg-black/25"}`} style={step.status === "done" ? { background: "var(--nib-teal)" } : undefined} />
        <span className="font-medium capitalize">{step.kind}</span>
        <span className="opacity-50">{active ? <span className="drnib-stream-caret">{activity[step.kind] || "Working…"}</span> : step.status}</span>
        {Number(out.costUsd) > 0 ? <span className="font-mono text-[11px] opacity-50">${Number(out.costUsd).toFixed(3)}</span> : null}
      </p>
      {active && <div className="drnib-shimmer-track mt-2 h-1 w-full rounded-full" aria-hidden="true" />}
      {out.why ? <p className="mt-1.5 text-[13px] leading-6 opacity-80">{out.why}</p> : null}
      {out.error ? <p className="mt-1.5 text-[13px] text-red-700">{out.error}</p> : null}
      {(out.providers || []).length > 0 || out.fallback === true || out.attempted === false ? (
        <p className="mt-1.5 font-mono text-[11px] opacity-60">
          {out.fallback === true || out.attempted === false
            ? "offline stub — no provider reached"
            : `via ${(out.providers || []).map((p: any) => typeof p === "string" ? p : `${p.name}${p.ok === false ? " (failed)" : p.count != null ? ` · ${p.count}` : ""}`).join(" + ")}`}
        </p>
      ) : null}
      {((out.providers || []) as any[]).some((p) => p && typeof p === "object" && p.ok === false && p.error) ? (
        <ul className="mt-1 space-y-0.5">
          {(out.providers as any[]).filter((p) => p?.ok === false && p?.error).map((p: any, n: number) => (
            <li key={n} className="font-mono text-[11px] text-red-700">{p.name}: {String(p.error).slice(0, 160)}</li>
          ))}
        </ul>
      ) : null}
      {(out.queries || []).length > 0 ? (
        <div className="mt-2">
          <p className="text-[10px] font-medium uppercase tracking-wider opacity-50">Queries</p>
          <ul className="mt-0.5 space-y-0.5">{out.queries.map((q: string) => (<li key={q} className="font-mono text-[11px] opacity-70">“{q}”</li>))}</ul>
        </div>
      ) : null}
      {(out.results || []).length > 0 ? (
        <details className="mt-2" open={open}>
          <summary className="cursor-pointer text-[11px] font-medium opacity-70">{out.results.length} hits</summary>
          <ul className="mt-1 space-y-1.5">
            {out.results.map((r: any, n: number) => (
              <li key={r.url || n} className="text-[12px] leading-5">
                <span className="font-medium">{r.title || r.url}</span>
                {r.url ? <span className="block break-all font-mono text-[11px] opacity-50">{r.url}</span> : null}
                {r.snippet || r.content ? <span className="block opacity-60">{String(r.snippet || r.content)}</span> : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {(out.documents || []).length > 0 ? (
        <details className="mt-2" open={open}>
          <summary className="cursor-pointer text-[11px] font-medium opacity-70">{out.documents.length} pages read</summary>
          <ul className="mt-1 space-y-1.5">
            {out.documents.map((d: any, n: number) => {
              const text = String(d.text || "");
              const capped = text.length > 5000;
              return (
                <li key={d.url || n} className="text-[12px] leading-5">
                  <span className="font-medium">{d.title || d.url}</span>
                  <span className="font-mono text-[11px] opacity-50"> · {text.length.toLocaleString()} chars{capped ? " (first 5,000 shown)" : ""}</span>
                  {text ? <span className="block whitespace-pre-wrap opacity-60">{capped ? text.slice(0, 5000) : text}</span> : null}
                </li>
              );
            })}
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
  const [reportVersion, setReportVersion] = useState<number | null>(null);
  const [endArmed, setEndArmed] = useState(false);
  const [endBusy, setEndBusy] = useState(false);
  const [raiseAmt, setRaiseAmt] = useState("");
  const [raiseBusy, setRaiseBusy] = useState(false);
  const [raiseError, setRaiseError] = useState("");

  async function load() {
    try {
      const r = await drNibApi.getRun(id);
      setRun(r);
      try { setReport(await drNibApi.getReport(id, reportVersion ?? undefined)); } catch { setReport(null); }
    } catch (e: any) { setError(e.message); }
  }

  async function endRun() {
    if (!endArmed) { setEndArmed(true); return; }
    setEndBusy(true);
    try {
      await drNibApi.endRun(id);
      setEndArmed(false);
      await load();
    } catch (e: any) { setError(e?.message || "End failed."); }
    finally { setEndBusy(false); }
  }

  async function raiseCap() {
    const amount = Number(raiseAmt);
    if (!(amount > 0)) { setRaiseError("Enter an amount above 0."); return; }
    setRaiseBusy(true);
    setRaiseError("");
    try {
      await drNibApi.topUp(id, amount);
      setRaiseAmt("");
      await load();
    } catch (e: any) { setRaiseError(e?.message || "Raise failed."); }
    finally { setRaiseBusy(false); }
  }

  // Exports render on demand from the finished report and download directly.
  async function downloadExport(format: string) {
    setExportError("");
    try {
      const out = await drNibApi.createExport(id, format);
      // Binary deliverables are stored in R2: the server returns a URL and no
      // inline bytes. Open it rather than fabricating an empty download.
      if (out.url && out.content == null) {
        window.open(out.url, "_blank", "noopener");
        return;
      }
      let data: BlobPart = out.content ?? "";
      if (out.encoding === "base64" && typeof out.content === "string") {
        const bin = atob(out.content);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
        data = bytes;
      }
      const blob = new Blob([data], { type: out.contentType || "text/plain" });
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
  async function answerAwaiting(optionId?: string) {
    const text = awaitingText.trim();
    if ((!text && !optionId) || awaitingBusy) return;
    setAwaitingBusy(true);
    setAwaitingError("");
    try {
      await drNibApi.answerAwaiting(id, optionId ? { optionId } : text);
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

  // Reprompt: a finished run goes again with a new prompt. New version, every
  // stage re-executes, the prompt steers the pass. Needs balance — the button
  // says so when there is none.
  const [reprompt, setReprompt] = useState("");
  const [repromptBusy, setRepromptBusy] = useState(false);
  const [repromptError, setRepromptError] = useState("");
  async function sendReprompt() {
    const text = reprompt.trim();
    if (!text || repromptBusy) return;
    setRepromptBusy(true);
    setRepromptError("");
    try {
      await drNibApi.repromptRun(id, text);
      setReprompt("");
      await load();
    } catch (e: any) {
      setRepromptError(e?.message || "That didn't go through — retry.");
    } finally {
      setRepromptBusy(false);
    }
  }

  // Live log behavior: the feed is a tail — new activity pins to the bottom
  // only if the reader is already there, so reading back never yanks.
  const feedRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef(true);
  // New arrivals slide in; refetches never replay. Keys are chronological, so
  // anything past the previous count is new.
  const feedItems = buildFeed(run);
  const seenFeedCount = useRef(0);
  useEffect(() => {
    seenFeedCount.current = feedItems.length;
  }, [feedItems.length]);
  useEffect(() => {
    const el = feedRef.current;
    if (el && tailRef.current) el.scrollTop = el.scrollHeight;
  }, [run]);

  // Live first, polling never: the run page follows the run's event log over
  // SSE, and the server replays anything a reconnect missed. Only if the
  // stream itself fails does the page degrade to slow polling.
  // Token deltas ride the same stream (ephemeral, never persisted): they
  // accumulate into the "writing now" preview, everything else reloads.
  const [writingNow, setWritingNow] = useState<{ section: number; of: number; text: string } | null>(null);
  useEffect(() => {
    setWritingNow(null);
  }, [report?.version]);
  useEffect(() => {
    load();
    let poll: ReturnType<typeof setInterval> | null = null;
    const unsub = subscribeRunEvents(
      id,
      (e: any) => {
        if (e?.type === "token" && typeof e?.delta === "string") {
          const section = Number(e.section) || 0;
          const of = Number(e.of) || 0;
          setWritingNow((prev) => ({
            section, of,
            text: (prev && prev.section === section ? prev.text : "") + e.delta,
          }));
          return;
        }
        load();
      },
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
  // Honest empties: a finished search with zero sources is a finding ("asked,
  // found nothing"), not a loading state — say so instead of promising live
  // content that is never coming.
  const searchDone = (run.steps || []).some((s: any) => s.kind === "search" && s.status === "done");
  const nothingFound = searchDone && (run.sources || []).length === 0;

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
      {/* Command-center layout: the left column is the run — header, work
          product, budget — kept deliberately narrow; the right column is the
          agent, the wider panel, fixed in place with its own scroll and the
          composer pinned at the bottom. */}
      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]">
        <div className="min-w-0">
      {/* Run header: compact, lives in the left column. Title is content,
          not a billboard — status and money lead. */}
      <header className="border border-dark-gray/50 bg-white">
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
          {(["intake", "intake-done", "planning", "planned", "running", "paused", "awaiting"] as string[]).includes(run.status) && (
            <div className="mt-3">
              <button onClick={endRun} disabled={endBusy} className="inline-flex items-center gap-2 border border-dark-gray/60 px-4 py-1.5 text-sm font-medium hover:bg-black hover:text-white disabled:opacity-50">{endBusy ? "Ending…" : endArmed ? "Click again to end + refund" : "End run"}</button>
            </div>
          )}
        </div>
      </header>

          {!report && (run.status === "running" || run.status === "paused") && !nothingFound && (
            <section className="mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5">
              <p className="text-sm font-medium">
                {writingNow ? `Writing now${writingNow.of ? ` — section ${writingNow.section} of ${writingNow.of}` : ""}` : "Report"}
              </p>
              {writingNow ? (
                <div>
                  <div className="drnib-shimmer-track mb-2 mt-3 h-1 w-full rounded-full" aria-hidden="true" />
                  <p className="mt-1 max-h-48 overflow-hidden whitespace-pre-wrap text-[13px] leading-6 opacity-80">
                    <span className="drnib-stream-caret">…{writingNow.text.slice(-800)}</span>
                  </p>
                </div>
              ) : (
                <>
                  <div className="mt-3 space-y-2" aria-hidden="true">
                    <div className="h-3 w-3/4 animate-pulse rounded bg-black/10" />
                    <div className="h-3 w-full animate-pulse rounded bg-black/10" />
                    <div className="h-3 w-5/6 animate-pulse rounded bg-black/10" />
                  </div>
                  <p className="mt-3 text-xs opacity-60">Research is still moving — sections land here as steps complete.</p>
                </>
              )}
            </section>
          )}

          {!report && nothingFound && (
            <section className="mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5">
              <p className="text-sm font-medium">Report</p>
              <p className="mt-2 text-sm opacity-60">Search finished with no candidates, so there is nothing to write from. Steer the run from the activity panel, or end it and keep the unspent balance.</p>
            </section>
          )}

          {!report && !nothingFound && run.status !== "running" && run.status !== "paused" && (
            <section className="mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5">
              <p className="text-sm font-medium">Report</p>
              <p className="mt-2 text-sm opacity-60">No report yet — it lands here once the run produces one.</p>
            </section>
          )}

          {report && (
            <section className="mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="flex items-center gap-2 text-sm font-medium">
                  Report · v{report.version}
                  <Link href={`/dr-nib/research/${id}/report`} className="text-xs font-normal underline opacity-60 hover:opacity-100">Open as article ↗</Link>
                  {Number(run.versions) > 1 && (
                    <select
                      aria-label="Report version"
                      value={reportVersion ?? report.version}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setReportVersion(v >= Number(run.versions) ? null : v);
                      }}
                      className="border border-dark-gray/50 bg-white px-2 py-1 text-xs"
                    >
                      {Array.from({ length: Number(run.versions) }, (_, i) => i + 1).reverse().map((v) => (
                        <option key={v} value={v}>v{v}{v === Number(run.versions) ? " (latest)" : ""}</option>
                      ))}
                    </select>
                  )}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {["md", "json", "bibtex", "pdf", "word", "excel", "powerpoint"].map((f) => (
                    <button key={f} onClick={() => downloadExport(f)} className="border border-dark-gray/60 px-2.5 py-1 text-[11px] font-medium uppercase">{f}</button>
                  ))}
                </div>
              </div>
              {exportError ? <p className="mb-2 text-xs text-red-700">{exportError}</p> : null}
              <ReportArticle markdown={report.markdown} />
            </section>
          )}

          <section id="drnib-sources" className="mt-4 scroll-mt-4 border border-dark-gray/50 bg-white p-4">
            <p className="mb-3 text-sm font-medium">Sources ({(run.sources || []).length})</p>
            {(run.sources || []).length === 0 ? (
              <p className="text-xs opacity-60">{searchDone ? "Search finished with no candidates — nothing to score." : "Sources appear here as the run finds and scores them."}</p>
            ) : (
              <ul className="space-y-2">
                {run.sources.map((s: any, i: number) => (
                  <li key={s.id} className="flex gap-2.5 rounded-xl border border-dark-gray/40 bg-gray p-2.5">
                    {(() => {
                      const img = sourceImage(run, s.url);
                      return img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" loading="lazy" className="h-14 w-14 shrink-0 rounded-lg border border-dark-gray/40 object-cover" />
                      ) : null;
                    })()}
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium leading-snug">[{i + 1}] {s.title || s.url}</p>
                      <div className="mt-1 flex items-center justify-between gap-2">
                        <span className="break-all text-[11px] opacity-60">{s.domain || s.url}</span>
                        {typeof s.trust === "number" ? <TrustChip trust={s.trust >= 0.7 ? "high" : s.trust >= 0.4 ? "medium" : "low"} /> : null}
                      </div>
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
            {(["intake", "intake-done", "planning", "planned", "running", "paused", "awaiting"] as string[]).includes(run.status) && (
              <div className="mt-3 flex items-center gap-2">
                <input
                  type="number" min={0.1} step={0.1} value={raiseAmt}
                  onChange={(e) => setRaiseAmt(e.target.value)}
                  placeholder={`New cap total (now $${cap.toFixed(2)})`}
                  aria-label="New cap total in USDC"
                  className="w-52 border border-dark-gray/50 bg-white px-3 py-1.5 text-sm"
                />
                <button onClick={raiseCap} disabled={raiseBusy} className="border border-dark-gray/60 px-4 py-1.5 text-sm font-medium hover:bg-black hover:text-white disabled:opacity-50">
                  {raiseBusy ? "Raising…" : "Raise cap"}
                </button>
              </div>
            )}
            {raiseError ? <p className="mt-2 text-xs text-red-700">{raiseError}</p> : null}
          </section>
        </div>

        <aside className="min-w-0 xl:sticky xl:top-4">
          <section className="flex min-h-[60vh] flex-col border border-dark-gray/50 bg-white xl:h-[calc(100vh-9rem)]">
            <div className="flex items-center justify-between gap-2 border-b border-dark-gray/40 px-4 py-3">
              <p className="text-sm font-medium">Agent activity</p>
              <span className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const blob = new Blob([chatTranscript(run)], { type: "text/markdown" });
                    const a = document.createElement("a");
                    a.href = URL.createObjectURL(blob);
                    a.download = `drnib-chat-${String(id).slice(0, 8)}.md`;
                    a.click();
                    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
                  }}
                  className="text-[11px] font-medium uppercase tracking-wider opacity-60 hover:opacity-100"
                  title="Download the full chat transcript as markdown"
                >
                  Export chat
                </button>
                <span className="flex items-center gap-1.5 text-[11px] opacity-60">
                  <span className={`h-1.5 w-1.5 rounded-full ${streamLive ? "animate-pulse bg-black" : "bg-black/30"}`} />
                  {streamLive ? "Live" : "Polling"}
                </span>
              </span>
            </div>
            <div ref={feedRef} onScroll={(e) => { const el = e.currentTarget; tailRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; }}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {(() => {
                const items = feedItems;
                if (!items.length) return <p className="text-sm opacity-60">{run.status === "awaiting" ? "Parked — the question in the box below unblocks it." : "No steps yet — approve the plan to start."}</p>;
                return items.map((item: any, i: number) => {
                  const last = i === items.length - 1;
                  // Fresh arrivals slide in; everything already seen renders static.
                  const enter = i >= seenFeedCount.current ? " drnib-feed-enter" : "";
                    if (item.t === "thinking") {
                    return (
                      <div key={`th-${i}`} className={`border-l-2 border-black/40 pl-3${enter}`}>
                        <p className="text-[10px] font-medium uppercase tracking-wider opacity-50">Dr. Nib&apos;s read</p>
                        <p className="mt-0.5 text-[13px] italic leading-6 opacity-80">{item.text}</p>
                      </div>
                    );
                  }
                  if (item.t === "judge") {
                    return <JudgeRow key={`jg-${i}`} d={item.d} enter={enter} />;
                  }
                  if (item.t === "qa") {                    const ans = formatAnswer(item.d);
                    const skipped = item.d.answer != null && !ans;
                    return (
                      <div key={`qa-${i}`} className={`rounded-xl border-2 border-black bg-white p-3${enter}`}>
                        <p className="text-[10px] font-medium uppercase tracking-wider opacity-50">
                          {item.d.step === "midrun" ? "Mid-run question" : "Intake question"}{item.d.answer == null ? " · unanswered" : skipped ? " · skipped" : ""}
                        </p>
                        <p className="mt-1 text-[13px] font-medium leading-6">{item.d.prompt || item.d.question?.prompt}</p>
                        {item.d.answer != null ? (
                          <p className="mt-1.5 border-l-2 border-black/60 pl-2.5 text-[13px] leading-6">{skipped ? <span className="opacity-50">Skipped — no answer recorded</span> : `You: ${ans}`}</p>
                        ) : null}
                      </div>
                    );
                  }
                  if (item.t === "tool") {
                    return (
                      <div key={`tool-${i}`} className={`rounded-xl border border-dark-gray/40 bg-white p-2.5${enter}`}>
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
                      <div key={`park-${i}`} className={`rounded-xl border-2 border-black bg-white p-2.5${enter}`}>
                        <p className="text-[12px] font-medium">△ Parked with a question — answer it in the box below.</p>
                      </div>
                    );
                  }
                  if (item.t === "marker") {
                    return <p key={`mk-${i}`} className={`text-center text-[11px] uppercase tracking-wider opacity-50${enter}`}>— {item.e.type} —</p>;
                  }
                  return <div key={item.step.id} className={enter ? "drnib-feed-enter" : undefined}><StepDetail step={item.step} open={last && item.step.status !== "done"} /></div>;
                });
              })()}
            </div>
            <div className="border-t border-dark-gray/40 p-3">
              {["ended", "complete", "failed"].includes(run.status) ? (
                <div className="border-2 border-black bg-white p-3">
                  <p className="text-xs font-medium uppercase tracking-wider opacity-60">↻ Run it again, with a steer</p>
                  <p className="mt-1 text-xs opacity-60">New version — every stage re-executes and your prompt steers the pass. Needs balance.</p>
                  <div className="relative mt-2">
                    <textarea value={reprompt} onChange={(e) => setReprompt(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReprompt(); } }}
                      rows={2} placeholder='e.g. "redo the search with shorter queries, then hit public APIs"'
                      className="w-full resize-none rounded-xl border border-dark-gray/50 bg-white px-3 py-2.5 pb-10 text-sm outline-none" />
                    <button onClick={sendReprompt} disabled={repromptBusy || !reprompt.trim()} aria-label="Send reprompt"
                      className="absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center bg-black text-white disabled:opacity-50">
                      <Send size={14} aria-hidden="true" />
                    </button>
                  </div>
                  {repromptError && <p className="mt-1.5 text-[11px] text-red-700">{repromptError}</p>}
                </div>
              ) : run.status === "awaiting" && run.pendingQuestion ? (
                <div className="border-2 border-black bg-white p-3">
                  <p className="text-xs font-medium uppercase tracking-wider opacity-60">△ Waiting on you</p>
                  <p className="mt-1 text-[15px] font-medium leading-7">{run.pendingQuestion.prompt}</p>
                  {run.pendingQuestion.why && <p className="mt-0.5 text-xs opacity-70">{run.pendingQuestion.why}</p>}
                  {Array.isArray(run.pendingQuestion.options) && run.pendingQuestion.options.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {run.pendingQuestion.options.map((o: any) => (
                        <button key={o.id || o.label} onClick={() => answerAwaiting(o.id)} disabled={awaitingBusy} data-testid="awaiting-option"
                          className="flex w-full items-center gap-3 border border-dark-gray/50 bg-white px-4 py-2.5 text-left text-sm hover:border-black disabled:opacity-50">
                          <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-dark-gray/60" />
                          {o.label || o.id}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="relative mt-2">
                    <textarea value={awaitingText} onChange={(e) => setAwaitingText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); answerAwaiting(); } }}
                      rows={2} placeholder='Answer, or type "either"'
                      className="w-full resize-none rounded-xl border border-dark-gray/50 bg-white px-3 py-2.5 pb-10 text-sm outline-none" />
                      <button onClick={() => answerAwaiting()} disabled={awaitingBusy || !awaitingText.trim()} aria-label="Send answer"
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

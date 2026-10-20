"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Pause, Play, Send } from "lucide-react";
import { drNibApi } from "@/lib/dr-nib-api";
import { subscribeRunEvents } from "@/lib/dr-nib-events";
import { explorerTxUrl } from "@nibgate/wallet";
import { TrustChip } from "@/components/dr-nib/common";
import { EscrowDeposit } from "@/components/dr-nib/EscrowDeposit";
import { SourceManager } from "@/components/dr-nib/SourceManager";
import {RunWorkDuration} from '@/components/dr-nib/RunWorkDuration';
import {PrivateExpenseReceipt} from '@/components/dr-nib/PrivateExpenseReceipt';
import { ReportArticle, ReportEvidence, ReportQA, DiscussThread } from "@/components/dr-nib/ReportMarkdown";
import {privateBuildEnabled,privateFundingEnabled} from '@/lib/dr-nib-private-records';
import {drNibFeedKey,privateResearchActivity,drNibToolFailed,deduplicateDrNibRows,drNibHasPendingQuestion,drNibQuestionMarker} from '@/lib/dr-nib-feed';
import {formatDrNibAnswer as formatAnswer} from '@/lib/dr-nib-question-history';
const PrivateSourceTip=dynamic(()=>import('@/components/dr-nib/PrivateSourceTip').then(module=>module.PrivateSourceTip),{ssr:false});

// One chronological feed from three sources: the agent's reads (intake
// thinking), the steps with their full outputs, and the tool calls with
// their results. Like the opencode TUI, every tool row shows what it was
// asked AND what came back — a call without its result is a cliffhanger.
function buildFeed(run: any): any[] {
  const items: any[] = [];
  if (!run) return items;
  for (const d of deduplicateDrNibRows(run.decisions || [])) {
    if (d.kind === "thinking" && d.output?.text) items.push({ t: "thinking", at: d.createdAt, text: d.output.text });
    // Every question asked and every answer given, intake and mid-run alike:
    // the transcript is the run's memory and the owner should see all of it.
    if (d.kind === "question") items.push({ t: "qa", at: d.answeredAt || d.createdAt, d });
    // Every judgement: JEV's pick, its probabilities, and what it read.
    // Technical by design — this is the audit trail, not a summary.
    if (d.kind === "decision" || d.kind === "round-review") items.push({ t: "judge", at: d.createdAt, d });
  }
  for (const s of deduplicateDrNibRows(run.steps || [])) items.push({ t: "step", at: s.createdAt, step: s });
  for (const e of deduplicateDrNibRows(run.events || [])) {
    if (e.type === "tool.call") items.push({ t: "tool", at: e.at, e });
    else if (e.type === "agent.decision") items.push({t:"agent-decision",at:e.at,e});
    else if ((e.type === "thinking" || e.type === "thinking.fallback") && e.text) items.push({ t: "progress-note", at: e.at, e });
    else if (e.type === "awaiting" && !(run.decisions??[]).some((d:any)=>d.kind==='question'&&d.answer!=null&&(d.questionId??d.question?.id)===e.question?.id)) items.push({ t: "parked", at: e.at, e });
    else if (e.type === "guidance.applied") items.push({ t: "note", at: e.at, e });
    else if (e.type === "failed" || e.type === "complete") items.push({ t: "marker", at: e.at, e });
  }
  if(privateBuildEnabled()&&run.status==='complete'&&run.claims?.length){
    const supported=run.claims.filter((c:any)=>(c.status??c.verdict)==='supported').length;
    items.push({t:'verification-summary',at:run.reports?.at(-1)?.createdAt??run.updatedAt,supported,total:run.claims.length});
  }
  items.sort((a, b) => +new Date(a.at || 0) - +new Date(b.at || 0));
  return items;
}

function ToolResult({ e }: { e: any }) {
  const r = e.result;
  if (!r) return null;
  if(r.declined)return <p className="mt-1 text-[11px] opacity-70">Skipped by you; no payment sent.</p>;
  if(e.tool==='tip_creator'&&r.ok)return <p className="mt-1 text-[11px] opacity-70">→ Creator tip {r.output?.held?'deposited for creator claim':'confirmed'}.</p>;
  if(r.output?.contentUnavailable)return <p className="mt-1 text-[11px] opacity-70">Payment recorded; content delivery needs recovery.</p>;
  if(e.tool==='compute'&&typeof r.result==='number')return <p className="mt-1 font-mono text-[11px] opacity-70">→ {r.result}</p>;
  if(e.tool==='public_research'&&Number.isSafeInteger(r.count))return <p className="mt-1 font-mono text-[11px] opacity-70">→ {r.count} retained public source{r.count===1?'':'s'}</p>;
  if(e.tool==='search_evidence'&&Array.isArray(r.items))return <details className="mt-1"><summary className="cursor-pointer text-[11px] opacity-70">{r.items.length} passage previews · {r.count??r.items.length} matching chunks{r.truncated?' · shortened':''}</summary>{r.items.map((item:any,i:number)=><blockquote key={`${item.sourceId}-${item.index}-${i}`} className="mt-2 border-l-2 border-dark-gray/40 pl-2 text-[12px] leading-5"><p className="font-mono text-[10px] opacity-60">Source {item.sourceId} · chunk {item.index+1}</p>{item.text}</blockquote>)}</details>;
  if(e.tool==='run_code'&&r.runtime==='quickjs-wasm')return <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] opacity-70">{JSON.stringify(r.result,null,2)}</pre>;
  if (e.tool === "run_code" || e.tool === "run_terminal") {
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
  const items: any[] = r.items || r.output?.sources || r.output?.documents || [];
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
    "intake-gate": "Clarify the brief",
    "source-review": "Review the evidence",
    "source-context-review": "Review the requested article",
    "agent-tool": "Choose the next action",
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
  const proposal=d.context?.proposal??d.question?.state?.proposal;
  const candidateIndex=d.step==='intake-gate'?String(d.prompt??'').match(/candidate intake question (\d+)/)?.[1]:undefined;
  const candidate=d.context?.candidate??(candidateIndex!==undefined?d.question?.state?.candidates?.[Number(candidateIndex)]:null);
  const readablePick=d.step==='intake-gate'&&pick==='skip'?'No extra question needed':d.step==='agent-tool'&&pick==='answer'?'Write the report':pick;
  const probs = out.probabilities ?? out.probability ?? null;
  const probText = probs == null ? "" : typeof probs === "object"
    ? Object.entries(probs).map(([k, v]) => `${k} ${typeof v === "number" ? v.toFixed(2) : v}`).join(" · ")
    : `p=${Number(probs).toFixed(2)}`;
  return (
    <div className={`rounded-xl border border-dark-gray/40 bg-gray p-2.5${enter}`}>
      <p className="font-mono text-[12px]">
        <span className="opacity-70">◈ {label[d.step] || d.step || "Judgement"}</span>
        {readablePick ? <span className="font-medium"> → {String(readablePick)}</span> : null}
        {/* A cap override is not a judgement: JEV said ask_more and the
            question budget said stop. Without this the owner sees
            "ask_more 0.70 → proceed" and reads it as the judge being
            ignored — seen live after batch 5. */}
        {out.capped ? <span className="opacity-60"> · cap hit ({out.cap} questions)</span> : null}
        <FeedTime at={d.createdAt} />
      </p>
      {proposal&&<p className="mt-1 text-[12px] leading-5">Proposed action: {String(proposal.tool)}. {String(proposal.why??'')}</p>}
      {candidate?.prompt&&<p className="mt-1 text-[12px] leading-5">Considered question: {String(candidate.prompt)}</p>}
      {d.step==='source-review'&&d.prompt&&<p className="mt-1 text-[12px] leading-5">{String(d.prompt)}</p>}
      {probText ? <p className="mt-0.5 font-mono text-[11px] opacity-60">{probText}</p> : null}
      {out.model ? <p className="font-mono text-[11px] opacity-50">{String(out.model)}{out.source && out.source !== out.model ? ` · ${out.source}` : ""}{out.usage?.costAllocation==='included-in-request'?' · included in the same JEV request':typeof out.usage?.costUsd==='number'?` · $${Number(out.usage.costUsd).toFixed(6)}`:''}</p> : null}
      <details className="mt-1">
        <summary className="cursor-pointer font-mono text-[11px] opacity-60">prompt + output</summary>
        {d.prompt ? <p className="mt-1 whitespace-pre-wrap break-all font-mono text-[11px] opacity-70">{String(d.prompt).slice(0, 800)}</p> : null}
        {d.question?.state&&<pre className="mt-1 max-h-48 overflow-y-auto whitespace-pre-wrap break-all font-mono text-[11px] opacity-70">{JSON.stringify(d.question.state,null,1)}</pre>}
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
  const money = (v: any) => (typeof v==='number'&&Number.isFinite(v)&&v>=0 ? ` $${v.toFixed(6)}` : "");
  L.push(`# Dr. Nib run: ${run.brief?.topic || run.title || run.id}`);
  L.push(`- status: ${run.status} · spent $${Number(run.spent || 0).toFixed(2)} of $${Number(run.budgetCap || 0).toFixed(2)} · report v${run.versions || 0}`);
  L.push(`- run: ${run.id}`);
  const decisions: any[] = run.decisions || [];
  const qa = decisions.filter((d: any) => d.kind === "question");
  if (qa.length) {
    L.push(`\n## Questions & answers`);
    for (const d of qa) {
      L.push(`\n### [${d.step === "midrun" ? "mid-run" : "intake"}] ${d.prompt || d.question?.prompt || ""}`);
      if(d.question?.externalRequest){const request=d.question.externalRequest;L.push(`${request.tool}: ${request.url??request.query??""}`);}
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
  const usageNotes=events.filter((e:any)=>e.origin==='usage'&&typeof e.costUsd==='number');
  if(usageNotes.length){L.push('\n## Model response expenses');for(const e of usageNotes)L.push(`- ${e.phase}: ${e.model}${money(e.costUsd)}${e.billingKind==='platform'?' · sponsored — $0 charged to you':''}`);}
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
  // Settlement is part of the audit: what landed, what was spent, what came
  // back, and the onchain proof. A transcript without the money is half one.
  {
    const deposited = Number(run.deposited ?? 0);
    const spent = Number(run.spend ?? run.spent ?? 0);
    const fee = Number(run.fee ?? 0);
    const refunded = Number(run.refunded ?? 0);
    const esc = (run.metadata && run.metadata.escrow) || null;
    if (deposited > 0 || refunded > 0 || esc?.jobId) {
      L.push(`\n## Settlement`);
      L.push(`- deposited $${deposited.toFixed(2)} · spent $${spent.toFixed(6)}${fee > 0 ? ` ($${fee.toFixed(6)} platform share included)` : ""} · refunded $${refunded.toFixed(6)}`);
      if (esc?.jobId) L.push(`- escrow job ${esc.jobId} · ${esc.status || "unknown"}${esc.completeTx ? ` · settle tx ${esc.completeTx}` : ""}`);
    }
  }
  return L.join("\n");
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
        <ul className="mt-1 space-y-1">{out.followUps.map((l: string, n: number) => (<li key={n} className="font-mono text-[11px] opacity-60">→ next: {l}</li>))}</ul>
      ) : null}
    </div>
  );
}

// Relative clock for feed rows: absolute on hover. Owners audit WHEN things
// happened (did intake stall? how long did search take?) — a feed without
// times is a story without a clock.
function ago(ts: any): string {
  const t = new Date(ts || 0).getTime();
  if (!Number.isFinite(t) || t <= 0) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(t).toLocaleDateString();
}

function FeedTime({ at }: { at: any }) {
  const label = ago(at);
  if (!label) return null;
  return <span title={new Date(at).toLocaleString()} className="opacity-50"> · {label}</span>;
}

// Settlement receipt: what the run cost and where the remainder went. The
// header shows spend-vs-cap; this shows the money truth after the fact —
// deposit, spend + fee, refund, and the onchain completion proof. A run that
// took money must end with a receipt, not silence.
function SettlementReceipt({ run, onRefresh }: { run: any; onRefresh: () => Promise<void> }) {
  const [retrying, setRetrying] = useState(false);
  const [retryMessage, setRetryMessage] = useState("");
  const esc = (run.metadata && run.metadata.escrow) || null;
  const deposited = Number(run.deposited ?? 0);
  const spent = Number(run.spend ?? run.spent ?? 0);
  const fee = Number(run.fee ?? 0);
  const refunded = Number(run.refunded ?? 0);
  const tx = esc?.completeTx as string | undefined;
  const fundsTx = esc?.splitTx as string | undefined;
  const refreshReceipt=useRef(onRefresh);
  refreshReceipt.current=onRefresh;
  const receiptPending=privateBuildEnabled()&&privateFundingEnabled()&&(!run.settledAt||!esc?.splitConfirmed||run.metadata?.privateFundingUnavailable===true);
  useEffect(()=>{
    if(!receiptPending)return;
    let cancelled=false,attempts=0,timer:ReturnType<typeof setTimeout>;
    const check=async()=>{
      if(cancelled)return;
      try{await refreshReceipt.current();}catch{/* Keep the saved report and manual retry available. */}
      if(!cancelled&&++attempts<12)timer=setTimeout(check,10000);
    };
    timer=setTimeout(check,5000);
    return()=>{cancelled=true;clearTimeout(timer);};
  },[run.id,receiptPending]);
  if(privateBuildEnabled()&&!privateFundingEnabled()){
    const usage=run.aiUsage;
    const valid=usage?.format==='drnib-private-usage-summary-v2'&&['verifiedMicroUsd','reportedMicroUsd','estimatedMicroUsd','reservedMicroUsd'].every(k=>Number.isSafeInteger(usage[k])&&usage[k]>=0);
    return <section className="mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5"><p className="text-sm font-medium">Owner test usage</p><p className="mt-2 text-[13px] leading-6">{valid?<>Receipt-priced AI usage ${(usage.verifiedMicroUsd/1000000).toFixed(4)}; provider-reported JEV ${(usage.reportedMicroUsd/1000000).toFixed(4)}.{usage.estimatedMicroUsd>0?<> Historical ceiling estimates ${(usage.estimatedMicroUsd/1000000).toFixed(4)}.</>:null}{usage.reservedMicroUsd>0?<> Uncertain holds ${(usage.reservedMicroUsd/1000000).toFixed(4)}; these are not a confirmed bill.</>:null}</>:<>Recorded allowance total ${spent.toFixed(4)} may include historical estimates and uncertain holds; it is not a customer invoice.</>} The shared owner test allowance applies; no wallet deposit or refund is involved.</p></section>;
  }
  if(privateBuildEnabled()&&privateFundingEnabled()&&run.metadata?.privateFundingUnavailable){
    return <section className="mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5"><p className="text-sm font-medium">Receipt temporarily unavailable</p><p role="status" className="mt-2 text-[13px] leading-6">We could not check the payment service. Deposit, charges and refund status are unavailable; your saved report is still accessible.</p><button onClick={()=>void onRefresh()} className="mt-3 rounded-lg border border-current px-3 py-2 text-xs">Check receipt again</button></section>;
  }
  return (
    <section className="mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5">
      <p className="text-sm font-medium">Receipt</p>
      {!run.settledAt && !esc?.splitConfirmed && <p role="status" className="mt-2 text-xs">Settlement is pending. Completed usage is recorded before the remaining balance is refunded.</p>}
      {esc?.waivedCalls>0&&<p className="mt-2 text-xs">{esc.waivedCalls} unconfirmed operation(s) were excluded from your charge when the run ended. Any provider cost for those calls is covered by the platform.</p>}
      <p className="mt-2 text-[13px] leading-6">
        Deposited ${deposited.toFixed(2)}
        {" · "}spent ${spent.toFixed(6)}{fee > 0 ? ` ($${fee.toFixed(6)} platform share included)` : ""}
        {" · "}{esc?.jobId && !fundsTx && !esc.splitConfirmed ? "refund pending confirmation" : "refunded"} ${refunded.toFixed(6)}
      </p>
      {privateBuildEnabled()&&<PrivateExpenseReceipt receipt={run.expenseReceipt}/>}
      {esc?.jobId && !fundsTx && !esc.splitConfirmed && (
        <div className="mt-3">
          <p className="text-xs opacity-70">Your refund is awaiting onchain confirmation. The payment service retries automatically; you can also check now.</p>
          <button disabled={retrying} onClick={async () => {
            setRetrying(true); setRetryMessage("");
            try {
              const result = await drNibApi.completeEscrow(run.id);
                setRetryMessage(result.pending ? "Settlement is still pending. The payment service will retry automatically." : "Settlement confirmed.");
              await onRefresh();
            } catch { setRetryMessage("Settlement could not complete yet. Your funds remain in escrow; please try again later."); }
            finally { setRetrying(false); }
          }} className="mt-2 rounded-lg border border-current px-3 py-2 text-xs disabled:opacity-50">{retrying ? "Checking settlement…" : "Retry settlement"}</button>
          {retryMessage && <p role="status" className="mt-2 text-xs">{retryMessage}</p>}
        </div>
      )}
      {esc?.jobId ? (
        <p className="mt-1.5 text-xs leading-5 opacity-60">
          Escrow job {String(esc.jobId).slice(0, 12)}{esc.jobId?.length > 12 ? "…" : ""} · {esc.status || "settled"}
          {Number(run.budgetCap) > 0 && Number(esc.targetCap) > Number(run.budgetCap)
            ? ` · funded $${Number(run.budgetCap).toFixed(2)} of $${Number(esc.targetCap).toFixed(2)} cap` : ""}
          {tx ? <> · <a href={explorerTxUrl(tx)} target="_blank" rel="noreferrer" className="underline">settle tx ↗</a></> : null}
          {fundsTx ? <> · <a href={explorerTxUrl(fundsTx)} target="_blank" rel="noreferrer" className="underline">funds tx ↗</a></> : null}
        </p>
      ) : (
        <p className="mt-1.5 text-xs leading-5 opacity-60">Ledger run — no onchain escrow.</p>
      )}
    </section>
  );
}

export default function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <ServerRunDetailPage id={id} />;
}

function ServerRunDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const privateMode=privateBuildEnabled();
  const [privateActionsReady,setPrivateActionsReady]=useState(!privateMode);
  useEffect(()=>{
    if(!privateMode)return;
    let active=true;
    const check=()=>drNibApi.health().then((health:any)=>{if(active)setPrivateActionsReady(health.research?.acceptingRuns===true)}).catch(()=>{if(active)setPrivateActionsReady(false)});
    void check();const timer=setInterval(check,15000);
    return()=>{active=false;clearInterval(timer)};
  },[privateMode,id]);
  const privateProcessingPaused=privateMode&&!privateActionsReady;
  const [run, setRun] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState("");
  const [streamLive, setStreamLive] = useState(true);
  // Whether any successful load has landed. A ref, not state: the SSE
  // subscription captures the first render's load(), whose state snapshot
  // is permanently stale — only a ref tells the truth in there.
  const loadedOnce = useRef(false);
  // Background refetch failed while good content is on screen (SSE fires
  // load() on every event — one blip must not wipe the page). Banner, not
  // a wipe; clears on the next successful read.
  const [staleWarn, setStaleWarn] = useState(false);
  const [exportError, setExportError] = useState("");
  const [exportBusy,setExportBusy]=useState<string|null>(null);
  const [actionError,setActionError]=useState("");
  const [actionBusy,setActionBusy]=useState(false);
  const [recoveryDiagnostics,setRecoveryDiagnostics]=useState<string[]>([]);
  const [recoveryInspectBusy,setRecoveryInspectBusy]=useState(false);
  const [pauseRequested,setPauseRequested]=useState(false);
  useEffect(()=>{if(run?.status==='paused'||['complete','ended','failed'].includes(run?.status))setPauseRequested(false)},[run?.status]);
  async function changeRun(action:()=>Promise<unknown>){
    if(actionBusy)return;setActionBusy(true);setActionError("");
    try{await action();await load()}catch(e:any){setActionError(e?.message || "The action could not complete. Retry in a moment.")}finally{setActionBusy(false)}
  }
  const [awaitingText, setAwaitingText] = useState("");
  const [awaitingBusy, setAwaitingBusy] = useState(false);
  const [awaitingError, setAwaitingError] = useState("");
  const [reportVersion, setReportVersion] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [shareFallback, setShareFallback] = useState("");
  // Version-pinned permalink: the URL names the exact report version, so a
  // shared link always shows what the sender saw even after a reprompt.
  function shareReport() {
    if (!report) return;
    const url = `${window.location.origin}/dr-nib/research/${id}/report?version=${report.version}`;
    (async () => {
      try {
        await navigator.clipboard.writeText(url);
        setShareFallback("");
        setLinkCopied(true);
        setTimeout(() => setLinkCopied(false), 2000);
      } catch {
        // Clipboard blocked: show the URL selectable instead of pretending.
        setShareFallback(url);
      }
    })();
  }
  async function copyReport() {
    if (!report?.markdown) return;
    try {
      await navigator.clipboard.writeText(report.markdown);
    } catch {
      // Clipboard blocked (permissions, old browser): download instead of
      // pretending the copy worked.
      const blob = new Blob([report.markdown], { type: "text/markdown" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report-v${report.version}.md`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return;
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  const [endArmed, setEndArmed] = useState(false);
  const [endBusy, setEndBusy] = useState(false);
  const [dupBusy, setDupBusy] = useState(false);
  // Duplicate: fresh intake on the same topic. One click, straight into the
  // new run — the escape hatch when this run's escrow is exhausted.
  async function duplicateRun() {
    const topic = String(run?.brief?.topic || run?.title || "").trim();
    if (!topic || dupBusy) return;
    setDupBusy(true);
    try {
      const created: any = await drNibApi.createProject(topic);
      router.push(`/dr-nib/research?project=${created.id}`);
    } catch (e:any) {
      setDupBusy(false);
      setActionError(e?.message || "A fresh run could not be created. Retry in a moment.");
    }
  }
  const [raiseAmt, setRaiseAmt] = useState("");
  const [raiseBusy, setRaiseBusy] = useState(false);
  const [raiseError, setRaiseError] = useState("");
  // Escrow + approve live here too, not just on the Research page: a planned
  // run whose owner navigates straight to its URL must be able to fund and
  // approve without finding the review screen again (seen live — stranded
  // with no path back to approve).
  const [escrowConfigured, setEscrowConfigured] = useState<boolean | null>(null);
  const [escrowFunded, setEscrowFunded] = useState(false);
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveError, setApproveError] = useState("");
  // Same rule as the new-run review screen: a failed status read keeps the
  // last known support state and marks it stale — it never unmounts the
  // funding UI mid-signing.
  const [escrowStale, setEscrowStale] = useState(false);
  const configuredRef = useRef<boolean | null>(null);
  async function loadEscrow(forRun?: any) {
    try {
      // Read-only: the job opens from the user's own Fund click (their
      // wallet must be the onchain client), never implicitly from a read.
      const st: any = await drNibApi.getEscrow(id);
      const v = st?.configured === true;
      configuredRef.current = v;
      setEscrowConfigured(v);
      const src = forRun || run;
      const need = Number(src?.plan?.estimate ?? src?.budgetCap ?? 0);
      setEscrowFunded(st?.job?.chain?.status === "Funded" && Number(st?.job?.chain?.budget ?? 0) >= need);
      setEscrowStale(false);
    } catch {
      if (configuredRef.current === true) setEscrowStale(true);
      else setEscrowConfigured(null);
    }
  }
  async function approveHere() {
    if (!run || approveBusy) return;
    setApproveBusy(true);
    setApproveError("");
    try {
      await drNibApi.approveRun(id);
      await load();
    } catch (e: any) {
      setApproveError(e?.message || "Approve failed.");
    } finally {
      setApproveBusy(false);
    }
  }

  async function load(privateSnapshot?:any) {
    try {
      const r = privateBuildEnabled()&&privateSnapshot?.id===id?await (await import('@/lib/dr-nib-private-client')).privateSnapshotRun(privateSnapshot):await drNibApi.getRun(id);
      setRun(r);
      loadedOnce.current = true;
      // A successful read clears both the first-load error and any
      // background stale banner — the page is fresh again.
      setError("");
      setStaleWarn(false);
      if (r?.status === "planned") void loadEscrow(r);
      if(privateBuildEnabled()){
        const reports=Array.isArray(r.reports)?r.reports:[];
        setReport((reportVersion?reports.find((item:any)=>item.version===reportVersion):reports.at(-1))??null);
      }else try { setReport(await drNibApi.getReport(id, reportVersion ?? undefined)); }
      catch (e: any) {
        // A planned or unfinished run has no report yet. Its expected 404 is
        // not a lost connection and must not raise the stale-state banner.
        if (e?.status === 404) setReport(null);
        else setStaleWarn(true);
      }
    } catch (e: any) {
      // A background refetch (every SSE event calls load) must never wipe a
      // loaded page: a network blip showed "Could not load run" over good
      // content with no recovery (seen live). Only the very first load —
      // when there is nothing to show — is a hard error. A ref (not state:
      // the SSE subscription holds the first render's load) tracks that.
      if (!loadedOnce.current) setError(e.message);
      else setStaleWarn(true);
    }
  }

  async function endRun() {
    if (!endArmed) { setEndArmed(true); return; }
    setEndBusy(true);
    try {
      await drNibApi.endRun(id);
      setEndArmed(false);
      await load();
    } catch (e: any) { setActionError(e?.message || "End failed."); }
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
    if(exportBusy)return;
    setExportBusy(format);
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
    } finally {
      setExportBusy(null);
    }
  }

  // Autogrown chat boxes keep their height after a programmatic clear
  // (no input event fires) — collapse them back to one row on send.
  function collapseComposer(id: string) {
    try { (document.getElementById(id) as HTMLTextAreaElement | null)?.style.setProperty("height", "auto"); } catch { /* noop */ }
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
      collapseComposer("drnib-awaiting-box");
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
      collapseComposer("drnib-guidance-box");
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
      collapseComposer("drnib-reprompt-box");
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
  // Jump-to-latest needs a render; the tail ref alone doesn't re-render.
  const [atTail, setAtTail] = useState(true);
  function onFeedScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const tail = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    tailRef.current = tail;
    setAtTail(tail);
  }
  function jumpToLatest() {
    const el = feedRef.current;
    if (el) { el.scrollTop = el.scrollHeight; tailRef.current = true; setAtTail(true); }
  }
  // New arrivals slide in by message identity. Replayed checkpoints and late
  // historical events must not remount the messages already on screen.
  const feedItems = buildFeed(run);
  const seenFeedKeys = useRef(new Set<string>());
  useEffect(() => {
    for(const item of feedItems)seenFeedKeys.current.add(drNibFeedKey(item));
  }, [feedItems]);
  const privateActivity=privateMode&&!privateProcessingPaused?privateResearchActivity(run):null;
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
        setStreamLive(true);
        if (e?.type === "token" && typeof e?.delta === "string") {
          const section = Number(e.section) || 0;
          const of = Number(e.of) || 0;
          setWritingNow((prev) => ({
            section, of,
            text: (prev && prev.section === section ? prev.text : "") + e.delta,
          }));
          return;
        }
        void load(e?.type==='private.snapshot'?e.privateSnapshot:undefined);
      },
      () => {
        setStreamLive(false);
        if (!privateBuildEnabled()&&!poll) poll = setInterval(load, 5000);
      },
    );
    return () => { unsub(); if (poll) clearInterval(poll); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const settlementPending=privateBuildEnabled()&&privateFundingEnabled()&&['complete','ended','failed'].includes(run?.status)&&!!run?.metadata?.escrow?.jobId&&!run?.settledAt&&!run?.metadata?.escrow?.splitConfirmed;
  useEffect(()=>{
    if(!settlementPending)return;
    let stopped=false,timer:ReturnType<typeof setTimeout>;
    const check=async()=>{await load();if(!stopped)timer=setTimeout(check,15000);};
    timer=setTimeout(check,5000);
    return()=>{stopped=true;clearTimeout(timer);};
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[id,settlementPending]);

  if (error) return (
    <div className="mx-auto max-w-2xl py-10 text-center">
      <p className="text-sm font-medium">Couldn&apos;t load this run</p>
      <p className="mx-auto mt-2 max-w-md text-sm opacity-60">{error}</p>
      <div className="mt-4 flex justify-center gap-2">
        <button onClick={() => { setError(""); void load(); }} className="bg-black px-6 py-2 text-sm font-medium text-white">Retry</button>
        <Link href="/dr-nib/projects" className="border border-dark-gray/60 px-4 py-2 text-sm font-medium hover:bg-black hover:text-white">Projects</Link>
      </div>
    </div>
  );
  // Skeleton mirrors the command-center layout so first paint isn't a bare
  // top-left line (seen live: "Loading run…" unstyled while compiling).
  if (!run) return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,340px)_minmax(0,1fr)]" aria-hidden="true">
      <div className="border border-dark-gray/50 bg-white px-4 py-4">
        <div className="h-6 w-3/4 animate-pulse rounded bg-black/10" />
        <div className="mt-2 h-3 w-1/2 animate-pulse rounded bg-black/10" />
        <div className="mt-3 h-3 w-full animate-pulse rounded bg-black/10" />
        <div className="mt-2 h-3 w-5/6 animate-pulse rounded bg-black/10" />
      </div>
      <div className="border border-dark-gray/50 bg-white p-4">
        <div className="h-3 w-1/3 animate-pulse rounded bg-black/10" />
        <div className="mt-3 space-y-2">
          <div className="h-3 w-full animate-pulse rounded bg-black/10" />
          <div className="h-3 w-11/12 animate-pulse rounded bg-black/10" />
          <div className="h-3 w-4/6 animate-pulse rounded bg-black/10" />
        </div>
        <p className="mt-4 text-xs opacity-60">Loading run…</p>
      </div>
    </div>
  );

  const topic = run.brief?.topic || "Untitled run";
  const spent = Number(run.used ?? run.spend ?? run.spent ?? 0);
  const cap = Number(run.budgetCap || 0);
  const pct = cap > 0 ? Math.min(100, Math.round((spent / cap) * 100)) : 0;
  // Honest empties: a finished search with zero sources is a finding ("asked,
  // found nothing"), not a loading state — say so instead of promising live
  // content that is never coming.
  const searchDone = (run.steps || []).some((s: any) => s.kind === "search" && s.status === "done");
  const nothingFound = searchDone && (run.sources || []).length === 0 &&
    (run.steps || []).filter((s: any) => s.kind === "search" && s.status === "done").every((s: any) => Array.isArray(s.output?.results) && s.output.results.length === 0);

  const statusStyle: Record<string, string> = {
    running: "bg-black text-white",
    awaiting: drNibHasPendingQuestion(run) ? "bg-amber-100 text-amber-950 border border-amber-400" : "bg-black/10 text-black",
    paused: "bg-black/10 text-black",
    complete: "bg-emerald-100 text-emerald-900 border border-emerald-300",
    failed: "bg-red-100 text-red-800 border border-red-300",
  };
  const pill = statusStyle[run.status] || "bg-black/10 text-black";

  const banner: Record<string, string> = {
    planning: "Planning the run — breaking the brief into answerable questions.",
    planned: "Plan is ready — fund and approve in the review box above to start spending.",
    running: (run.steps || []).length === 0
      ? "Approved — starting the first pass now."
      : "Running — steps, sources, and the report appear below as they land.",
    awaiting: drNibHasPendingQuestion(run)?"Waiting for your answer — the question is below the activity feed.":"Checking the saved continuation. No answer is needed until a current question is shown.",
    paused: run.pauseReason === "uncertain" ? "Saved work needs a recovery check. Your deposit remains in escrow." : run.pauseReason === "cap"
      ? "Parked at the budget cap — raise it to continue."
      : "Paused by you — resume when ready.",
    complete: "Research complete — review the report and its evidence checks below.",
    failed: "This run failed — check the receipt below for the refund status.",
    ended: "Ended — check the receipt below for the refund status.",
  };

  return (
    <div>
      {run.metadata?.privateActionError&&<p role="alert" className="mb-4 border border-dark-gray/50 p-3 text-sm">{run.metadata.privateActionError}</p>}
      {staleWarn && (
        <div className="mb-4 flex items-start justify-between gap-3 border border-dark-gray/50 bg-white px-4 py-2 text-sm">
          <span>Connection hiccup — showing the last loaded state. It refreshes on its own.</span>
          <span className="flex shrink-0 gap-2">
            <button onClick={() => void load()} className="underline">Retry now</button>
            <button onClick={() => setStaleWarn(false)} aria-label="Dismiss" className="opacity-60 hover:opacity-100">✕</button>
          </span>
        </div>
      )}
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
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium uppercase ${pill}`}>{privateProcessingPaused&&['running','planning'].includes(run.status)?'worker paused':run.metadata?.privateActionPending&&run.metadata?.privateRecoveryRequestId?'checking saved work':drNibHasPendingQuestion(run)?'action needed':run.status==='awaiting'?'checking saved work':run.status}</span>
          </span>
        </div>
        <div className="px-4 py-4 md:px-5">
          <h1 className="text-base font-medium leading-relaxed md:text-lg">{topic}</h1>
          <p className="mt-1.5 text-xs opacity-60">
            {run.brief?.depth || "standard"} depth · ${(run.plan?.estimate ?? 0).toFixed(2)} est · {run.metadata?.privateFundingUnavailable?'expenses unavailable':`$${spent.toFixed(6)} of $${cap.toFixed(2)} spent`} · {(run.sources || []).length} sources
          </p>
          <RunWorkDuration run={run} workerPaused={privateProcessingPaused}/>
          {privateMode&&process.env.NEXT_PUBLIC_DRNIB_HOSTED_RESEARCH_FALLBACK==='true'?<p role="note" className="mt-2 text-xs leading-5">Phala is primary. OpenRouter/Azure may receive research context under zero retention when fallback is needed; that inference is provider-visible. Decryption and saved state stay in the private worker. JEV is unchanged.</p>:null}
          {drNibHasPendingQuestion(run) && !privateProcessingPaused ? <div role="status" className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-amber-950"><p className="flex items-center gap-2 text-sm font-medium"><Pause size={16} aria-hidden="true" /> Waiting for your {run.pendingQuestion.externalRequest ? "approval" : "answer"}</p><a href="#drnib-pending-action" className="rounded-lg px-2 py-1 text-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800">Review {run.pendingQuestion.externalRequest ? "request" : "question"} ↓</a></div> : banner[run.status] && <p className="mt-2.5 border-l-2 border-black/60 pl-3 text-sm leading-6">{privateProcessingPaused&&!['complete','failed','ended'].includes(run.status)?"Private processing is paused. Saved work remains available; resume only after the reviewed worker is running. Check the receipt for the current escrow balance.":run.metadata?.privateActionPending&&run.metadata?.privateRecoveryRequestId?"Checking the saved journal before continuing research.":banner[run.status]}</p>}
          {(["running","planning","paused"]).includes(run.status) && (
            <div className="mt-3 flex gap-2">
              {(run.status === "running" || run.status === "planning") && (
                <button disabled={actionBusy||pauseRequested||privateProcessingPaused} onClick={() => void changeRun(async()=>{const result=await drNibApi.pauseRun(id);if(result.queued)setPauseRequested(true);return result;})} className="inline-flex items-center gap-2 border border-black bg-black px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"><Pause size={14} aria-hidden="true" /> {pauseRequested?(privateProcessingPaused?'Pause queued for recovery':'Pausing after the current operation…'):'Pause'}</button>
              )}
              {run.status === "paused" && !run.metadata?.privateRecoveryRequestId && !run.metadata?.privateUncertainRequestId && (
                <button disabled={actionBusy||privateProcessingPaused} onClick={() => void changeRun(()=>drNibApi.resumeRun(id))} className="inline-flex items-center gap-2 border border-black bg-black px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"><Play size={14} aria-hidden="true" /> Resume</button>
              )}
            </div>
          )}
          {actionError && <p role="alert" className="mt-2 text-xs text-red-700">{actionError}</p>}
          {privateMode&&(run.metadata?.privateRecoveryRequestId||run.metadata?.privateUncertainRequestId)&&<div className="mt-3 rounded-lg border border-amber-300 p-3">
            <p role="status" className="text-xs leading-5">{run.metadata?.privateActionPending?"Checking saved work with the private worker. Your deposit stays in escrow.":run.metadata?.privateRecoveryRequestId?"Saved work is paused. Check the encrypted journal to resume safely. Unresolved operations stay blocked to prevent duplicate charges.":"Saved work is paused while the previous worker releases this action. We check automatically; you can also refresh its recovery status. Your deposit stays in escrow."}</p>
            <button disabled={actionBusy||!!run.metadata?.privateActionPending||(!!run.metadata?.privateRecoveryRequestId&&privateProcessingPaused)} onClick={()=>void changeRun(()=>run.metadata?.privateRecoveryRequestId?drNibApi.resumeRun(id):load())} className="mt-2 rounded-lg border border-current px-3 py-2 text-xs disabled:opacity-50">{actionBusy||run.metadata?.privateActionPending?"Checking saved work…":run.metadata?.privateRecoveryRequestId?"Check saved work & resume":"Check recovery status"}</button>
            <button disabled={recoveryInspectBusy} onClick={()=>{setRecoveryInspectBusy(true);void import('@/lib/dr-nib-private-records').then(m=>m.privateRecoveryDiagnostics(id)).then(setRecoveryDiagnostics).catch(()=>setActionError('Saved-operation details are unavailable. Retry without replacing project keys.')).finally(()=>setRecoveryInspectBusy(false));}} className="ml-2 mt-2 rounded-lg border border-current px-3 py-2 text-xs disabled:opacity-50">{recoveryInspectBusy?'Reading saved operations…':'Inspect saved operations'}</button>
            {recoveryDiagnostics.length>0&&<details open className="mt-3 text-xs"><summary>Saved operation diagnostics</summary><div className="mt-2 max-h-80 overflow-auto">{recoveryDiagnostics.map((item,index)=><pre key={index} className="mb-3 whitespace-pre-wrap break-words">{item}</pre>)}</div></details>}
          </div>}
          {(["intake", "intake-done", "planning", "planned", "running", "paused", "awaiting"] as string[]).includes(run.status) && (
            <div className="mt-3">
              <button onClick={endRun} disabled={endBusy} className="inline-flex items-center gap-2 border border-dark-gray/60 px-4 py-1.5 text-sm font-medium hover:bg-black hover:text-white disabled:opacity-50">{endBusy ? "Ending…" : endArmed ? "Click again to end + refund" : "End run"}</button>
            </div>
          )}
          {(["complete", "ended", "failed"] as string[]).includes(run.status) && (
            <div className="mt-3">
              <button onClick={duplicateRun} disabled={dupBusy || privateProcessingPaused} title="Start a fresh run on the same topic" className="inline-flex items-center gap-2 border border-dark-gray/60 px-4 py-1.5 text-sm font-medium hover:bg-black hover:text-white disabled:opacity-50">{dupBusy ? "Duplicating…" : "Duplicate run"}</button>
            </div>
          )}
        </div>
      </header>

          {run.status === "planned" && (
            <section className="mt-4 rounded-2xl border-2 border-black bg-white p-5">
              <p className="text-sm font-medium">Review the plan — approve here, no need to go back</p>
              <p className="mt-1 text-xs opacity-60">
                {Array.isArray(run.plan?.sub_questions) ? `${run.plan.sub_questions.length} steps · ` : ""}
                Estimated cost <strong>${Number(run.plan?.estimate ?? 0.2).toFixed(2)}</strong>
                {Number(run.budgetCap) > 0 ? ` · cap $${Number(run.budgetCap).toFixed(2)}` : ""}
              </p>
              {Array.isArray(run.plan?.sub_questions) && run.plan.sub_questions.length > 0 && (
                <ol className="mt-2 space-y-1">
                  {(run.plan.sub_questions as string[]).slice(0, 6).map((sq: string, i: number) => (
                    <li key={i} className="text-[13px] leading-5"><span className="opacity-50">{i + 1}.</span> {sq}</li>
                  ))}
                </ol>
              )}
              {escrowConfigured === true && !escrowFunded && (
                <>
                  <EscrowDeposit runId={id} budgetCap={Number(run.budgetCap || 0)} estimate={privateFundingEnabled()?Math.max(Number(run.plan?.estimate??0),Number(run.plan?.minimumFunding??0)):Number(run.plan?.estimate??0.2)} onFunded={() => loadEscrow()} />
                  {escrowStale && (
                    <p className="mt-2 text-xs text-red-700">
                      Escrow status isn&apos;t refreshing — anything you&apos;ve signed so far still stands.{" "}
                      <button onClick={() => loadEscrow()} className="underline">Retry</button>
                    </p>
                  )}
                </>
              )}
              {escrowConfigured === true && escrowFunded && (
                <p className="mt-3 text-sm">✓ Escrow funded — approving starts the run against your deposit.</p>
              )}
              {approveError ? <p className="mt-2 text-xs text-red-700">{approveError}</p> : null}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={approveHere}
                  disabled={approveBusy || (escrowConfigured === true && !escrowFunded)}
                  title={escrowConfigured === true && !escrowFunded ? "Fund the escrow first" : undefined}
                  className="inline-flex items-center gap-2 bg-black px-6 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {approveBusy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
                  {approveBusy ? "Starting…" : "Approve & run"}
                </button>
              </div>
            </section>
          )}

          {["complete", "ended", "failed"].includes(run.status) && (
            <SettlementReceipt run={run} onRefresh={load} />
          )}

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
                    <div className={`h-3 w-3/4 rounded bg-black/10 ${run.status==='running'&&!privateProcessingPaused?'animate-pulse':''}`} />
                    <div className="h-3 w-full animate-pulse rounded bg-black/10" />
                    <div className={`h-3 w-5/6 rounded bg-black/10 ${run.status==='running'&&!privateProcessingPaused?'animate-pulse':''}`} />
                  </div>
                  <p className="mt-3 text-xs opacity-60">{privateProcessingPaused||run.status==='paused'?"Research is paused. Saved sections will appear here when work resumes.":"Research is still moving — sections land here as steps complete."}</p>
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
                  <button onClick={copyReport} className="text-xs font-normal underline opacity-60 hover:opacity-100">{copied ? "✓ Copied" : "Copy"}</button>
                  <button onClick={shareReport} className="text-xs font-normal underline opacity-60 hover:opacity-100" title="Copy this private report link; opening it requires your signed-in account">{linkCopied ? "✓ Link copied" : "Copy report link"}</button>
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
                    <button key={f} disabled={privateProcessingPaused||exportBusy!==null} onClick={() => downloadExport(f)} className="border border-dark-gray/60 px-2.5 py-1 text-[11px] font-medium uppercase disabled:opacity-50">{exportBusy===f?`Preparing ${f}…`:f}</button>
                  ))}
                </div>
              </div>
              {privateProcessingPaused?<p role="status" className="mb-2 text-xs opacity-70">Private processing is paused. Your saved report and discussion remain available; new exports and model actions resume when the reviewed worker is running.</p>:null}
              {exportError ? <p className="mb-2 text-xs text-red-700">{exportError}</p> : null}
              {shareFallback ? <p className="mb-2 break-all text-xs opacity-70">Copy this link: {shareFallback}</p> : null}
              {(() => {
                const steer = (run.metadata?.versionPrompts || {})[report.version];
                return steer ? <p className="mb-2 text-xs opacity-60">v{report.version} steered by: “{String(steer).slice(0, 160)}”</p> : null;
              })()}
              <ReportArticle markdown={report.markdown} sources={report.citations?.length ? report.citations : run.sources || []} />
              <ReportEvidence claims={run.claims} sources={run.sources || []} />
              <ReportQA claims={run.claims} sources={run.sources || []} />
              {["complete", "failed", "ended"].includes(run.status) ? (
                <DiscussThread runId={id} disabled={privateProcessingPaused} initial={run.metadata?.discuss} sources={report.citations?.length ? report.citations : run.sources || []} />
              ) : null}
            </section>
          )}

          <SourceManager
            runId={id}
            onChanged={() => {
              if (run.status === "planned") router.push(`/dr-nib/research?project=${id}`);
              else void load();
            }}
          />
          <section id="drnib-sources" className="mt-4 scroll-mt-4 border border-dark-gray/50 bg-white p-4">
            <p className="mb-3 text-sm font-medium">Sources ({(run.sources || []).length})</p>
            {(run.sources || []).length === 0 ? (
              <p className="text-xs opacity-60">{nothingFound ? "Search finished with no candidates — nothing to score." : searchDone ? "Search candidates found — sources appear here as the agent reads and scores them." : "Sources appear here as the run finds and scores them."}</p>
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
                      {privateBuildEnabled()&&run.brief?.tipCreators===true&&s.provider==='public-web'?<PrivateSourceTip url={s.url} runId={run.id}/>:null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="mt-4 border border-dark-gray/50 bg-white p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-medium">Run budget</p>
              <p className="text-xs opacity-60">{run.metadata?.privateFundingUnavailable?'Expenses unavailable':`$${spent.toFixed(6)} of $${cap.toFixed(2)}`}</p>
            </div>
            {!run.metadata?.privateFundingUnavailable?<div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--nib-teal)" }} /></div>:null}
            {privateMode&&!["complete","ended","failed"].includes(run.status)&&<PrivateExpenseReceipt receipt={run.expenseReceipt}/>}
            {(["intake", "intake-done", "planning", "planned", "running", "paused", "awaiting"] as string[]).includes(run.status) && (
              escrowConfigured === true && !escrowFunded ? (
                <div className="mt-3 border border-dark-gray/40 bg-white p-3">
                  <p className="text-sm leading-6"><span className="font-medium">No deposit yet</span> — nothing to raise. Fund the escrow first{run.status === "planned" ? " in the review box above" : ""}, then approve.</p>
                </div>
              ) : (
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
              )
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
                  {privateMode?(run?.status==='planned'?"Waiting for funding and approval":streamLive?"Updates connected":"Checking saved progress"):streamLive?"Live":"Polling"}
                </span>
              </span>
            </div>
            {run.metadata?.privateQuestionHistoryUnavailable&&<p role="status" className="border-b border-dark-gray/30 px-4 py-2 text-xs">Some saved answers could not be loaded. Refresh to retry; your research is unchanged.</p>}
            <div ref={feedRef} onScroll={onFeedScroll}
              className="relative min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {(() => {
                const items = feedItems;
                if (!items.length) return <p className="text-sm opacity-60">{drNibHasPendingQuestion(run) ? "Answer the question below to continue." : "No activity to display yet."}</p>;
                return items.map((item: any, i: number) => {
                  const last = i === items.length - 1;
                  // Fresh arrivals slide in; everything already seen renders static.
                  const itemKey=drNibFeedKey(item);
                  const enter = !seenFeedKeys.current.has(itemKey) ? " drnib-feed-enter" : "";
                    if (item.t === "thinking") {
                    return (
                      <div key={itemKey} className={`border-l-2 border-black/40 pl-3${enter}`}>
                        <p className="text-[10px] font-medium uppercase tracking-wider opacity-50">Dr. Nib&apos;s read<FeedTime at={item.at} /></p>
                        <p className="mt-0.5 text-[13px] italic leading-6 opacity-80">{item.text}</p>
                      </div>
                    );
                  }
                  if (item.t === "progress-note") {
                    const phase = String(item.e.phase || "research").replace(/^stage-/, "").replaceAll("-", " ");
                    return (
                      <div key={itemKey} className={`${item.e.origin==='model-summary'?'rounded-xl border border-current/20 bg-white p-3':'border-l-2 border-black/40 pl-3'}${enter}`}>
                        <p className="text-[10px] font-medium uppercase tracking-wider opacity-50">
                          {item.e.origin==='usage'?'Model response':item.e.origin==='model-summary'?'Dr. Nib':item.e.origin==='judge'?'JEV decision':item.e.origin==='tool'?'Tool observation':item.e.origin==='verification'?'Evidence check':'Research note'} · {phase}{item.e.type === "thinking.fallback" ? " · fallback" : ""}<FeedTime at={item.at} />
                        </p>
                        <p className={`mt-0.5 text-[13px] leading-6 ${item.e.origin==='model-summary'?'opacity-95':'italic opacity-80'}`}>{item.e.text}</p>
                        {typeof item.e.costUsd==='number'&&Number.isFinite(item.e.costUsd)?<p className="mt-1 font-mono text-[11px] opacity-60">{item.e.model?`${item.e.model} · `:''}Usage ${item.e.costUsd.toFixed(6)}{item.e.billingKind==='platform'?' · sponsored — $0 charged to you':item.e.billingKind==='owner-test'?' · owner test allowance':''}</p>:null}
                      </div>
                    );
                  }
                  if (item.t === "judge") {
                    return <JudgeRow key={itemKey} d={item.d} enter={enter} />;
                  }
                  if (item.t === "qa") {
                     const ans = formatAnswer(item.d);
                     const skipped = item.d.answer != null && !ans;
                     return (
                       <div key={itemKey} className={`rounded-xl border-2 border-black bg-white p-3${enter}`}>
                        <p className="text-[10px] font-medium uppercase tracking-wider opacity-50">
                          {item.d.step === "midrun" ? "Mid-run question" : "Intake question"}{item.d.answer == null ? " · unanswered" : skipped ? " · skipped" : " · answered"}<FeedTime at={item.d.historyNoTimestamp?undefined:item.at} />
                        </p>
                         <p className="mt-1 text-[13px] font-medium leading-6">{item.d.prompt || item.d.question?.prompt}</p>
                         {item.d.question?.externalRequest&&<p className="mt-1 break-all font-mono text-[11px] opacity-70">{item.d.question.externalRequest.tool} · {item.d.question.externalRequest.url??item.d.question.externalRequest.query}</p>}
                         {item.d.answer != null ? (
                           <p className="mt-1.5 border-l-2 border-black/60 pl-2.5 text-[13px] leading-6">{skipped ? <span className="opacity-50">Skipped — no answer recorded</span> : `You: ${ans}`}</p>
                         ) : null}
                       </div>
                     );
                   }
                  if (item.t === "tool") {
                    return (
                      <div key={itemKey} className={`rounded-xl border border-dark-gray/40 bg-white p-2.5${enter}`}>
                        <p className="flex flex-wrap items-baseline gap-x-2 font-mono text-[12px]">
                          <span className={drNibToolFailed(item.e) ? "text-red-700" : "opacity-70"}>{drNibToolFailed(item.e) ? "✗" : "→"} {item.e.tool}</span>
                          {item.e.detail ? <span className="break-all opacity-60">{item.e.detail}</span> : null}
                          {typeof item.e.costUsd==='number'&&Number.isFinite(item.e.costUsd) ? <span className="opacity-50">${Number(item.e.costUsd).toFixed(6)}</span> : null}
                        </p>
                        {drNibToolFailed(item.e) && item.e.error ? <p className="mt-1 font-mono text-[11px] text-red-700">{item.e.error}</p> : null}
                        <ToolResult e={item.e} />
                      </div>
                    );
                  }
                  if (item.t === "parked") {
                    return (
                      <div key={itemKey} className={`rounded-xl border-2 border-black bg-white p-2.5${enter}`}>
                        <p className="text-[12px] font-medium">△ {drNibQuestionMarker(run,item.e)}</p>
                        {typeof item.e.question?.prompt==='string'&&<p className="mt-1 text-xs opacity-70">{item.e.question.prompt}</p>}
                      </div>
                    );
                  }
                  if (item.t === "note") {
                    const text = item.e.guidance?.text || item.e.guidance || "";
                    return (
                      <div key={itemKey} className={`rounded-xl border border-dark-gray/40 bg-gray p-2.5${enter}`}>
                        <p className="text-[10px] font-medium uppercase tracking-wider opacity-50">You steered<FeedTime at={item.at} /></p>
                        {text ? <p className="mt-1 text-[13px] leading-6">“{String(text).slice(0, 500)}”</p> : null}
                      </div>
                    );
                  }
                  if(item.t === "agent-decision") {
                    return <div key={itemKey} className={`rounded-xl border border-dark-gray/40 bg-white p-3 text-xs${enter}`}><p className="font-medium">{item.e.tool} · {item.e.decision}</p><p className="mt-1 leading-5">{item.e.why || "No action proposed."}</p><p className="mt-1 opacity-60">Decision: {item.e.source}{item.e.confidence != null ? ` · confidence ${Math.round(item.e.confidence*100)}%` : ""} · ${Number(item.e.costUsd || 0).toFixed(4)}</p></div>;
                  }
                  if(item.t==='verification-summary')return <div key={itemKey} className={`rounded-xl border border-dark-gray/40 bg-white p-3 text-xs${enter}`}><p className="font-medium">Evidence check: {item.supported}/{item.total} sampled claims supported</p><p className="mt-1 leading-5">These checks compare sampled claims with their cited source passages. They do not verify every sentence or establish real-world causation.</p></div>;
                  if (item.t === "marker") {
                    return <p key={itemKey} className={`text-center text-[11px] uppercase tracking-wider opacity-50${enter}`}>— {item.e.type} —</p>;
                  }
                  return <div key={item.step.id} className={enter ? "drnib-feed-enter" : undefined}><StepDetail step={item.step} open={last && item.step.status !== "done"} /></div>;
                });
              })()}
              {privateActivity&&<div role="status" aria-live="polite" className="border border-dark-gray/40 bg-gray p-3 drnib-feed-enter" key={`active-${privateActivity.phase}`}>
                <p className="flex items-center gap-2 text-xs"><Loader2 size={14} className="animate-spin" aria-hidden="true"/><span className="drnib-stream-caret">{privateActivity.label}…</span></p>
                <div className="drnib-shimmer-track relative mt-3 h-1 overflow-hidden rounded bg-black/5" aria-hidden="true"/>
              </div>}
              {!atTail && feedItems.length > 0 && (
                <div className="sticky bottom-1 flex justify-center">
                  <button onClick={jumpToLatest} className="rounded-full border border-dark-gray/60 bg-white px-4 py-1.5 text-xs font-medium shadow hover:bg-black hover:text-white">
                    ↓ Latest activity
                  </button>
                </div>
              )}
            </div>
            <div className="border-t border-dark-gray/40 p-3">
              {["ended", "complete", "failed"].includes(run.status) && run.settledAt ? (
                <div className="rounded-xl border border-dark-gray/50 bg-white p-3">
                  <p className="text-sm font-medium">Continue with a fresh budget</p>
                  <p className="mt-1 text-xs opacity-70">This run’s escrow has been settled and any unused deposit refunded. Further research needs a fresh budget.{report?" You can still discuss and export this report.":" Your saved results remain available."}</p>
                  <button onClick={duplicateRun} disabled={dupBusy || privateProcessingPaused} className="mt-3 border border-black px-3 py-2 text-xs disabled:opacity-50">{dupBusy ? "Opening…" : "Start fresh run"}</button>
                </div>
              ) : ["ended", "complete", "failed"].includes(run.status) ? (
                <div className="border-2 border-black bg-white p-3">
                  <p className="text-xs font-medium uppercase tracking-wider opacity-60">↻ Run it again, with a steer</p>
                  <p className="mt-1 text-xs opacity-60">New version — every stage re-executes and your prompt steers the pass. Needs balance.</p>
                  <div className="relative mt-2">
                    <textarea id="drnib-reprompt-box" value={reprompt} onChange={(e) => setReprompt(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReprompt(); } }}
                      onInput={(e) => {
                        // Single-row chat box that grows with text (capped):
                        // the fixed two-row + deep button padding ate the
                        // panel (seen live). Same treatment on all three
                        // composers in this panel.
                        const el = e.currentTarget;
                        el.style.height = "auto";
                        el.style.height = `${Math.min(el.scrollHeight, 130)}px`;
                      }}
                      rows={1} placeholder='e.g. "redo the search with shorter queries, then hit public APIs"'
                      className="w-full resize-none rounded-xl border border-dark-gray/50 bg-white px-3 py-2 pb-9 text-sm outline-none" />
                    <button onClick={sendReprompt} disabled={privateProcessingPaused || repromptBusy || !reprompt.trim()} aria-label="Send reprompt"
                      className="absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center bg-black text-white disabled:opacity-50">
                      <Send size={14} aria-hidden="true" />
                    </button>
                  </div>
                  {repromptError && <p className="mt-1.5 text-[11px] text-red-700">{repromptError}</p>}
                </div>
              ) : drNibHasPendingQuestion(run) ? (
                <section id="drnib-pending-action" tabIndex={-1} aria-labelledby="drnib-pending-action-title" className="scroll-mt-24 rounded-xl border border-amber-300 border-l-4 border-l-amber-500 bg-amber-50 p-4 text-amber-950 shadow-sm">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-950"><Pause size={15} aria-hidden="true" /> Action needed · {run.pendingQuestion.externalRequest ? "Approval" : "Your answer"}</p>
                  <h3 id="drnib-pending-action-title" className="mt-2 text-[15px] font-semibold leading-7 text-amber-950">{run.pendingQuestion.prompt}</h3>
                  <p className="mt-1 text-xs leading-5 text-amber-950">This research step is paused until you {run.pendingQuestion.externalRequest ? "approve or skip this request" : "answer"}.</p>
                  {run.pendingQuestion.why && <p className="mt-0.5 text-xs opacity-70">{run.pendingQuestion.why}</p>}
                  {privateMode&&run.pendingQuestion.externalRequest&&<div className="mt-3 rounded-lg border border-dark-gray/40 p-3"><p className="text-xs leading-5">Nibgate’s payment service and the named provider can see this exact request and its response. Review it before approving. Your project keys are never sent.</p><pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all text-[11px] leading-5">{JSON.stringify(run.pendingQuestion.externalRequest,null,2)}</pre></div>}
                  {Array.isArray(run.pendingQuestion.options) && run.pendingQuestion.options.length > 0 && (
                    <div className="mt-2 space-y-2">
                      {run.pendingQuestion.options.map((o: any) => (
                        <button key={o.id || o.label} onClick={() => answerAwaiting(o.id)} disabled={awaitingBusy||privateProcessingPaused} data-testid="awaiting-option"
                          className={`flex w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800 disabled:opacity-50 ${run.pendingQuestion.externalRequest && o.id === "approve" ? "border-amber-950 bg-amber-950 text-amber-50 hover:bg-amber-900" : "border-amber-400 bg-amber-50 text-amber-950 hover:border-amber-800 hover:bg-amber-100"}`}>
                          {!run.pendingQuestion.externalRequest && <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-amber-800" />}
                          {o.label || o.id}
                        </button>
                      ))}
                    </div>
                  )}
                  {!(privateMode&&run.pendingQuestion.externalRequest)&&<div className="relative mt-2">
                    <textarea id="drnib-awaiting-box" aria-label="Your answer" value={awaitingText} onChange={(e) => setAwaitingText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); answerAwaiting(); } }}
                      onInput={(e) => {
                        const el = e.currentTarget;
                        el.style.height = "auto";
                        el.style.height = `${Math.min(el.scrollHeight, 130)}px`;
                      }}
                      rows={1} placeholder='Answer, or type "either"'
                      className="w-full resize-none rounded-xl border border-amber-400 bg-amber-50 text-amber-950 px-3 py-2 pb-9 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-800" />
                      <button onClick={() => answerAwaiting()} disabled={awaitingBusy || privateProcessingPaused|| !awaitingText.trim()} aria-label="Send answer"
                      className="absolute bottom-2.5 right-2.5 flex h-8 w-8 items-center justify-center bg-black text-white disabled:opacity-50">
                      <Send size={14} aria-hidden="true" />
                    </button>
                  </div>}
                  {awaitingBusy && <p role="status" className="mt-2 flex items-center gap-2 text-xs"><Loader2 size={14} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> Submitting your response…</p>}
                  {privateProcessingPaused&&<p className="mt-2 text-xs">Private processing is paused. Resume the reviewed worker before submitting an answer or approving a tool.</p>}
                  {awaitingError && <p role="alert" className="mt-2 text-xs text-red-800">{awaitingError}</p>}
                </section>
              ) : run.status === "awaiting" ? (
                <div role="status" className="border border-dark-gray/40 bg-white p-3 text-xs leading-5">
                  <p>The saved continuation is being checked. There is no current question to answer.</p>
                  <button disabled={actionBusy} onClick={()=>void load()} className="mt-2 border border-current px-3 py-2 disabled:opacity-50">Refresh saved question</button>
                </div>
              ) : run.status === "planned" ? (
                <div className="border-2 border-black bg-white p-3">
                  <p className="text-xs font-medium uppercase tracking-wider opacity-60">{escrowFunded ? "Ready to start" : "△ Not funded yet"}</p>
                  <p className="mt-1 text-sm leading-6">
                    {escrowConfigured === true && !escrowFunded
                      ? "Fund the escrow in the review box above — steering opens once the run starts."
                      : "Approve the plan in the review box above to start the run."}
                  </p>
                </div>
              ) : ["intake", "intake-done", "planning"].includes(run.status) ? (
                <div className="border border-dark-gray/40 bg-white p-3">
                  <p className="mt-1 text-sm leading-6 opacity-70">Still preparing — the run page comes alive once you approve the plan.</p>
                  {privateBuildEnabled()&&['draft','intake','intake-done'].includes(run.status)&&<Link href={`/dr-nib/research?project=${id}`} className="mt-3 inline-block rounded-lg border border-current px-3 py-2 text-sm">Continue setup</Link>}
                </div>
              ) : (
                <>
                  <div className="relative">
                    <textarea id="drnib-guidance-box" value={guidance} onChange={(e) => setGuidance(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendGuidance(); } }}
                      onInput={(e) => {
                        const el = e.currentTarget;
                        el.style.height = "auto";
                        el.style.height = `${Math.min(el.scrollHeight, 130)}px`;
                      }}
                      rows={1} placeholder="Steer the run — applies at the next stage boundary…"
                      className="w-full resize-none rounded-xl border border-dark-gray/50 bg-white px-3 py-2 pb-9 text-sm outline-none" />
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

"use client";

// The confidential run surface for the normal Dr. Nib flow.
//
// Reached from the restored flow's approve step when confidential mode is on.
// It never calls the ordinary research endpoints: the supplied source stays in
// this tab, is sealed to the attested guest, and the report is decrypted here.
// The ordinary run page (SSE feed, escrow settlement, versions) is bypassed.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { drNibApi } from "@/lib/dr-nib-api";
import { ConfidentialSourceManager } from "@/components/dr-nib/SourceManager";
import { PrivateReport } from "@/components/dr-nib/PrivateReport";
import {
  runConfidentialResearch,
  type ConfidentialRunIdentity,
  type ConfidentialRunState,
  type PrivateResultKey,
} from "@/lib/dr-nib-private-runner";
import { primaryLocalSource, type LocalSource } from "@/lib/dr-nib-private-sources";

export default function ConfidentialRun({ id }: { id: string }) {
  const [run, setRun] = useState<any | null>(null);
  const [source, setSource] = useState<LocalSource | null>(null);
  const [stage, setStage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState("");
  const [runState, setRunState] = useState<ConfidentialRunState | "">("");
  const identity = useRef<ConfidentialRunIdentity | null>(null);
  const resultKey = useRef<PrivateResultKey | null>(null);
  const workerStateKey = useRef<Uint8Array | null>(null);

  useEffect(() => {
    let active = true;
    drNibApi.getRun(id).then((r: any) => { if (active) setRun(r); }).catch(() => {});
    setSource(primaryLocalSource(id));
    return () => { active = false; };
  }, [id]);

  const question = String(run?.brief?.topic || run?.title || "").trim();

  async function execute() {
    if (busy) return;
    const src = primaryLocalSource(id);
    setSource(src);
    if (!src) { setError("Add the document you want researched first."); return; }
    if (question.length < 3) { setError("This run has no research question yet. Go back and enter a topic."); return; }
    setBusy(true); setError(""); setReport(""); setRunState(""); setStage("Starting");
    const priorReport = report;
    setReport("");
    try {
      const outcome = await runConfidentialResearch({
        run: identity.current ?? undefined,
        question,
        title: src.name.slice(0, 160),
        source: src.kind === "file" ? { kind: "file", file: src.file } : { kind: "text", text: src.text },
        resultKey: resultKey.current,
        workerStateKey: workerStateKey.current,
        onStage: setStage,
      });
      identity.current = { id: outcome.runId, tenantId: outcome.tenantId };
      resultKey.current = outcome.resultKey;
      workerStateKey.current = outcome.workerStateKey;
      setRunState(outcome.state);
      if (outcome.report) {
        setReport(outcome.report);
        setStage("Decrypted in this tab");
      } else if (outcome.state === "not_started") {
        setError("The private worker recorded no model call for this run. You can try a fresh attempt while the source stays in this tab.");
      } else if (outcome.state === "processing") {
        setError("The private worker is still processing. Keep this tab open and try again shortly.");
      } else {
        setError("The execution outcome is unknown. Check again before starting another attempt.");
      }
    } catch (cause) {
      setReport(priorReport);
      setError(cause instanceof Error ? cause.message : "Confidential research could not continue.");
      setStage("Stopped");
    } finally {
      setBusy(false);
    }
  }

  const canRetry = Boolean(identity.current && resultKey.current && !busy);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-gray/50 bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-wider opacity-80">Private · end-to-end encrypted</span>
        <Link href="/dr-nib/projects" className="text-xs underline opacity-60 hover:opacity-100">Projects</Link>
      </div>
      <h1 className="nibgate-display-title text-2xl font-medium md:text-3xl">{run?.title || "Confidential research"}</h1>
      {question ? <p className="mt-2 text-sm leading-6 opacity-70">{question}</p> : null}

      <p className="mt-4 max-w-2xl text-xs leading-5 opacity-70">
        Your document and the report never leave this browser in the clear. The document is sealed to the verified confidential worker, which does the reading and writing inside a measured enclave; Dr. Nib&apos;s servers see only ciphertext. Keep this tab open while it runs.
      </p>

      {!report && <ConfidentialSourceManager runId={id} readOnly={busy} onChanged={() => setSource(primaryLocalSource(id))} />}

      {source && !report && (
        <p className="mt-1 text-xs opacity-60">Ready: {source.name}</p>
      )}

      {!report && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button onClick={execute} disabled={busy || !source || question.length < 3}
            className="inline-flex items-center gap-2 bg-black px-6 py-2 text-sm font-medium text-white disabled:opacity-50">
            {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            {busy ? "Running privately…" : canRetry ? "Try again" : "Run confidential research"}
          </button>
          {!source ? <span className="text-xs opacity-60">Add a document to begin.</span> : null}
        </div>
      )}

      {busy && stage ? <p role="status" aria-live="polite" className="mt-3 text-sm opacity-70">{stage}…</p> : null}
      {!busy && stage && !report ? <p className="mt-3 text-xs opacity-60">{stage}</p> : null}

      {error ? <p role="alert" className="mt-4 border border-red-700 bg-red-50 p-4 text-sm text-red-900">{error}</p> : null}

      {report && (
        <section className="mt-6 rounded-2xl border border-dark-gray/50 bg-white p-5 md:p-7">
          <p className="text-xs font-medium uppercase tracking-wider opacity-60">Confidential report · decrypted in this tab</p>
          <PrivateReport markdown={report} />
          <div className="mt-5 flex flex-wrap gap-3">
            <button onClick={execute} disabled={busy} className="border border-dark-gray/60 px-4 py-2 text-sm font-medium disabled:opacity-50">Run again</button>
            <button onClick={() => { void navigator.clipboard.writeText(report); }} className="border border-dark-gray/60 px-4 py-2 text-sm font-medium">Copy report</button>
          </div>
          <p className="mt-3 text-xs opacity-60">Only this tab can read this report. It is not stored on Dr. Nib&apos;s servers.</p>
        </section>
      )}

      {runState === "not_started" || runState === "uncertain" ? (
        <p className="mt-4 text-xs opacity-60">Run state: {runState}. Nothing was charged and no ordinary processing was started.</p>
      ) : null}
    </div>
  );
}

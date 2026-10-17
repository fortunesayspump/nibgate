"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/dr-nib/common";
import { PrivateReport } from "@/components/dr-nib/PrivateReport";
import { useNibgateConnect } from "@/lib/useNibgateConnect";
import { createPrivateRun, executeFullPrivateRun, executePrivateRun, getEncryptedPrivateReport, getPrivateJobStatus,
  listPrivateRunSummaries, openGuestSession, proveGuestKey, type PrivateJobStatus, type PrivateRunSummary } from "@/lib/dr-nib-private-api";
import { base64ToBytes, bytesToBase64, bytesToHex, equalHex, freshId, freshNonce, generateResultKey,
  openReport, proofDigest, recipientId, sealSource, type PrivateEnvelope } from "@/lib/dr-nib-private-crypto";
import { configuredPrivateVerification, verifyPrivateSession } from "@/lib/dr-nib-private-verification";
import { canRetryPrivateReport, choosePrivateFile, PRIVATE_FILE_EXTENSIONS, PRIVATE_FILE_LIMIT,
  privateFailureStage, PrivateRequestGate } from "@/lib/dr-nib-private-interaction";
import { canBeginFreshVerifiedAttempt, pollPrivateJob } from "@/lib/dr-nib-private-recovery";
import { freshWorkerStateKey, sealWorkerStateKey } from "@/lib/dr-nib-private-worker-key";
import { deletePrivateRun, listPrivateRuns, privateKeyStoreAvailable, savePrivateRun,
  updatePrivateRunReport, type PrivateLocalRun } from "@/lib/dr-nib-private-key-store";
import { derivePrivateKeys, privateRunKeyTypedData } from "@/lib/dr-nib-private-wallet-key";
import { useSignTypedData } from "@nibgate/wallet/react";

type Identity = { id: string; tenantId: string };
type ResultKey = Awaited<ReturnType<typeof generateResultKey>>;
type JobUiState = "" | PrivateJobStatus["state"] | "unknown";
const verification = configuredPrivateVerification();
// Explicit local-build opt-in only. An unavailable full worker is an error,
// never a reason to fall back to the bounded route with a private document.
const fullWorkerMode = process.env.NEXT_PUBLIC_DRNIB_PRIVATE_FULL_ENABLED === "true";
const MAX_TEXT = 100_000;

// A quiet pill marking the confidential path everywhere it appears. The whole
// Dr. Nib research experience is private by default, so this is a label, not a
// toggle.
export function PrivateBadge({ label = "Private" }: { label?: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-dark-gray/50 bg-white px-3 py-1 text-[11px] font-medium uppercase tracking-wider opacity-80">{label}</span>;
}

function humanError(value: unknown): string {
  return value instanceof Error ? value.message : "Private research could not continue. No ordinary processing was started.";
}
function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }

export default function PrivateResearch() {
  const [question, setQuestion] = useState("");
  const [title, setTitle] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [fileName, setFileName] = useState("");
  const [sourceFile, setSourceFile] = useState<File | null>(null);
  const [stage, setStage] = useState("Idle");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState("");
  const [verified, setVerified] = useState(false);
  const [reportId, setReportId] = useState("");
  const [runId, setRunId] = useState("");
  const [jobState, setJobState] = useState<JobUiState>("");
  const [uncertainExecution, setUncertainExecution] = useState(false);
  const [recent, setRecent] = useState<PrivateLocalRun[]>([]);
  const [walletRecovery, setWalletRecovery] = useState(false);
  const [serverRuns, setServerRuns] = useState<PrivateRunSummary[]>([]);
  const identity = useRef<Identity | null>(null);
  const resultKey = useRef<ResultKey | null>(null);
  const workerStateKey = useRef<Uint8Array | null>(null);
  const executionAcknowledged = useRef(false);
  const gate = useRef(new PrivateRequestGate());
  const { connect, signIn, address, busy: signInBusy, error: signInError } = useNibgateConnect();
  const { signTypedDataAsync } = useSignTypedData();

  useEffect(() => {
    let cancelled = false;
    if (privateKeyStoreAvailable()) void listPrivateRuns().then(rows => { if (!cancelled) setRecent(rows); }).catch(() => {});
    void listPrivateRunSummaries().then(rows => { if (!cancelled) setServerRuns(rows); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  function selectFile(file?: File) {
    const choice = choosePrivateFile(file);
    if (!choice) return;
    setSourceFile(choice.sourceFile);
    setFileName(choice.fileName);
    setSourceText(choice.sourceText);
    setTitle(choice.title);
    setError(choice.error);
  }

  async function fetchReport(run: Identity, id: string, key: ResultKey) {
    setStage("Waiting for encrypted report");
    const deadline = Date.now() + 120_000;
    for (let attempt = 0; attempt < 60 && Date.now() < deadline; attempt++) {
      const envelope = await getEncryptedPrivateReport(run.id, id);
      if (envelope) {
        const markdown = await openReport(key.privateKey, envelope, {
          tenantId: run.tenantId, runId: run.id, objectId: id, recipientId: key.recipientId,
        });
        setReport(markdown);
        setStage("Decrypted in this tab");
        setError("");
        return;
      }
      await sleep(2000);
    }
    throw Error("The encrypted report is still pending. Keep this tab open and try fetching it again.");
  }

  async function applyJobStatus(run: Identity, status: PrivateJobStatus) {
    setJobState(status.state);
    if (status.state === "complete") {
      setReportId(status.reportId);
      setUncertainExecution(false);
      void updatePrivateRunReport(run.id, status.reportId).then(() => listPrivateRuns()).then(setRecent).catch(() => {});
      const key = resultKey.current;
      if (!key) {
        setStage("Report key lost");
        setError("The report key was lost from this tab, so this report cannot be decrypted here.");
        return;
      }
      try { await fetchReport(run, status.reportId, key); }
      catch (cause) { setError(humanError(cause)); setStage("Encrypted report unavailable"); }
    } else if (status.state === "not_started") {
      setUncertainExecution(false);
      setStage("No private processing recorded");
      setError("The private worker has not recorded a model call for this run. You can start a fresh verified attempt below if the source and result key remain in this tab.");
    } else if (status.state === "processing") {
      setUncertainExecution(false);
      setStage("Private worker is still processing");
      setError("The private worker is still processing. Keep this tab open and check status again shortly.");
    } else {
      setUncertainExecution(true);
      setStage("Execution outcome unknown");
      setError("The worker may have called the model, but no sealed report is confirmed. Do not start another run until this one is resolved.");
    }
  }

  async function dispatchAndRecover(run: Identity, sessionId: string,
    envelope: PrivateEnvelope, keyEnvelope?: PrivateEnvelope) {
    let acknowledged = false;
    let outcome: Awaited<ReturnType<typeof executePrivateRun>> | null = null;
    let executeError: unknown;
    try {
      if (fullWorkerMode && !keyEnvelope || !fullWorkerMode && keyEnvelope)
        throw Error("Private worker mode and sealed key did not match.");
      outcome = fullWorkerMode ?
        await executeFullPrivateRun(run.id, sessionId, envelope, keyEnvelope!) :
        await executePrivateRun(run.id, sessionId, envelope);
      acknowledged = true;
      executionAcknowledged.current = true;
    }
    catch (cause) { executeError = cause; }
    if (outcome?.state === "complete") {
      await applyJobStatus(run, { state: "complete", reportId: outcome.reportId });
      return;
    }
    setStage("Checking private worker progress");
    try {
      const status = await pollPrivateJob(run.id, { allowNotStarted: !acknowledged });
      await applyJobStatus(run, status);
    } catch (cause) {
      setJobState("unknown");
      setUncertainExecution(true);
      setStage("Execution outcome unknown");
      setError(`${humanError(executeError ?? cause)} Check this private run's status before attempting another submission.`);
    }
  }

  async function checkJob() {
    const run = identity.current;
    if (!run || !jobState || jobState === "complete" || busy || !gate.current.enter()) return;
    setBusy(true); setError(""); setStage("Checking private run status");
    try {
      const status = await getPrivateJobStatus(run.id);
      if (status.state === "not_started" &&
          (executionAcknowledged.current || (jobState !== "not_started" && jobState !== "unknown")))
        throw Error("Private job disappeared after its execution was acknowledged.");
      await applyJobStatus(run, status);
    } catch (cause) {
      setError(`${humanError(cause)} No source was submitted again.`);
      setStage("Private run status unavailable");
    } finally { setBusy(false); gate.current.leave(); }
  }

  async function retryReport() {
    if (!canRetryPrivateReport(identity.current, resultKey.current, reportId) || busy || !gate.current.enter()) return;
    setBusy(true); setError("");
    try { await fetchReport(identity.current!, reportId, resultKey.current!); }
    catch (cause) { setError(humanError(cause)); setStage("Report unavailable"); }
    finally { setBusy(false); gate.current.leave(); }
  }

  async function reopen(entry: PrivateLocalRun) {
    if (busy || !gate.current.enter()) return;
    setBusy(true); setError(""); setReport("");
    try {
      identity.current = { id: entry.runId, tenantId: entry.tenantId };
      setRunId(entry.runId);
      resultKey.current = entry.key;
      workerStateKey.current = entry.stateKey ?? null;
      if (entry.reportId) {
        setReportId(entry.reportId);
        setJobState("complete");
        await fetchReport(identity.current, entry.reportId, entry.key);
      } else {
        setStage("Loaded a private run from this device");
        setError("This run has no stored report yet. Keep the tab open and check its status.");
      }
    } catch (cause) { setError(humanError(cause)); setStage("Stored report unavailable"); }
    finally { setBusy(false); gate.current.leave(); }
  }

  async function forget(runId: string) {
    try { await deletePrivateRun(runId); setRecent(await listPrivateRuns()); } catch {}
  }

  async function recoverFromWallet(entry: PrivateRunSummary) {
    if (busy || !gate.current.enter()) return;
    setBusy(true); setError(""); setReport("");
    try {
      if (!address) throw Error("Connect the wallet that created this run to recover it.");
      setStage("Sign to rebuild the report key");
      const signature = await signTypedDataAsync(privateRunKeyTypedData(entry.id) as Parameters<typeof signTypedDataAsync>[0]);
      const derived = await derivePrivateKeys(signature);
      identity.current = { id: entry.id, tenantId: entry.tenantId };
      setRunId(entry.id);
      resultKey.current = derived.resultKey;
      workerStateKey.current = derived.stateKey;
      await applyJobStatus(identity.current, await getPrivateJobStatus(entry.id));
    } catch (cause) { setError(humanError(cause)); setStage("Wallet recovery failed"); }
    finally { setBusy(false); gate.current.leave(); }
  }

  async function submit(event?: FormEvent<HTMLFormElement>, freshAttempt = false) {
    event?.preventDefault();
    const verifiedFreshAttempt = freshAttempt && canBeginFreshVerifiedAttempt(jobState,
      !!identity.current, !!resultKey.current && (!fullWorkerMode || !!workerStateKey.current),
      !!sourceFile || !!sourceText.trim(), executionAcknowledged.current);
    if (!verification || busy || reportId || (jobState && !verifiedFreshAttempt) ||
        (uncertainExecution && !verifiedFreshAttempt) || !gate.current.enter()) return;
    setError(""); setVerified(false); setBusy(true); setJobState(""); setUncertainExecution(false);
    executionAcknowledged.current = false;
    const cleanQuestion = question.trim();
    const cleanTitle = title.trim();
    if (cleanQuestion.length < 3 || cleanQuestion.length > 1000 || cleanTitle.length < 1 || cleanTitle.length > 160 ||
        (!sourceFile && sourceText.trim().length < 1) || sourceText.length > MAX_TEXT ||
        (sourceFile && (sourceFile.size < 1 || sourceFile.size > PRIVATE_FILE_LIMIT || sourceFile.name.length > 160 || !PRIVATE_FILE_EXTENSIONS.test(sourceFile.name)))) {
      setError("Add a question (3–1,000 characters), a source title, and a supported file up to 2 MB or pasted text up to 100,000 characters.");
      setBusy(false); gate.current.leave(); return;
    }
    let executionMayHaveStarted = false;
    try {
      setStage("Creating empty private run");
      const run = identity.current ?? await createPrivateRun();
      identity.current = run;
      setRunId(run.id);

      setStage("Requesting fresh guest evidence");
      const nonce = freshNonce();
      const session = await openGuestSession(run.id, bytesToHex(nonce));
      if (!equalHex(session.clientNonce, bytesToHex(nonce))) throw Error("Guest nonce did not match this browser session.");
      const guestKey = base64ToBytes(session.recipientPublicKey, 65, 65);
      if (!equalHex(session.recipientId, await recipientId(guestKey))) throw Error("Guest encryption key identity did not match.");

      setStage("Checking independent attestation");
      await verifyPrivateSession({ mode: verification, session, nonce, publicKey: guestKey });

      setStage("Checking live key possession");
      const challenge = freshNonce();
      const challengeEnvelope = await sealSource(guestKey, {
        tenantId: run.tenantId, runId: run.id, objectId: freshId(), revision: 1,
        purpose: "source", recipientId: session.recipientId,
      }, challenge);
      const proof = await proveGuestKey(run.id, session.sessionId, challengeEnvelope) as {
        verified?: unknown; recipientId?: unknown; clientNonce?: unknown; sessionId?: unknown; challengeDigest?: unknown;
      };
      if (!proof || proof.verified !== true || proof.sessionId !== session.sessionId ||
          !equalHex(proof.recipientId as string, session.recipientId) ||
          !equalHex(proof.clientNonce as string, bytesToHex(nonce)) ||
          !equalHex(proof.challengeDigest as string, await proofDigest(session.sessionId, challenge)))
        throw Error("Guest could not prove possession of its attested key.");
      setVerified(true);

      setStage("Encrypting source in this browser");
      // Reuse the tab-held report key for an explicit fresh attempt on the same
      // no-started run. A delayed old result would still be decryptable.
      let key = resultKey.current;
      let recoveredWith = "";
      if (!key && walletRecovery && address) {
        setStage("Sign once to make this report recoverable");
        try {
          const signature = await signTypedDataAsync(privateRunKeyTypedData(run.id) as Parameters<typeof signTypedDataAsync>[0]);
          const derived = await derivePrivateKeys(signature);
          key = derived.resultKey;
          workerStateKey.current = derived.stateKey;
          recoveredWith = address;
        } catch { key = null; }
      }
      key = key ?? await generateResultKey();
      resultKey.current = key; // Never localStorage, cookies, URL, or backend.
      const input = sourceFile ? {
        question: cleanQuestion, title: cleanTitle, fileName: sourceFile.name,
        fileBase64: bytesToBase64(new Uint8Array(await sourceFile.arrayBuffer())),
        browserPublicKey: bytesToBase64(key.publicKey),
      } : { question: cleanQuestion, title: cleanTitle, sourceText,
        browserPublicKey: bytesToBase64(key.publicKey) };
      const plain = new TextEncoder().encode(JSON.stringify(input));
      const sourceEnvelope = await sealSource(guestKey, {
        tenantId: run.tenantId, runId: run.id, objectId: freshId(), revision: 1,
        purpose: "source", recipientId: session.recipientId,
      }, plain);

      let keyEnvelope: PrivateEnvelope | undefined;
      if (fullWorkerMode) {
        const stateKey = workerStateKey.current ?? freshWorkerStateKey();
        workerStateKey.current = stateKey; // Tab memory only, no recovery escrow.
        let keyObjectId = freshId();
        while (keyObjectId === sourceEnvelope.context.objectId) keyObjectId = freshId();
        keyEnvelope = await sealWorkerStateKey(guestKey, {
          tenantId: run.tenantId, runId: run.id, objectId: keyObjectId,
          revision: 1, purpose: "source", recipientId: session.recipientId,
        }, session.sessionId, stateKey);
      }

      void savePrivateRun({ runId: run.id, tenantId: run.tenantId, question: cleanQuestion,
        title: cleanTitle, reportId: null, createdAt: Date.now(), key,
        ...(workerStateKey.current ? { stateKey: workerStateKey.current } : {}),
        ...(recoveredWith ? { wallet: recoveredWith } : {}) })
        .then(() => listPrivateRuns()).then(setRecent).catch(() => {});

      setStage("Processing inside private worker");
      setUncertainExecution(true); // A lost execute response may have completed.
      executionMayHaveStarted = true;
      await dispatchAndRecover(run, session.sessionId, sourceEnvelope, keyEnvelope);
    } catch (cause) {
      setError(humanError(cause));
      setStage(privateFailureStage(executionMayHaveStarted, false));
      if (executionMayHaveStarted) { setJobState("unknown"); setUncertainExecution(true); }
    } finally { setBusy(false); gate.current.leave(); }
  }

  return (
    <div>
      <PageHeader eyebrow="Dr. Nib · Research" title="Research a private document"
        action={<PrivateBadge label="Private · end-to-end encrypted" />}
        desc={fullWorkerMode ?
          "A measured source-only plan and writing pass. Private by default: the document and question leave this page only after the guest's evidence and encryption key are verified." :
          "A single source-only research pass. Private by default: the document and question leave this page only after the guest's evidence and encryption key are verified."} />

      {!verification && <section role="status" className="mb-6 border border-dark-gray/50 bg-white p-5">
        <h3 className="text-lg font-medium">Private research is not configured</h3>
        <p className="mt-2 text-sm leading-6 opacity-75">No approved guest release and complete verification path are configured for this build. Your document will not be uploaded or sent through ordinary Dr. Nib processing.</p>
      </section>}

      <p className="mb-6 max-w-3xl text-sm leading-6 opacity-75">
        Supported files: PDF, DOCX, XLSX, CSV, TXT, MD, PNG, JPEG and WebP, up to 2 MB. Text extraction runs inside the verified guest; {fullWorkerMode ? "files with more than 100,000 extracted characters are rejected" : "only the first 100,000 extracted characters are analyzed"}, so split longer documents. Scanned PDFs without selectable text may fail, and image OCR can misread figures. Keep this page open while it runs: the report key is saved only in this browser when the run starts, so a finished report can be reopened later on this device. That key is never sent to a server, so clearing this browser&apos;s storage or switching devices leaves the stored report undecryptable{fullWorkerMode ? ", and the worker-state keys stay in memory only" : ""}. A private run whose key is gone may need to be restarted.
      </p>
      {fullWorkerMode && <p className="mb-6 max-w-3xl text-sm leading-6 opacity-75">
        Full worker mode is enabled in this build for a bounded source-only plan and roughly 300-word report. A guest restart during processing cannot currently resume the job; the status will remain uncertain, and this page will not automatically start it again.
      </p>}
      <p className="mb-6 max-w-3xl text-sm leading-6 opacity-75">
        For protection against a malicious operator changing this page, use an independently pinned client build and reviewed release policy. A mutable website alone cannot establish that guarantee.
      </p>

      <form onSubmit={submit} className="max-w-3xl space-y-5 border border-dark-gray/40 bg-white p-5 md:p-7">
        <div>
          <label htmlFor="private-question" className="block text-sm font-medium">Research question</label>
          <textarea id="private-question" value={question} onChange={event => setQuestion(event.target.value)}
            rows={3} maxLength={1000} disabled={!verification || busy || !!reportId || !!jobState || uncertainExecution}
            placeholder="What should Dr. Nib examine in this source?"
            className="mt-2 w-full border border-dark-gray/50 bg-white p-3 text-sm leading-6 focus-visible:outline-2 focus-visible:outline-offset-2" />
        </div>
        <div>
          <label htmlFor="private-file" className="block text-sm font-medium">Document</label>
          <input id="private-file" type="file" accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.png,.jpg,.jpeg,.webp"
            onChange={event => { selectFile(event.currentTarget.files?.[0]); event.currentTarget.value = ""; }}
            disabled={!verification || busy || !!reportId || !!jobState || uncertainExecution}
            className="mt-2 block w-full text-sm file:mr-4 file:border file:border-dark-gray/50 file:bg-white file:px-4 file:py-2 file:text-sm file:font-medium focus-visible:outline-2" />
          {fileName && <p className="mt-2 text-xs opacity-70">Selected in this tab: {fileName}. It will be encrypted before upload.</p>}
        </div>
        <div>
          <label htmlFor="private-title" className="block text-sm font-medium">Source title</label>
          <input id="private-title" value={title} onChange={event => setTitle(event.target.value)} maxLength={160}
            disabled={!verification || busy || !!reportId || !!jobState || uncertainExecution} placeholder="A name for the supplied source"
            className="mt-2 w-full border border-dark-gray/50 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-2" />
        </div>
        <div>
          <label htmlFor="private-text" className="block text-sm font-medium">Or paste source text</label>
          <textarea id="private-text" value={sourceText} onChange={event => { setSourceText(event.target.value); if (sourceFile) setTitle(""); setFileName(""); setSourceFile(null); }}
            rows={10} maxLength={MAX_TEXT} disabled={!verification || busy || !!reportId || !!jobState || uncertainExecution}
            placeholder="Paste text here instead of choosing a document."
            className="mt-2 w-full border border-dark-gray/50 bg-white p-3 text-sm leading-6 focus-visible:outline-2 focus-visible:outline-offset-2" />
          <p className="mt-1 text-xs opacity-60">{sourceText.length.toLocaleString()} / {MAX_TEXT.toLocaleString()} characters</p>
        </div>
        <label className="flex items-start gap-3 text-sm leading-6">
          <input type="checkbox" checked={walletRecovery} onChange={event => setWalletRecovery(event.target.checked)}
            disabled={!verification || busy || !!reportId || !!jobState || uncertainExecution} className="mt-1" />
          <span>Make this report recoverable on other devices. You sign one message; the report key is derived from that signature and never leaves your wallet or this browser.</span>
        </label>
        <button type="submit" disabled={!verification || busy || !!reportId || !!jobState || uncertainExecution}
          className="border border-black bg-black px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white hover:text-black focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-40">
          {busy ? "Working…" : "Verify and research privately"}
        </button>
      </form>

      <div className="mt-6 max-w-3xl border border-dark-gray/40 bg-white p-5" aria-live="polite">
        <p className="text-xs font-medium uppercase tracking-wider opacity-60">Session status</p>
        <p className="mt-2 text-sm font-medium">{stage}</p>
        {runId && <p className="mt-1 break-all text-xs opacity-70">Private run ID: {runId}</p>}
        <p className="mt-1 text-sm opacity-70">{verified ? "Guest evidence and key possession passed for this session." : "Guest has not been verified for this session."}</p>
        {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
        {reportId && !report && <button type="button" onClick={() => void retryReport()} disabled={busy}
          className="mt-3 border border-black px-4 py-2 text-sm font-medium hover:bg-black hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40">
          Retry encrypted report
        </button>}
        {jobState && jobState !== "complete" && <button type="button" onClick={() => void checkJob()} disabled={busy}
          className="mt-3 border border-black px-4 py-2 text-sm font-medium hover:bg-black hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40">
          Check private run status
        </button>}
        {canBeginFreshVerifiedAttempt(jobState, !!identity.current,
          !!resultKey.current && (!fullWorkerMode || !!workerStateKey.current),
          !!sourceFile || !!sourceText.trim(), executionAcknowledged.current) &&
          <button type="button" onClick={() => void submit(undefined, true)} disabled={busy}
          className="ml-3 mt-3 border border-black px-4 py-2 text-sm font-medium hover:bg-black hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-40">
          Verify a fresh guest and try again
        </button>}
        {uncertainExecution && !reportId && <p className="mt-3 text-sm leading-6 opacity-75">
          The worker may have called the model after the connection was lost. Check this run's status. Do not begin another run unless its outcome is resolved.
        </p>}
      </div>

      {recent.length > 0 && <section className="mt-6 max-w-3xl border border-dark-gray/40 bg-white p-5">
        <p className="text-xs font-medium uppercase tracking-wider opacity-60">Private research on this device</p>
        <p className="mt-2 text-sm leading-6 opacity-75">These reopen because their keys are stored only in this browser. Nobody else — including Nibgate — can decrypt them.</p>
        <ul className="mt-3 divide-y divide-dark-gray/30">
          {recent.map(entry => <li key={entry.runId} className="flex items-center justify-between gap-4 py-3">
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium">{entry.title || entry.question || "Private run"}</span>
              <span className="block text-xs opacity-60">{new Date(entry.createdAt).toLocaleString()} · {entry.reportId ? "report saved" : "no report yet"}</span>
            </span>
            <span className="flex shrink-0 gap-2">
              {entry.reportId && <button type="button" onClick={() => void reopen(entry)} disabled={busy}
                className="border border-black px-3 py-1.5 text-xs font-medium hover:bg-black hover:text-white focus-visible:outline-2 disabled:opacity-40">
                Open
              </button>}
              <button type="button" onClick={() => void forget(entry.runId)} disabled={busy}
                className="border border-dark-gray/50 px-3 py-1.5 text-xs font-medium hover:bg-black hover:text-white focus-visible:outline-2 disabled:opacity-40">
                Forget
              </button>
            </span>
          </li>)}
        </ul>
      </section>}

      {serverRuns.length > 0 && <section className="mt-6 max-w-3xl border border-dark-gray/40 bg-white p-5">
        <p className="text-xs font-medium uppercase tracking-wider opacity-60">From your account</p>
        <p className="mt-2 text-sm leading-6 opacity-75">Confidential runs recorded for your account. Recover one on any device by signing with the wallet that created it.</p>
        <ul className="mt-3 divide-y divide-dark-gray/30">
          {serverRuns.map(entry => <li key={entry.id} className="flex items-center justify-between gap-4 py-3">
            <span className="min-w-0">
              <span className="block truncate text-xs font-medium">{entry.id}</span>
              <span className="block text-xs opacity-60">{new Date(entry.createdAt).toLocaleString()} · {entry.status}</span>
            </span>
            <button type="button" onClick={() => void recoverFromWallet(entry)} disabled={busy || !address}
              className="shrink-0 border border-black px-3 py-1.5 text-xs font-medium hover:bg-black hover:text-white focus-visible:outline-2 disabled:opacity-40">
              Recover
            </button>
          </li>)}
        </ul>
      </section>}

      {report && <article className="mt-6 max-w-3xl border border-dark-gray/40 bg-white p-5 md:p-7">
        <h3 className="text-xl font-medium">Private report</h3>
        <p className="mt-1 text-xs opacity-60">Decrypted in this tab. The report key is stored only in this browser; the plaintext report is never saved. External images and links are disabled here.</p>
        <PrivateReport markdown={report} />
      </article>}

      {error.includes("Sign in") && <div className="mt-5">
        <button type="button" disabled={signInBusy} onClick={async () => { try { if (!address) await connect(); await signIn(); } catch {} }}
          className="border border-black px-4 py-2 text-sm font-medium hover:bg-black hover:text-white disabled:opacity-40">
          {signInBusy ? "Signing in…" : "Sign in with wallet"}
        </button>
        {signInError && <p role="status" className="mt-2 text-sm text-red-700">{signInError}</p>}
      </div>}
    </div>
  );
}

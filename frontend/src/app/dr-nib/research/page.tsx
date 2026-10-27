"use client";
import {privateBuildEnabled,privateFundingEnabled,getPrivateManifest,privateTenantId} from '@/lib/dr-nib-private-records';

import { useEffect, useRef, useState } from "react";
import { createResearchSubmissionController, isResearchSignInRequired } from "@/lib/dr-nib-signin-submission";
import { guestPlanningCapabilities, isGuestProject, beginGuestPlanning, saveGuestComposerSnapshot, restoreGuestComposerSnapshot, adoptGuestProject, classifyGuestPlanningError, type GuestPlanningLimits } from "@/lib/dr-nib-guest-planning";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Send, Square } from "lucide-react";
import { drNibApi, type IntakeAnswer, type IntakeOption, type IntakeQuestion } from "@/lib/dr-nib-api";
import { useNibgateConnect } from "@/lib/useNibgateConnect";
import { SourceManager, ConfidentialSourceManager } from "@/components/dr-nib/SourceManager";
import { EscrowDeposit } from "@/components/dr-nib/EscrowDeposit";


const SAMPLES = [
  "Compare Arc vs Base for USDC micropayments, last 90 days",
  "Which creator paywall models convert best in 2026?",
  "Summarize the x402 ecosystem and who is shipping on it",
];

type Phase = "composer" | "creating" | "questions" | "configure" | "review";
function PrivateRunningActivity({runId}:{runId:string}) {
  const [snapshot,setSnapshot]=useState<any>(null),[reconnecting,setReconnecting]=useState(false);
  useEffect(()=>{
    let stopped=false,timer:ReturnType<typeof setTimeout>;
    const poll=async()=>{try{const {value}=await getPrivateManifest(runId,true);if(!stopped){setSnapshot(value);setReconnecting(false)}}catch{if(!stopped)setReconnecting(true)}finally{if(!stopped)timer=setTimeout(poll,4000)}};
    void poll();return()=>{stopped=true;clearTimeout(timer)};
  },[runId]);
  return <div role="status" aria-live="polite" className="mt-4 space-y-2 rounded border border-dark-gray/40 p-3 text-left text-xs">
    <p className="font-medium">Agent activity{reconnecting?' · reconnecting…':''}</p>
    {(snapshot?.events??[]).filter((e:any)=>e.type==='thinking'||e.type==='tool.call').slice(-6).map((e:any,i:number)=><p key={`${e.at}-${i}`}>{e.type==='tool.call'?`${e.tool}: ${e.result?.summary??'completed'}`:e.text}</p>)}
    {(snapshot?.decisions??[]).filter((d:any)=>d.kind==='decision').slice(-6).map((d:any)=><p key={d.id} className="font-mono">{d.output?.model} · {d.step}: {d.output?.decision??(typeof d.output?.probability==='number'?`p=${d.output.probability.toFixed(2)}`:d.type)}</p>)}
  </div>;
}
type Item = { seq: number; question: IntakeQuestion; answer?: IntakeAnswer; thinking?: string };
type RestoredResearchRun = {
  id: string; status: string;
  decisions?: { kind: string; seq: number; question: IntakeQuestion; answer?: IntakeAnswer }[];
  questions?: (IntakeQuestion & { seq?: number })[];
  plan?: { estimate?: number; sub_questions?: string[]; source?: string };
};

function cleanAnswer(a: IntakeAnswer, q: IntakeQuestion, other: boolean): IntakeAnswer {
  const text = (a.text || "").trim();
  if (q.type === "free") return { text };
  return { optionIds: a.optionIds || [], text: other ? text : "" };
}
function hasAnswer(a: IntakeAnswer): boolean {
  return Boolean((a.optionIds && a.optionIds.length) || (a.text && a.text.trim()));
}

// Saved-answer label for collapsed batch cards: option labels, not ids.
function answerLabel(it: { question: IntakeQuestion; answer?: IntakeAnswer }): string {
  const a = it.answer;
  if (!a) return "";
  if (a.text && a.text.trim()) {
    const ids = (a.optionIds || []).map((id) => it.question.options.find((o) => o.id === id)?.label || id);
    return [...ids, `"${a.text.trim()}"`].filter(Boolean).join(", ");
  }
  const ids = (a.optionIds || []).map((id) => it.question.options.find((o) => o.id === id)?.label || id);
  return ids.join(", ") || "(answered)";
}

export default function ResearchNewPage() {
  const router = useRouter();
  // Render the original Dr. Nib flow (intake → plan → review → escrow → run).
  const confidential = false;
  const [availability, setAvailability] = useState<"checking" | "ready" | "preview" | "unavailable">("checking");
  const [availabilityAttempt, setAvailabilityAttempt] = useState(0);
  const [availabilityReason,setAvailabilityReason]=useState<string|null>(null);
  const [privateWebEnabled,setPrivateWebEnabled]=useState(false);
  const [publicSearchBrief,setPublicSearchBrief]=useState<string|null>(null);
  useEffect(() => {
    let cancelled = false;
    drNibApi.health().then((health) => {
      if (!cancelled) {setPrivateWebEnabled(health.publicRetrieval===true);setAvailabilityReason(health.research?.reason??null);setAvailability(health.research?.acceptingRuns === false ? (health.research.reason === "mainnet-funding-not-ready" ? "preview" : "unavailable") : "ready");}
    }).catch(() => { if (!cancelled) {setAvailabilityReason('connection-failed');setAvailability("unavailable");} });
    return () => { cancelled = true; };
  }, [availabilityAttempt]);
  // Dr. Nib is wallet-gated through the same shared hub session as the header.
  // When a call comes back 401 (wallet connected but not signed in), prompt and
  // open the shared connect/sign-in rather than showing a raw error.
  const { requestSignIn, signIn, address: connectedAddress, busy: signInBusy, error: signInError } = useNibgateConnect();
  const [phase, setPhase] = useState<Phase>("composer");
  const [topic, setTopic] = useState("");
  const submission = useRef(createResearchSubmissionController());
  const [submissionBusy, setSubmissionBusy] = useState(false);
  const topicInput = useRef<HTMLTextAreaElement>(null);
  const researchView = useRef<HTMLDivElement>(null);
  const previousPhase = useRef("composer");
  const composerEdited = useRef(false);
  useEffect(() => {
    const controller = submission.current;
    return () => controller.invalidate();
  }, []);
  function editTopic(value: string) {
    composerEdited.current = true;
    submission.current.invalidate();
    setTopic(value);
  }
  const [project, setProject] = useState<any | null>(null);
  const [guestEnabled, setGuestEnabled] = useState(false);
  const [guestReady, setGuestReady] = useState(false);
  const [guestMode, setGuestMode] = useState(false);
  const [guestLimits, setGuestLimits] = useState<GuestPlanningLimits | undefined>();
  const [guestExpiresAt, setGuestExpiresAt] = useState<string | undefined>();
  const [guestPlanningExpired, setGuestPlanningExpired] = useState(false);
  const [guestRecoveryCanAdopt, setGuestRecoveryCanAdopt] = useState(false);
  const [guestRestoreRetryable, setGuestRestoreRetryable] = useState(true);
  useEffect(() => {
    if (!guestMode) return;
    void restoreGuestComposerSnapshot().then(saved => {
      if (saved) { setGuestExpiresAt(saved.expiresAt); setGuestLimits(saved.limits); setGuestPlanningExpired(saved.planningExpired); }
    }).catch(() => { /* The existing draft error owns recovery, never reset. */ });
  }, [guestMode, project?.id]);
  useEffect(() => {
    if (!guestMode || !guestExpiresAt) return;
    const remaining = Date.parse(guestExpiresAt) - Date.now();
    if (!Number.isFinite(remaining)) return;
    const timer = setTimeout(() => setGuestPlanningExpired(true), Math.max(0, Math.min(remaining, 2147483647)));
    return () => clearTimeout(timer);
  }, [guestMode, guestExpiresAt]);
  const [draftSaveState, setDraftSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [draftError, setDraftError] = useState("");
  const [savedSnapshotJson, setSavedSnapshotJson] = useState("");
  const [adoptionAwaitingSignIn, setAdoptionAwaitingSignIn] = useState(false);
  const [guestRestoreBlocked, setGuestRestoreBlocked] = useState(false);
  const guestRestoreBlockedRef = useRef(false);
  useEffect(() => { guestRestoreBlockedRef.current = guestRestoreBlocked; }, [guestRestoreBlocked]);
  const [adoptionPurpose, setAdoptionPurpose] = useState<"plan" | "files" | null>(null);
  const [resumeAdoption, setResumeAdoption] = useState<"plan" | "files" | null>(null);
  const [adopting, setAdopting] = useState(false);
  const [adoptionNeedsReview, setAdoptionNeedsReview] = useState("");
  const adoptionLock = useRef(false);
  const resumedAdoption = useRef<string | null>(null);
  const viewMounted = useRef(true);
  useEffect(() => { viewMounted.current = true; return () => { viewMounted.current = false; }; }, []);
  const [items, setItems] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, IntakeAnswer>>({});
  const [otherOpen, setOtherOpen] = useState<Record<number, boolean>>({});
  // Streaming reads accumulate: finished thinkings stay on screen in order
  // and the next streams in below — nothing is ever wiped for the next line.
  const [thinking, setThinking] = useState<{ history: string[]; shown: string } | null>(null);
  // The batch whose answers just landed: thinking streams first, then the UI
  // waits on Next (see advanceBatch). Nothing auto-advances.
  const [sourcesBusy, setSourcesBusy] = useState(false);
  const [pendingBatch, setPendingBatch] = useState<null | { answers: { seq: number; answer: IntakeAnswer }[]; res: any }>(null);
  // True while the answers are still flying: the loading screen shows
  // instantly on click (optimistic), the stream lands into it when it arrives.
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [depth, setDepth] = useState("standard");
  const [searchEnabled, setSearchEnabled] = useState(false);
  const [liveWeb, setLiveWeb] = useState(!privateBuildEnabled());
  const [tipCreators, setTipCreators] = useState(false);
  const [formats, setFormats] = useState<string[]>(["pdf"]);
  const [budgetCap, setBudgetCap] = useState(2.5);
  const [length, setLength] = useState("standard");
  const [lengthWords, setLengthWords] = useState(4000);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [planSource, setPlanSource] = useState<string | null>(null);
  // Editable plan steps (review screen): fetched on landing, PATCHed back
  // with live repricing. Research consensus: approving a visible, editable
  // plan beats approving blind.
  const [subQuestions, setSubQuestions] = useState<string[]>([]);
  const [editingSq, setEditingSq] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  // Echo of the sent topic, shown on the creating screen as the confirmation.
  const [topicEcho, setTopicEcho] = useState("");
  // Onchain escrow funds every run where the deployment supports it: the
  // deposit is verified before approve, stages draw from it, and the
  // remainder returns automatically at settle. No opt-in — money is the gate.
  const [escrowConfigured, setEscrowConfigured] = useState<boolean | null>(null);
  const [escrowFunded, setEscrowFunded] = useState(false);
  // Poll health, separate from support: one failed status read must never
  // unmount the funding UI mid-signing (seen live on testnet: the fund box
  // vanished and approve silently unlocked on a single status blip).
  const [escrowStale, setEscrowStale] = useState(false);
  const [escrowCheckFailed, setEscrowCheckFailed] = useState(false);
  const configuredRef = useRef<boolean | null>(null);
  function applyConfigured(v: boolean | null) {
    configuredRef.current = v;
    setEscrowConfigured(v);
  }
  // What actually landed onchain (may be below the cap — partial deposits).
  // The approve copy must name this number, never the cap.
  const [escrowBudget, setEscrowBudget] = useState(0);
  const stopRef = useRef<null | (() => void)>(null);

  // The open batch: every unanswered question, in order. Answered batches
  // render collapsed above it.
  const openBatch = items.filter((it) => !it.answer);
  const headingPhase = phase === "questions" ? `${phase}:${thinking ? "thinking" : openBatch[0]?.seq ?? "done"}` : phase;
  useEffect(() => {
    if (previousPhase.current === headingPhase) return;
    const target = researchView.current?.querySelector<HTMLElement>("[data-phase-heading], section h2");
    if (target) { previousPhase.current = headingPhase; target.tabIndex = -1; target.focus(); }
  }, [headingPhase]);
  const batchProgress = openBatch.filter((it) => {
    const d = drafts[it.seq] || { optionIds: [], text: "" };
    return hasAnswer(cleanAnswer(d, it.question, !!otherOpen[it.seq]));
  }).length;

  // Resume a project that was left mid-flow. Intake stages restore inline
  // here; anything past intake lives on the run page, which carries the
  // escrow/approve/review state — landing on a blank composer instead
  // strands owners who left right before funding (seen live).
  //
  // ?project=<id> is the explicit door (Projects links here). Without it,
  // fall back to the last touched run in this browser: closing the tab
  // mid-intake and reopening Research must pick up the flow, not a blank
  // composer. Only live intake stages auto-restore; anything else goes to
  // its run page, and a dead id clears itself silently.
  // Remember the run this browser is mid-flow on, so closing the tab
  // mid-intake and reopening Research picks the flow back up. Cleared once
  // the run leaves the inline stages (approve pushes to the run page) or
  // the id proves dead.
  function rememberRun(id: string | null) {
    try {
      if (id) localStorage.setItem("drnib-last-run", id);
      else localStorage.removeItem("drnib-last-run");
    } catch { /* private mode — resume just won't persist */ }
  }

  function restoreConfiguration(run: any) {
    const brief = run.brief || {};
    setDepth(brief.depth || run.depth || "standard");
    setBudgetCap(Number(run.budgetCap) || 2.5);
    setLiveWeb(privateBuildEnabled()?brief.liveWeb===true:brief.liveWeb!==false);
    setPublicSearchBrief(brief.publicResearch?.brief??null);
    setSearchEnabled(brief.searchEnabled!==false&&brief.publicResearch?.approved===true);
    setTipCreators(brief.tipCreators === true);
    setFormats(Array.isArray(brief.formats) && brief.formats.length ? brief.formats : ["pdf"]);
    setLength(brief.length || "standard");
    setLengthWords(Number(brief.lengthWords) || 4000);
  }

  // Device-local drafts are encrypted by the guest client, including unsent
  // edits and the explicit sign-in return intent. Never store this in the URL.
  const guestSnapshot = { topic, phase, project, items, drafts, otherOpen, depth,
    liveWeb, searchEnabled, publicSearchBrief, tipCreators, formats, budgetCap,
    length, lengthWords, estimate, planSource, subQuestions, pendingBatch,
    thinking, pendingAdoption: adoptionPurpose };
  const guestSnapshotJson = JSON.stringify(guestSnapshot);
  useEffect(() => {
    if (!guestReady || (!guestMode && (!guestEnabled || project)) || (!topic && !project)) return;
    let activeSave = true;
    const timer = setTimeout(() => {
      setDraftSaveState("saving");
      void saveGuestComposerSnapshot(JSON.parse(guestSnapshotJson)).then(() => {
        if (viewMounted.current && activeSave) { setSavedSnapshotJson(guestSnapshotJson); setDraftSaveState("saved"); if (!guestRestoreBlockedRef.current) setDraftError(""); }
      }).catch(() => {
        if (viewMounted.current && activeSave) {
          setDraftSaveState("error");
          setDraftError(!project && !guestMode ? "This browser could not save the encrypted draft. Retry saving here, or sign in to use account storage. Keep this page open until your question is saved." : "This browser could not save the encrypted draft. Keep this page open; retry saving before signing in or continuing.");
        }
      });
    }, 250);
    return () => { activeSave = false; clearTimeout(timer); };
  }, [guestReady, guestMode, guestEnabled, guestSnapshotJson, topic, project, guestRestoreBlocked]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const capabilities = await guestPlanningCapabilities().catch(() => ({ enabled: false }));
      if (cancelled) return;
      setGuestEnabled(privateBuildEnabled() && capabilities.enabled);
      if ("limits" in capabilities) setGuestLimits(capabilities.limits);
      try {
        const saved = await restoreGuestComposerSnapshot();
        if (cancelled || !saved || new URLSearchParams(window.location.search).has("project")) return;
        const draft = saved.snapshot as typeof guestSnapshot;
        if (typeof draft.topic !== "string") return;
        composerEdited.current = true;
        setTopic(draft.topic);
        if (draft.drafts) setDrafts(draft.drafts);
        if (draft.otherOpen) setOtherOpen(draft.otherOpen);
        if (typeof draft.depth === "string") setDepth(draft.depth);
        if (typeof draft.liveWeb === "boolean") setLiveWeb(draft.liveWeb);
        if (typeof draft.searchEnabled === "boolean") setSearchEnabled(draft.searchEnabled);
        if (typeof draft.publicSearchBrief === "string" || draft.publicSearchBrief === null) setPublicSearchBrief(draft.publicSearchBrief);
        if (typeof draft.tipCreators === "boolean") setTipCreators(draft.tipCreators);
        if (Array.isArray(draft.formats)) setFormats(draft.formats);
        if (typeof draft.budgetCap === "number") setBudgetCap(draft.budgetCap);
        if (typeof draft.length === "string") setLength(draft.length);
        if (typeof draft.lengthWords === "number") setLengthWords(draft.lengthWords);
        setDraftSaveState("saved");
        const resumeRunId = saved.adoptedRunId ?? saved.runId;
        if (resumeRunId) {
          setGuestMode(isGuestProject(resumeRunId));
          try {
            const run = await drNibApi.getRun(resumeRunId) as RestoredResearchRun;
            if (cancelled) return;
            restoreGuestRun(run);
            // Unsubmitted answers/config remain local edits, not fabricated
            // server progress. A committed manifest remains authoritative.
            if (draft.pendingBatch && run.status !== "planned") {
              setPendingBatch(draft.pendingBatch); setThinking(draft.thinking); setStreamDone(true);
            }
            if (draft.pendingAdoption === "plan" || draft.pendingAdoption === "files") {
              setAdoptionPurpose(draft.pendingAdoption); setResumeAdoption(draft.pendingAdoption);
            }
          } catch (error) {
            if (cancelled) return;
            setGuestRestoreBlocked(true);
            const recovery = classifyGuestPlanningError(error);
            setGuestRestoreRetryable(recovery.retryRestore);
            setGuestRecoveryCanAdopt(!saved.adoptedRunId && ["expired", "sign-in"].includes(recovery.kind));
            if (["expired", "sign-in"].includes(recovery.kind)) setNeedsSignIn(true);
            if (saved.adoptedRunId && isResearchSignInRequired(error)) setNeedsSignIn(true);
            if (draft.project) { setProject(draft.project); setPhase(draft.phase === "creating" ? "composer" : draft.phase); }
            if (Array.isArray(draft.items)) setItems(draft.items);
            if (Array.isArray(draft.subQuestions)) setSubQuestions(draft.subQuestions);
            setEstimate(draft.estimate ?? null); setPlanSource(draft.planSource ?? null);
            setDraftError(recovery.message);
          }
        }
      } catch {
        if (!cancelled) { setDraftSaveState("error"); setDraftError("Encrypted draft storage is unavailable. Use a browser with local storage enabled before starting guest planning."); }
      } finally { if (!cancelled) setGuestReady(true); }
    })();
    return () => { cancelled = true; };
    // Restore only on entry. Subsequent wallet changes must not overwrite edits.
  }, []);

  function restoreGuestRun(run: RestoredResearchRun) {
    setProject(run);
    const loaded: Item[] = (run.decisions || []).filter((d) => d.kind === "question")
      .map((d) => ({ seq: d.seq, question: d.question, answer: d.answer || undefined }));
    if (!loaded.length && Array.isArray(run.questions)) loaded.push(...run.questions.map((q, i) => ({ seq: q.seq ?? i, question: q })));
    setItems(loaded);
    if (run.status === "planned") {
      setEstimate(Number.isFinite(Number(run.plan?.estimate)) ? Number(run.plan?.estimate) : null);
      setSubQuestions(Array.isArray(run.plan?.sub_questions) ? run.plan.sub_questions.map(String) : []);
      setPlanSource(typeof run.plan?.source === "string" ? run.plan.source : null);
      setPhase("review");
    } else setPhase(run.status === "intake-done" ? "configure" : loaded.length ? "questions" : "composer");
  }

  useEffect(() => {
    if (!guestReady || !resumeAdoption || !project || !guestMode) return;
    const purpose = resumeAdoption;
    const intent = `${project.id}:${purpose}`;
    if (resumedAdoption.current === intent) return;
    resumedAdoption.current = intent;
    void signInAndAdopt(purpose, true);
    // Only an explicitly persisted sign-in intent may resume on return.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guestReady, resumeAdoption, project, guestMode]);

  async function signInAndAdopt(purpose: "plan" | "files", returning = false) {
    if (!project || !guestMode || adoptionLock.current || busy || (guestRestoreBlocked && !guestRecoveryCanAdopt)) return;
    adoptionLock.current = true;
    setAdopting(true);
    setAdoptionPurpose(purpose);
    try {
      await saveGuestComposerSnapshot({ ...guestSnapshot, pendingAdoption: purpose });
      setDraftSaveState("saved");
      try { await checkResearchSession(); }
      catch (error) {
        if (!isResearchSignInRequired(error)) throw error;
        if (returning) { stick("Your plan is still on this device. Sign in to save it to your account and continue."); return; }
        setAdoptionAwaitingSignIn(true);
        const authenticated = await (connectedAddress ? signIn() : requestSignIn());
        setAdoptionAwaitingSignIn(false);
        if (!authenticated) {
          setAdoptionPurpose(null);
          await saveGuestComposerSnapshot({ ...guestSnapshot, pendingAdoption: null });
          stick("Sign-in cancelled. Your plan is still on this device. You can keep reviewing it or sign in again when ready.");
          return;
        }
        if (!viewMounted.current) return;
        await checkResearchSession();
      }
      const adopted = await adoptGuestProject(project.id);
      if (!viewMounted.current) return;
      setGuestMode(false); setAdoptionPurpose(null); setGuestRestoreBlocked(false);
      setNeedsSignIn(false); setDraftError("");
      rememberRun(adopted.id); restoreGuestRun(adopted);
      restoreConfiguration(adopted);
      if (purpose === "files") setPhase("configure");
      if (purpose === "plan" && adopted.status === "planned" && adopted.guestAdoptionValidation?.ready !== true) {
        setAdoptionNeedsReview(adopted.guestAdoptionValidation?.reason || "The saved plan needs a fresh review before funding.");
        applyConfigured(null); setPhase("configure");
        stick("Saved to your account. Review the inputs and explicitly replan before funding. No research or payment was started.");
        return;
      }
      setAdoptionNeedsReview("");
      // Read-only status only. Never prepare/fund escrow or approve a run here.
      if (purpose === "plan" && adopted.status === "planned") await loadEscrow(adopted.id);
      stick("Saved to your account. Continue reviewing your project; funding and starting research remain separate choices.");
    } catch (error) {
      if (viewMounted.current) stick(error instanceof Error ? error.message : "Could not save the guest plan. Your encrypted draft has been retained; retry without starting a duplicate.");
    } finally {
      adoptionLock.current = false;
      if (viewMounted.current) { setAdopting(false); setAdoptionAwaitingSignIn(false); }
    }
  }

  useEffect(() => {
    if (!guestReady || guestMode) return;
    let cancelled = false;
    const explicit = new URLSearchParams(window.location.search).get("project");
    const id = explicit || (() => {
      try { return localStorage.getItem("drnib-last-run") || ""; } catch { return ""; }
    })();
    if (!id) return;
    (async () => {
      try {
        const run: any = await drNibApi.getRun(id);
        if (cancelled || composerEdited.current || submission.current.running) return;
        if (!["draft", "intake"].includes(run.status)) {
          if (run.status === "intake-done") {
            // Restore the inline pre-plan flow: answers, config, escrow.
            const loaded: Item[] = (run.decisions || [])
              .filter((d: any) => d.kind === "question")
              .map((d: any) => ({ seq: d.seq, question: d.question, answer: d.answer || undefined }));
            setProject(run);
            setTopic(run.brief?.topic || "");
            restoreConfiguration(run);
            setItems(loaded);
            const firstUnanswered = loaded.findIndex((it) => !it.answer);
            setIdx(firstUnanswered === -1 ? Math.max(0, loaded.length - 1) : firstUnanswered);
            setPhase("configure");
            void loadEscrow(run.id);
            return;
          }
          if (explicit && run.status === "planned") {
            // Reopen the existing review, including its editable steps and
            // funding gate, without paying for another planning call.
            setProject(run);
            setTopic(run.brief?.topic || "");
            restoreConfiguration(run);
            setEstimate(Number(run.plan?.estimate ?? 0.2));
            setSubQuestions(Array.isArray(run.plan?.sub_questions) ? run.plan.sub_questions.map(String) : []);
            setPlanSource(typeof run.plan?.source === "string" ? run.plan.source : null);
            setPhase("review");
            void loadEscrow(run.id);
            return;
          }
          // Past the inline stages: the explicit door follows to the run
          // page, but an implicit revisit stays on the composer — yanking
          // every fresh visit into an old running run is worse than a
          // blank box. Terminal/deleted states clear the memory.
          if (explicit) { router.replace(`/dr-nib/research/${id}`); return; }
          if (["complete", "failed", "ended"].includes(run.status)) rememberRun(null);
          return;
        }
        const loaded: Item[] = (run.decisions || [])
          .filter((d: any) => d.kind === "question")
          .map((d: any) => ({ seq: d.seq, question: d.question, answer: d.answer || undefined }));
        setProject(run);
        setTopic(run.brief?.topic || "");
        setItems(loaded);
        const firstUnanswered = loaded.findIndex((it) => !it.answer);
        setIdx(firstUnanswered === -1 ? Math.max(0, loaded.length - 1) : firstUnanswered);
        setPhase(loaded.length ? "questions" : "composer");
        rememberRun(run.id);
      } catch (error) {
        if (cancelled || composerEdited.current || submission.current.running) return;
        // Authentication/startup failures must retain the resume pointer.
        // Only a definitive missing project permits forgetting it.
        if (!explicit && (error as {status?:number})?.status === 404) rememberRun(null);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connectedAddress, guestReady, guestMode]);

  // Notices from fail() are errors: they persist until dismissed or the next
  // action clears them. A 3-second flash is fine for hints ("type first"),
  // but an error that vanishes leaves users staring at a dead screen with
  // no idea what happened — seen live on flaky composer submits.
  const [noticeSticky, setNoticeSticky] = useState(false);
  function flash(msg: string) {
    setNoticeSticky(false);
    setNotice(msg);
    setTimeout(() => {
      setNoticeSticky((sticky) => {
        if (!sticky) setNotice("");
        return sticky;
      });
    }, 3000);
  }
  function stick(msg: string) {
    setNoticeSticky(true);
    setNotice(msg);
  }

  // One place for failed calls: a 401 means there is no hub session for this
  // call. Never auto-fire connect() here — that is what caused the sign-again
  // loop (sign in succeeds, the next call 401s on transport, fail() signs
  // again, forever). Show the prompt with an explicit button instead.
  const [needsSignIn, setNeedsSignIn] = useState(false);
  function fail(e: any, label: string) {
    if (isResearchSignInRequired(e)) {
      setNeedsSignIn(true);
      stick("Sign in with Google or a wallet to save your private project and continue. Your question is still here.");
      return;
    }
    if (e?.code === "rate-limited") {
      // Back off, don't hammer: the limit lifts on its own.
      stick("Too many tries just now — wait a moment, then retry.");
      return;
    }
    if (e?.code === "unavailable") {
      // Outage, not logged-out: retrying is the fix, signing in changes nothing.
      stick("Dr. Nib couldn't reach accounts just now — retry in a moment.");
      return;
    }
    stick((guestMode || (e?.privateRunId && isGuestProject(e.privateRunId))) ? `This planning step could not finish. ${e?.message || "Try again when the service is available."} Your saved draft has not been replaced.` : `${label} (${e?.message || e}).`);
  }

  async function checkResearchSession() {
    if (privateBuildEnabled()) return privateTenantId();
    const response = await fetch('/auth/me', { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (response.status === 401) throw Object.assign(new Error('Sign in required.'), { status: 401 });
    if (!response.ok) throw new Error('The sign-in check is unavailable. Try again in a moment.');
    const session = await response.json();
    if (!session.authenticated) throw Object.assign(new Error('Sign in required.'), { status: 401 });
  }

  async function send(explicitSignIn = false) {
    if (availability !== "ready" || !guestReady || guestRestoreBlocked || ((guestEnabled || guestMode) && draftSaveState === "error" && !(explicitSignIn && !guestMode && !project)) || submission.current.running || busy || signInBusy) return;
    const t = topic.trim();
    if (!t) return flash("Type a question first — even one line.");
    composerEdited.current = true;
    setSubmissionBusy(true);
    let startGuest = guestMode && Boolean(project?.id && isGuestProject(project.id));
    await submission.current.run({
      checkSession: async () => {
        if (startGuest) { await saveGuestComposerSnapshot(guestSnapshot); return; }
        try { await checkResearchSession(); }
        catch (error) {
          if (guestEnabled && !explicitSignIn && isResearchSignInRequired(error)) {
            await saveGuestComposerSnapshot(guestSnapshot);
            startGuest = true;
            return;
          }
          throw error;
        }
      },
      authenticate: () => explicitSignIn && connectedAddress ? signIn() : requestSignIn(),
      onAuthRequired: () => {
        setNeedsSignIn(true);
        stick("Sign in with Google or a wallet to save your private project and continue. Your question is still here.");
      },
      onSubmitting: () => {
        setTopicEcho(t);
        setPhase("creating");
        setNotice("");
        setNeedsSignIn(false);
      },
      submit: async () => {
        const retryIntake=privateBuildEnabled()&&project?.id&&['draft','intake'].includes(project.status)&&!items.length&&project.brief?.topic===t;
        return retryIntake?await (await import('@/lib/dr-nib-private-actions')).privateAction(project.id,'intake'):startGuest?await beginGuestPlanning(t):await drNibApi.createProject(t);
      },
      onSuccess: (run: any) => {
        setGuestMode(isGuestProject(run.id));
        setNeedsSignIn(false);
        setProject(run);
        if (!isGuestProject(run.id)) { rememberRun(run?.id || null); setDraftError(""); setDraftSaveState("idle"); }
        const first = Array.isArray(run.questions) && run.questions.length
          ? run.questions
          : run.question ? [{ ...run.question, seq: 0 }] : [];
        if (!first.length) {
          if(privateBuildEnabled()&&run.status==='intake-done'){
            setItems([]);
            setPhase('configure');
            return;
          }
          // A run with no questions is a dead questions screen (blank, no
          // recovery). Send the user back with the reason on screen.
          setPhase("composer");
          stick("Dr. Nib started without questions — retry in a moment.");
          return;
        }
        setItems(first.map((q: any, i: number) => ({ seq: typeof q.seq === "number" ? q.seq : i, question: q })));
        setDrafts({});
        setOtherOpen({});
        setPhase("questions");
      },
      onError: (e: any) => {
        // Back to composer on failure — the thinking screen must never strand.
        if(privateBuildEnabled()&&typeof e?.privateRunId==='string'){
          const guest = isGuestProject(e.privateRunId);
          setGuestMode(guest);
          if (!guest) rememberRun(e.privateRunId);
          setProject({id:e.privateRunId,status:'intake',brief:{topic:t}});
        }
        setPhase("composer");
        fail(e, "Could not reach Dr. Nib");
      },
    });
    setSubmissionBusy(false);
    topicInput.current?.focus();
  }

  function streamThinking(text: string, history: string[]) {
    return new Promise<void>((resolve) => {
      const full = String(text || "");
      let i = 0;
      setThinking({ history, shown: "" });
      setStreamDone(false);
      const stepChars = Math.max(1, Math.round(full.length / 110));
      const timer = setInterval(() => {
        i += stepChars;
        const slice = full.slice(0, i);
        setThinking({ history, shown: slice });
        if (i >= full.length) {
          clearInterval(timer);
          stopRef.current = null;
          setStreamDone(true);
          resolve();
        }
      }, 20);
      // Stop means "I've read enough" — land the full text and wait on Next,
      // never skip ahead silently.
      stopRef.current = () => {
        clearInterval(timer);
        stopRef.current = null;
        setThinking({ history, shown: full });
        setStreamDone(true);
        resolve();
      };
    });
  }

  // The answer landed and the thinking streamed: now WAIT. Nothing advances
  // until the user presses Next — auto-advance stole the reading moment.
  // (Batch version below; single-question state kept for resume compat.)
  const [streamDone, setStreamDone] = useState(false);

  // Stream several thinkings back to back, each appended below the last —
  // the screen is a growing list, never a wipe.
  async function streamThinkings(texts: string[]) {
    const done: string[] = [];
    for (const text of texts) {
      await streamThinking(text, [...done]);
      done.push(text);
    }
    setThinking({ history: done, shown: "" });
  }

  // Rebuild items from the server transcript — the self-heal for a 409
  // (double-submit, stale tab): whatever is saved wins, drafts for answered
  // questions are dropped, and the UI shows the true state.
  async function reloadItems() {
    if (!project) return;
    try {
      const run: any = await drNibApi.getRun(project.id);
      const loaded: Item[] = (run.decisions || [])
        .filter((d: any) => d.kind === "question")
        .map((d: any) => ({ seq: d.seq, question: d.question, answer: d.answer || undefined, thinking: undefined }));
      setItems(loaded);
      setDrafts((prev) => {
        const next: Record<number, IntakeAnswer> = {};
        for (const it of loaded) {
          if (!it.answer && prev[it.seq]) next[it.seq] = prev[it.seq];
        }
        return next;
      });
      if (run.status === "intake-done") setPhase("configure");
    } catch { /* keep local state on failure */ }
  }

  // Submit the whole open batch at once: instant pending state (the button
  // answers immediately), then the thinkings stream, then the UI waits on
  // Next. One round trip per batch instead of per question.
  async function submitBatch() {
    if (!project || openBatch.length === 0 || guestRestoreBlocked || adopting) return;
    const answers: { seq: number; answer: IntakeAnswer }[] = [];
    for (const it of openBatch) {
      const ans = cleanAnswer(drafts[it.seq] || { optionIds: [], text: "" }, it.question, !!otherOpen[it.seq]);
      if (!hasAnswer(ans)) return flash(`Answer "${it.question.prompt.slice(0, 60)}…" first — or press Just plan it.`);
      answers.push({ seq: it.seq, answer: ans });
    }
    setBusy(true);
    setNotice("");
    // Optimistic: move to the loading screen on click, not on response. The
    // AI streams into this same screen when it lands, then waits on Next.
    setThinking({ history: [], shown: "" });
    setStreamDone(false);
    setLoadingAnswer(true);
    try {
      if (guestMode) await saveGuestComposerSnapshot(guestSnapshot);
      const res: any = await drNibApi.answerBatch(project.id, answers);
      setPendingBatch({ answers, res });
      setLoadingAnswer(false);
      const texts: string[] = (res.thinkings || []).map((t: any) => t.thinking).filter(Boolean);
      await streamThinkings(texts.length ? texts : ["Noted."]);
    } catch (e: any) {
      setThinking(null);
      setPendingBatch(null);
      setLoadingAnswer(false);
      if ((e as any)?.status === 409) {
        // Saved already (double tap, retry after a timeout): reload the
        // transcript instead of erroring.
        await reloadItems();
        flash("Already saved — refreshed to the latest.");
      } else {
        fail(e, "Answers failed");
      }
    } finally {
      setBusy(false);
    }
  }

  function advanceBatch() {
    const p = pendingBatch;
    if (!p?.res) return;
    setPendingBatch(null);
    setThinking(null);
    setStreamDone(false);
    const bySeq = new Map(p.answers.map((a) => [a.seq, a.answer]));
    const thinkBySeq = new Map<string | number, string>();
    for (const t of p.res.thinkings || []) {
      if (typeof t?.thinking === "string") thinkBySeq.set(t.seq, t.thinking);
    }
    setItems((prev) => {
      const next = prev.map((it) => bySeq.has(it.seq)
        ? { ...it, answer: bySeq.get(it.seq), thinking: thinkBySeq.get(it.seq) }
        : it);
      for (const q of p.res.next || []) {
        if (typeof q.seq === "number" && !next.some((it) => it.seq === q.seq)) {
          next.push({ seq: q.seq, question: q });
        }
      }
      return next;
    });
    if (p.res.project) setProject((prev: any) => ({ ...prev, ...p.res.project }));
    if (p.res.done) setPhase("configure");
  }

  // "Just plan it" — skip the rest of intake. The brief goes to planning
  // as-is; unanswered questions stay unanswered, nothing is fabricated.
  async function justPlanIt() {
    if (!project || guestRestoreBlocked || adopting) return;
    setBusy(true);
    try {
      if (guestMode) await saveGuestComposerSnapshot(guestSnapshot);
      await drNibApi.finishIntake(project.id);
      setPhase("configure");
    } catch (e: any) {
      fail(e, "Could not skip intake");
    } finally {
      setBusy(false);
    }
  }

  function goComposer() {
    setPhase("composer");
  }

  // Escrow funding state for the review gate: configured means this
  // deployment verifies deposits onchain and approve stays locked until the
  // job reads Funded. The job opens from the user's own Fund click (their
  // wallet must be the onchain client), never implicitly from a read.
  // Polls while review is open: funding can land from another tab/wallet.
  // A failed read NEVER flips support off: while supported the UI stays up
  // and is marked stale; before support is ever confirmed the failure is
  // shown with a retry instead of silently ledger-pathing the run.
  useEffect(() => {
    if (phase !== "review" || escrowConfigured !== true || escrowFunded || !project) return;
    const t = setInterval(() => { void loadEscrow(project.id); }, 5000);
    return () => clearInterval(t);
  }, [phase, escrowConfigured, escrowFunded, project]);
  async function loadEscrow(runId: string) {
    if (isGuestProject(runId)) { applyConfigured(null); return; }
    try {
      // Read-only: the job opens from the user's own Fund click (their
      // wallet must be the onchain client), never implicitly from a read.
      const st: any = await drNibApi.getEscrow(runId);
      applyConfigured(st?.configured === true);
      // Funded means spendable: status Funded AND at least the plan estimate
      // onchain (approve enforces the same minimum — deposits are one-shot).
      const need = Number.isFinite(Number(estimate)) && Number(estimate) > 0 ? Number(estimate) : Number(budgetCap || 0);
      const budget = Number(st?.job?.chain?.budget ?? 0);
      const funded = st?.job?.chain?.status === "Funded" && budget >= need;
      setEscrowFunded(funded);
      setEscrowBudget(funded ? budget : 0);
      setEscrowStale(false);
      setEscrowCheckFailed(false);
    } catch {
      if (configuredRef.current === true) setEscrowStale(true);
      else setEscrowCheckFailed(true);
    }
  }

  async function savePlan(next: string[]) {
    if (!project || guestRestoreBlocked || adopting) return;
    setBusy(true);
    try {
      if (guestMode) await saveGuestComposerSnapshot(guestSnapshot);
      const res: any = await drNibApi.editPlan(project.id, next);
      setSubQuestions(Array.isArray(res?.plan?.sub_questions) ? res.plan.sub_questions.map(String) : next);
      if (Number.isFinite(Number(res?.plan?.estimate))) setEstimate(Number(res.plan.estimate));
      setPlanSource(typeof res?.plan?.source === "string" ? res.plan.source : null);
      setEditingSq(null);
    } catch (e: any) {
      fail(e, "Plan edit failed");
    } finally {
      setBusy(false);
    }
  }

  async function plan() {
    if (!project || guestRestoreBlocked || adopting) return;
    // Confidential runs never touch the ordinary plan/budget path: no server
    // planning call, no ledger deposit, no escrow. Planning and writing happen
    // inside the verified worker. Go straight to the review hand-off.
    if (confidential) { setPhase("review"); return; }
    setBusy(true);
    setNotice("");
    try {
      if(privateBuildEnabled()&&liveWeb&&searchEnabled&&(publicSearchBrief??'').trim().length<3)throw Error('Enter the search terms you want to send to web search.');
      if (guestMode) await saveGuestComposerSnapshot(guestSnapshot);
      await drNibApi.configureRun(project.id, {
        depth, budgetCap, formats,
        liveWeb: confidential ? false : liveWeb,
        ...(privateBuildEnabled()?{searchEnabled:liveWeb&&searchEnabled}:{}),
        ...(privateBuildEnabled()&&liveWeb&&searchEnabled?{publicResearch:{approved:true as const,brief:(publicSearchBrief??'').trim()}}:{}),
        tipCreators,
        length, ...(length === "custom" ? { lengthWords } : {}),
      });
      // Planning is an LLM call away — replans especially can take a minute.
      // Never leave the user on a dead configure screen: either land review
      // or say so out loud. Exponential backoff (2s→30s): the plan takes a
      // minute and 90 flat-2s polls hammered the API for nothing.
      let landed = false;
      let waitMs = 2000;
      for (let i = 0; i < 12; i++) {
        await new Promise((r) => setTimeout(r, waitMs));
        waitMs = Math.min(30000, waitMs * 1.5);
        const full: any = await drNibApi.getRun(project.id);
        if (full.status === "planned" || full.status === "running" || full.status === "complete") {
          setProject(full);
          setEstimate(Number.isFinite(Number(full.plan?.estimate)) ? Number(full.plan.estimate) : null);
          setSubQuestions(Array.isArray(full.plan?.sub_questions) ? full.plan.sub_questions.map(String) : []);
          setPlanSource(typeof full.plan?.source === "string" ? full.plan.source : null);
          setPhase("review");
          setAdoptionNeedsReview("");
          landed = true;
          await loadEscrow(project.id);
          break;
        }
      }
      if (!landed) fail(new Error("still planning"), "Planning is taking longer than expected — the run may still land. Check Projects in a minute.");
    } catch (e: any) {
      fail(e, "Planning failed");
    } finally {
      setBusy(false);
    }
  }

  async function approve() {
    if (!project || guestMode || isGuestProject(project.id) || guestRestoreBlocked || adopting || adoptionNeedsReview) return;
    // Confidential path: never call the ordinary research endpoint with the
    // source. Hand off to the run page, which runs the verified worker and
    // decrypts the report in the tab.
    if (confidential) {
      rememberRun(null);
      router.push(`/dr-nib/research/${project.id}`);
      return;
    }
    setBusy(true);
    try {
      await drNibApi.approveRun(project.id);
      // The run page owns it from here — forget the inline resume so fresh
      // visits open a clean composer.
      rememberRun(null);
      router.push(`/dr-nib/research/${project.id}`);
    } catch (e: any) {
      fail(e, "Approve failed");
    } finally {
      setBusy(false);
    }
  }

  function renderOptions(q: IntakeQuestion, seq: number) {
    const draft = drafts[seq] || { optionIds: [], text: "" };
    const other = !!otherOpen[seq];
    const setD = (ans: IntakeAnswer) => setDrafts((p) => ({ ...p, [seq]: ans }));
    const setO = (v: boolean) => setOtherOpen((p) => ({ ...p, [seq]: v }));
    if (q.type === "free") {
      return (
        <textarea
          aria-label={q.prompt}
          value={draft.text || ""}
          onChange={(e) => setD({ optionIds: [], text: e.target.value })}
          rows={3}
          placeholder="Type your answer"
          className="mt-4 w-full resize-none border border-dark-gray/50 bg-white rounded-2xl px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
        />
      );
    }

    const pick = (o: IntakeOption) => {
      if (q.type === "pick_one") { setD({ optionIds: [o.id], text: "" }); setO(false); }
      else {
        const ids = draft.optionIds || [];
        setD({ ...draft, optionIds: ids.includes(o.id) ? ids.filter((x) => x !== o.id) : [...ids, o.id] });
      }
    };

    return (
      <fieldset className="mt-4 min-w-0" aria-label={q.prompt}>
        <legend className="mb-2 text-[11px] font-medium uppercase tracking-wider opacity-50">
          {q.type === "pick_one" ? "Select one" : "Select all that apply"}
        </legend>
        <div className="space-y-2">
          {q.options.map((o) => {
            const on = (q.type !== "pick_one" || !other) && (draft.optionIds || []).includes(o.id);
            return (
              <label key={o.id}
                className={`flex w-full cursor-pointer items-center gap-3 border px-4 py-3 text-left text-sm transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-black ${on ? "border-black bg-black text-white" : "border-dark-gray/50 bg-white hover:border-black/50"}`}>
                <input type={q.type === "pick_one" ? "radio" : "checkbox"}
                  name={`drnib-answer-${seq}`} value={o.id} checked={on}
                  onChange={() => pick(o)} className="h-4 w-4 shrink-0 accent-black" />
                {o.label}
              </label>
            );
          })}
          {q.allowOther && (
            <>
              <label
                className={`flex w-full cursor-pointer items-center gap-3 border px-4 py-3 text-left text-sm transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-black ${other ? "border-black bg-black text-white" : "border-dark-gray/50 bg-white hover:border-black/50"}`}>
                <input type={q.type === "pick_one" ? "radio" : "checkbox"}
                  name={`drnib-answer-${seq}`} value="other" checked={other}
                  onChange={() => {
                    if (q.type === "pick_one") { setO(true); setD({ optionIds: [], text: draft.text || "" }); }
                    else setO(!other);
                  }} className="h-4 w-4 shrink-0 accent-black" />
                Another answer…
              </label>
              {other && (
                <input
                  aria-label={`Another answer: ${q.prompt}`}
                  value={draft.text || ""}
                  onChange={(e) => setD({ ...draft, text: e.target.value })}
                  placeholder="Type your answer"
                  className="w-full border border-dark-gray/50 bg-white rounded-xl px-3 py-2.5 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-black"
                />
              )}
            </>
          )}
        </div>
      </fieldset>
    );
  }

  if (phase === "composer" && availability === "preview") return (
    <section className="mx-auto max-w-xl py-16 text-center">
      <p className="text-xs font-medium uppercase tracking-wider opacity-60">Dr. Nib · preview</p>
      <h1 className="mt-4 text-3xl font-medium">Try research on testnet</h1>
      <p className="mt-4 text-sm leading-7 opacity-70">Research is available with test USDC while mainnet funding is being prepared. Ask a question, review the plan, and try the complete report and refund flow with play money.</p>
      <a href="https://testnet.nibgate.xyz/dr-nib/research" className="mt-6 inline-block rounded-xl bg-black px-6 py-3 text-sm font-medium text-white">Open the testnet preview</a>
      <p className="mt-4 text-xs opacity-60">Your existing mainnet projects remain in <Link href="/dr-nib/projects" className="underline">Projects</Link>.</p>
    </section>
  );
  if (phase === "composer" && availability === "unavailable") return (
    <section className="mx-auto max-w-xl py-16 text-center">
      <h1 className="text-2xl font-medium">Research is temporarily unavailable</h1>
      <p className="mt-3 text-sm opacity-70">{privateBuildEnabled()?(availabilityReason==='private-setup-paused'?'Private research is paused while the worker setup is being verified. Your wallet sign-in and saved projects are unchanged.':availabilityReason==='private-worker-paused'?'Private research is paused to keep this owner test within its infrastructure limit. Wallet sign-in and encrypted saved projects remain available.':availabilityReason==='private-release-unreviewed'?'The private worker needs a reviewed release before it can receive project keys. Your saved projects are unchanged.':'The local private service could not be reached. Your wallet sign-in and saved projects are unchanged.'):'We could not check the research service. Your saved projects are unchanged.'}</p>
      <button className="mt-5 rounded-xl border border-current px-5 py-2 text-sm" onClick={() => { setAvailability("checking"); setAvailabilityAttempt(value => value + 1); }}>Try again</button>
    </section>
  );
  return (
    <div ref={researchView}>
      {!guestReady && <p role="status">Checking saved drafts…</p>}
      {(guestMode || guestEnabled && phase === "composer") && <div className="mb-4 text-sm" aria-live="polite">
        <p>{guestMode ? "Guest planning — not yet saved to your account." : "Try text-only planning without signing in."}</p>
        <p className="mt-1 text-xs">The same verified Phala worker prepares your questions and plan. No web retrieval, private uploads, wallet payment or research execution happens in guest mode.</p>
        <p className="mt-1 text-xs">{draftSaveState === "error" ? "Draft not saved — keep this page open and retry below." : draftSaveState === "saved" && savedSnapshotJson === guestSnapshotJson ? "Encrypted draft saved on this device." : (topic || project) ? "Saving encrypted draft…" : "Drafts stay in this browser. Clearing browser data or changing devices can lose access."}</p>
      </div>}
      {guestMode && guestExpiresAt && <p className="mb-4 text-sm" role="status">{guestPlanningExpired ? "Guest planning has ended" : "Guest planning ends "}{!guestPlanningExpired && <time dateTime={guestExpiresAt}>{new Date(guestExpiresAt).toLocaleString()}</time>}{". "}{guestPlanningExpired ? "Sign in to save the retained draft and continue in your account. No new planning runs automatically." : "After that, sign in to save and continue. This is not a browser-draft deletion deadline."}</p>}
      {guestMode && guestPlanningExpired && phase !== "review" && <button disabled={adopting || busy} onClick={() => { void signInAndAdopt("plan"); }} className="mb-4 min-h-11 border border-black px-4 py-2 text-sm focus-visible:outline-2">Sign in to save this draft</button>}
      {adoptionNeedsReview && <p role="alert" className="mb-4 border border-dark-gray/50 p-3 text-sm">{adoptionNeedsReview} Review the configuration, then choose Plan run. No automatic replan or payment was started.</p>}
      {draftError && <div role="alert" className="mb-4 border border-dark-gray/50 bg-white p-3 text-sm"><p>{draftError}</p><button onClick={async () => {
        try { await saveGuestComposerSnapshot(guestSnapshot); setSavedSnapshotJson(guestSnapshotJson); setDraftSaveState("saved"); if (!guestRestoreBlockedRef.current) setDraftError(""); }
        catch { setDraftSaveState("error"); }
      }} className="mt-2 min-h-11 underline focus-visible:outline-2">Retry saving draft</button>{!project && !guestMode && !guestRestoreBlocked && <button disabled={signInBusy || submissionBusy || busy || !topic.trim()} onClick={() => { void send(true); }} className="ml-4 min-h-11 underline focus-visible:outline-2 disabled:opacity-50">Sign in and use account storage</button>}{guestRestoreBlocked && guestRestoreRetryable && <button onClick={() => window.location.reload()} className="ml-4 min-h-11 underline focus-visible:outline-2">Reconnect saved draft</button>}</div>}
      {notice && <div role="alert" className="mb-4 flex items-start justify-between gap-3 border border-dark-gray/50 bg-white px-4 py-2 text-sm"><span>{notice}{guestMode && phase === "composer" && project && !needsSignIn && <button disabled={busy || submissionBusy || guestRestoreBlocked || draftSaveState === "error"} onClick={() => { void send(); }} className="mt-2 block min-h-11 underline focus-visible:outline-2 disabled:opacity-50">Retry questions</button>}{/live run/i.test(notice) && (<> — <button onClick={() => router.push("/dr-nib/projects")} className="underline">review them in Projects</button></>)}</span><button onClick={() => { setNotice(""); setNoticeSticky(false); }} aria-label="Dismiss" className="min-h-11 min-w-11 shrink-0 opacity-60 hover:opacity-100 focus-visible:outline-2">✕</button></div>}
      {needsSignIn && (
        <div className="mb-4">
          <button disabled={signInBusy || submissionBusy || adopting} onClick={async () => {
            if (guestRestoreBlocked && !guestMode) {
              const authenticated = await (connectedAddress ? signIn() : requestSignIn());
              if (authenticated) window.location.reload();
              return;
            }
            if (guestMode) { await signInAndAdopt("plan"); return; }
            if (phase === "composer") { await send(true); return; }
            const authenticated = await (connectedAddress ? signIn() : requestSignIn());
            if (authenticated) { setNeedsSignIn(false); stick("Signed in. Retry your last action to continue."); }
          }} className="border border-black bg-black px-4 py-2 text-sm font-medium text-white disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2">
            {signInBusy || submissionBusy || adoptionAwaitingSignIn ? "Waiting for sign-in…" : adopting ? "Saving your draft…" : "Sign in to continue"}
          </button>
          {signInError && <p role="status" className="text-sm text-red-700">{signInError}</p>}
        </div>
      )}

      {project && phase !== "composer" && (
        <div className="mx-auto mb-4 max-w-2xl border-b border-dark-gray/30 pb-3 text-left">
          <p className="text-sm font-medium">{project.title}</p>
          {project.description && <p className="text-xs opacity-60">{project.description}</p>}
        </div>
      )}

      {phase === "composer" && (
        <section className="mx-auto max-w-2xl py-8 text-center md:py-12">
          <h2 className="nibgate-display-title text-3xl font-medium md:text-4xl">What should Dr. Nib research?</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm opacity-60">{guestEnabled ? `Ask a question and build a research plan before signing in. Your draft is encrypted on this device.${guestLimits?.ttlMs ? ` Guest planning lasts up to ${Math.round(guestLimits.ttlMs / 60000)} minutes.` : " Guest planning has usage and expiry limits."}${guestLimits?.maxReplans ? ` Up to ${guestLimits.maxReplans} plans per session, subject to the usage limit.` : ""}` : privateBuildEnabled() ? privateFundingEnabled()?"Ask a question. After sign-in, your encrypted project is saved for later. Questions and planning are sponsored; research starts after you fund and approve the plan.":"Ask a question. After sign-in, your encrypted project is saved for later. Questions and planning use the owner test allowance; report writing starts after you approve the plan." : "Ask a question. After sign-in, a project is created so you can stop and pick it up later — nothing spends until you approve the plan."}</p>
          <p id="research-signin-help" className="mt-3 text-sm">{guestEnabled ? "Start with a question. Sign in only when you want to save the plan to your account or add private files. Funding and starting research are separate choices." : "Sign in with Google or a wallet to save a project. After sign-in, we’ll continue with the question you sent. Editing it cancels that pending submission."}</p>
          <div className="relative mt-6">
            <textarea ref={topicInput} aria-label="Research question" aria-describedby="research-signin-help" value={topic} onChange={(e) => editTopic(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={4} placeholder="e.g. Compare Arc vs Base for USDC micropayments, last 90 days"
              className="w-full resize-none border border-dark-gray/50 bg-white rounded-2xl px-4 py-3 pb-12 text-left text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2" />
            <button onClick={() => { void send(); }} disabled={busy || submissionBusy || signInBusy || !guestReady || guestRestoreBlocked || ((guestEnabled || guestMode) && draftSaveState === "error") || availability !== "ready"} aria-label="Send" className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center bg-black text-white disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} aria-hidden="true" />}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {SAMPLES.map((s) => (
              <button key={s} onClick={() => editTopic(s)} className="border border-dark-gray/50 bg-white px-3 py-1.5 text-left text-xs opacity-80 hover:opacity-100">{s.length > 52 ? s.slice(0, 52) + "…" : s}</button>
            ))}
          </div>
        </section>
      )}

      {phase === "creating" && (
        <section className="mx-auto flex max-w-2xl flex-col items-center py-10 text-center">
          <div className="w-full rounded-2xl border border-dark-gray/50 bg-white px-4 py-3 text-left">
            <p className="text-[11px] font-medium uppercase tracking-wider opacity-50">You asked</p>
            <p className="mt-1 text-[15px] font-medium leading-7">{topicEcho}</p>
          </div>
          <p role="status" data-phase-heading className="mt-8 text-sm font-medium">Preparing your questions…</p>
          <p className="mt-3 max-w-md text-sm">This can take a moment. No payment or research execution has started.</p>
        </section>
      )}

      {phase === "questions" && thinking && (
        <section className="mx-auto flex max-w-2xl flex-col items-center py-20 text-center">
          <h2 data-phase-heading className="mb-4 text-lg font-medium">Review your answers</h2>
          {(!streamDone || loadingAnswer) && <Loader2 className="mb-5 animate-spin opacity-70" size={28} />}
          {loadingAnswer && <p role="status" className="mb-5 text-sm font-medium">Sending answers…</p>}
          {!loadingAnswer && streamDone && <p className="mb-5 text-xs font-medium uppercase tracking-wider opacity-50">Noted — read it, then continue</p>}
          {!loadingAnswer && (
            <div className="w-full max-w-xl space-y-4 text-left">
              {thinking.history.map((h, n) => (
                <p key={n} className="border-l-2 border-black/40 pl-3 text-sm italic leading-6 opacity-80">{h}</p>
              ))}
              {(thinking.shown || !streamDone) && (
                <div>
                  <div className="drnib-shimmer-track mb-2 h-1 w-32 rounded-full" aria-hidden="true" />
                  <p className="min-h-[3rem] text-sm italic leading-6 opacity-80"><span className="drnib-stream-caret">{thinking.shown}</span></p>
                </div>
              )}
            </div>
          )}
          {streamDone ? (
            <button onClick={advanceBatch} className="mt-8 inline-flex items-center gap-2 bg-black px-6 py-2 text-sm font-medium text-white">
              Next <ArrowRight size={14} />
            </button>
          ) : (
            <button onClick={() => stopRef.current?.()} className="mt-8 inline-flex items-center gap-2 border border-dark-gray/60 px-4 py-2 text-sm font-medium hover:bg-black hover:text-white">
              <Square size={12} /> I&apos;ve read enough
            </button>
          )}
        </section>
      )}

      {phase === "questions" && !thinking && openBatch.length > 0 && (
        <section className="mx-auto max-w-2xl py-6">
          <div className="mb-1 flex items-baseline justify-between gap-2">
            <h2 data-phase-heading className="text-sm font-medium">
              Answer these · {batchProgress} of {openBatch.length} done
            </h2>
            <button onClick={justPlanIt} disabled={busy} className="shrink-0 text-xs font-medium uppercase tracking-wider opacity-60 underline hover:opacity-100">
              Just plan it →
            </button>
          </div>
          <div className="mb-5 h-1.5 w-full overflow-hidden rounded-full bg-black/10">
            <div className="h-full rounded-full bg-black transition-all" style={{ width: `${openBatch.length ? Math.round((batchProgress / openBatch.length) * 100) : 0}%` }} />
          </div>
          {items.filter((it) => it.answer).map((it) => (
            <div key={it.seq} className="mb-3 border border-dark-gray/40 bg-white px-4 py-3">
              <p className="text-sm font-medium leading-6">{it.question.prompt}</p>
              <p className="mt-1 text-xs opacity-60">✓ {answerLabel(it)}</p>
            </div>
          ))}
          {openBatch.map((it) => (
            <div key={it.seq} className="mb-4 border border-dark-gray/50 bg-white p-4 md:p-5">
              <p className="text-[15px] font-medium leading-7">{it.question.prompt}</p>
              {renderOptions(it.question, it.seq)}
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between gap-2">
            <button onClick={goComposer} disabled={busy} className="inline-flex items-center gap-2 border border-dark-gray/60 px-4 py-2 text-sm font-medium hover:bg-black hover:text-white">
              <ArrowLeft size={14} /> Back
            </button>
            <button onClick={submitBatch} disabled={busy || batchProgress < openBatch.length} className="inline-flex items-center gap-2 bg-black px-6 py-2 text-sm font-medium text-white disabled:opacity-50">
              {busy ? "Saving…" : `Submit ${openBatch.length === 1 ? "answer" : `all ${openBatch.length}`}`} <ArrowRight size={14} />
            </button>
          </div>
        </section>
      )}

      {phase === "questions" && !thinking && openBatch.length === 0 && items.some((it) => it.answer) && (
        <section className="mx-auto max-w-2xl py-6">
          <p className="text-xs font-medium uppercase tracking-wider opacity-50">
            All answered
          </p>
          {items.filter((it) => it.answer).map((it) => (
            <div key={it.seq} className="mb-3 border border-dark-gray/40 bg-white px-4 py-3">
              <p className="text-sm font-medium leading-6">{it.question.prompt}</p>
              <p className="mt-1 text-xs opacity-60">✓ {answerLabel(it)}</p>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between gap-2">
            <button onClick={goComposer} disabled={busy} className="inline-flex items-center gap-2 border border-dark-gray/60 px-4 py-2 text-sm font-medium hover:bg-black hover:text-white">
              <ArrowLeft size={14} /> Back
            </button>
            <button onClick={() => setPhase("configure")} disabled={busy} className="inline-flex items-center gap-2 bg-black px-6 py-2 text-sm font-medium text-white disabled:opacity-50">
              Continue <ArrowRight size={14} />
            </button>
          </div>
        </section>
      )}

      {phase === "questions" && !thinking && openBatch.length === 0 && !items.some((it) => it.answer) && (
        <section className="mx-auto max-w-2xl py-6 text-center">
          <p className="text-sm opacity-60">No questions loaded for this run.</p>
          <div className="mt-4 flex justify-center gap-2">
            <button onClick={() => reloadItems()} disabled={busy} className="inline-flex items-center gap-2 bg-black px-6 py-2 text-sm font-medium text-white disabled:opacity-50">
              Reload questions
            </button>
            <button onClick={goComposer} disabled={busy} className="inline-flex items-center gap-2 border border-dark-gray/60 px-4 py-2 text-sm font-medium hover:bg-black hover:text-white">
              <ArrowLeft size={14} /> Back
            </button>
          </div>
        </section>
      )}

      {phase === "configure" && (
        <section className="mx-auto max-w-2xl py-6">
          <h2 className="nibgate-display-title text-2xl font-medium md:text-3xl">Configure the run</h2>
          <p className="mt-2 text-sm opacity-60">{guestMode ? "Choose the scope and future research budget. Guest planning is sponsored within usage limits; no payment or research starts here." : privateBuildEnabled()&&!privateFundingEnabled()?"Set the bounds for private research. This owner preview has no wallet payment or escrow.":"Set the bounds. Planning is free — money moves only when you approve."}</p>
          {guestMode && <div className="mt-5 border border-dark-gray/50 p-4 text-sm">
            <p>Private files require an account. Your text-only guest plan can continue without uploads.</p>
            <button disabled={adopting || busy || guestRestoreBlocked} onClick={() => { void signInAndAdopt("files"); }} className="mt-3 border border-black px-4 py-2 font-medium focus-visible:outline-2 disabled:opacity-50">{adoptionAwaitingSignIn ? "Waiting for sign-in…" : adopting ? "Saving to your account…" : "Sign in to add private files"}</button>
          </div>}
          {!guestMode && project?.id && (confidential
            ? <ConfidentialSourceManager runId={project.id} onBusyChange={setSourcesBusy} />
            : <SourceManager runId={project.id} onBusyChange={setSourcesBusy} />)}
          <fieldset disabled={busy || adopting || guestRestoreBlocked || (guestMode && guestPlanningExpired)} className="min-w-0">
          <legend className="sr-only">Research configuration</legend>
          <div className="mt-5 grid grid-cols-1 gap-4 text-left sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium" htmlFor="drnib-depth">Depth</label>
              <select id="drnib-depth" value={depth} onChange={(e) => setDepth(e.target.value)} className="mt-1.5 w-full border border-dark-gray/50 bg-white px-3 py-2 text-sm">
                <option value="quick">Quick — up to 2 rounds</option>
                <option value="standard">Standard — balanced</option>
                <option value="deep">Deep — exhaustive</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="drnib-cap">Budget cap (USDC)</label>
              <input id="drnib-cap" type="number" min={0.1} step={0.1} value={budgetCap} onChange={(e) => setBudgetCap(Number(e.target.value) || 0)} className="mt-1.5 w-full border border-dark-gray/50 bg-white px-3 py-2 text-sm" />
            </div>
          </div>
          {guestMode && <p className="mt-4 text-xs">Guest planning does not browse or call paid tools. To fund this plan later, choose public web research below, or sign in to add private sources and replan.</p>}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
            {confidential ? (
              <span className="opacity-60">Confidential runs research the document you supply inside the verified worker — no live web, no onchain escrow on this path.</span>
            ) : (<>
            <label className="flex items-center gap-2"><input type="checkbox" checked={liveWeb} disabled={privateBuildEnabled()&&!privateWebEnabled} onChange={(e) => setLiveWeb(e.target.checked)} /> {guestMode ? "Use public web sources when funded research starts" : privateBuildEnabled()?"Allow public URL reads and tools":"Live web search"}</label>
            {privateBuildEnabled()&&liveWeb?<label className="flex items-center gap-2"><input type="checkbox" checked={searchEnabled} onChange={e=>setSearchEnabled(e.target.checked)} /> Also allow web and Hub search</label>:null}
            {privateBuildEnabled()&&liveWeb&&searchEnabled?<label className="block text-xs">Search terms<input type="search" autoComplete="off" value={publicSearchBrief??''} maxLength={400} onChange={event=>setPublicSearchBrief(event.target.value)} className="mt-1 block w-full rounded border border-dark-gray/40 bg-white p-2"/><span className="mt-1 block opacity-60">Public search tools receive these terms and selected public URLs. JEV receives selected research context through OpenRouter and TypeSafe, with zero retention required.</span></label>:null}
            <label className="flex items-center gap-2" title={privateBuildEnabled()?"Seek relevant creator work and propose JEV-judged tips after the report; up to 20% of the budget, with the research estimate reserved. Review the public URL and amount before payment.":"Tip the decisive sources up to $1 each after scoring — proposed by the model, judged before signing"}>
              <input type="checkbox" checked={tipCreators} disabled={guestMode || privateBuildEnabled()&&!privateWebEnabled} onChange={(e) => setTipCreators(e.target.checked)} /> Tip cited creators
            </label>
            <span className="opacity-60">{guestMode ? "Later research requires account sign-in and separate funding approval. JEV receives selected planning context through OpenRouter/TypeSafe with zero retention required." : privateBuildEnabled()?privateFundingEnabled()?"Research uses your onchain escrow deposit. Planning and writing run in verified processing; JEV receives selected context through OpenRouter/TypeSafe with zero retention required. Creator tips use escrow after your approval of the public page and amount; research keeps its reserve.":"Research uses the owner test limit. Planning and writing run in verified processing; JEV receives selected context through OpenRouter/TypeSafe with zero retention required. Creator tips use escrow after your approval of the public page and amount; research keeps its reserve.":"Runs are funded by an onchain escrow deposit — approve stays locked until it lands."}</span>
            </>)}
            {privateBuildEnabled()&&process.env.NEXT_PUBLIC_DRNIB_HOSTED_RESEARCH_FALLBACK==='true'?<p role="note" className="w-full text-xs leading-5">Phala processes research first. If unavailable, OpenRouter and the approved Azure model may process your research context with zero retention required. This fallback is provider-visible, not hardware-attested inference. Project decryption and saved state remain in the private worker. JEV keeps its disclosed OpenRouter/TypeSafe route.</p>:null}
            <span className="opacity-60">Outputs:</span>
            {["pdf", "word", "excel", "powerpoint"].map((f) => (
              <button key={f} aria-pressed={formats.includes(f)} onClick={() => setFormats((p) => (p.includes(f) ? p.filter((x) => x !== f) : [...p, f]))} className={`border px-2.5 py-1 text-xs uppercase ${formats.includes(f) ? "border-black bg-black text-white" : "border-dark-gray/50 opacity-70"}`}>{f}</button>
            ))}
          </div>
          <div className="mt-4">
            <fieldset className="min-w-0">
              <legend className="text-sm font-medium">Report length</legend>
              <div className="mt-1.5 flex flex-wrap gap-2">
              {[
                { id: "brief", label: "Brief · 1,200+ words" },
                { id: "standard", label: "Standard · 4,000+ words" },
                { id: "comprehensive", label: "Comprehensive · 12,000+ words" },
                { id: "custom", label: "Custom…" },
              ].map((o) => (
                <label key={o.id}
                  className={`flex cursor-pointer items-center gap-2 border px-3 py-1.5 text-xs focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-black ${length === o.id ? "border-black bg-black text-white" : "border-dark-gray/50 opacity-70"}`}>
                  <input type="radio" name="drnib-report-length" value={o.id} checked={length === o.id}
                    onChange={() => setLength(o.id)} className="h-4 w-4 accent-black" />
                  {o.label}
                </label>
              ))}
              </div>
            </fieldset>
            {length === "custom" ? (
              <div className="mt-2 flex items-center gap-2 text-sm">
                <label htmlFor="drnib-words" className="opacity-60">Words</label>
                <input id="drnib-words" type="number" min={300} max={50000} step={100} value={lengthWords}
                  onChange={(e) => setLengthWords(Number(e.target.value) || 0)}
                  className="w-32 border border-dark-gray/50 bg-white px-3 py-1.5 text-sm" />
                <span className="text-xs opacity-60">300 – 50,000, clamped if outside</span>
              </div>
            ) : null}
          </div>
          </fieldset>
          {busy && <p role="status" className="mt-4 text-sm">Preparing your plan. Your submitted settings are locked until this request finishes.</p>}
          <div className="mt-5 flex gap-2">
            <button onClick={async () => { await reloadItems(); setPhase("questions"); }} disabled={busy} className="border border-dark-gray/60 px-4 py-2 text-sm font-medium disabled:opacity-50">Back</button>
            <button onClick={plan} disabled={busy || sourcesBusy || guestRestoreBlocked || adopting || (guestMode && guestPlanningExpired)} className="bg-black px-6 py-2 text-sm font-medium text-white disabled:opacity-50">{sourcesBusy ? "Finish adding sources…" : busy ? "Planning…" : "Plan run"}</button>
          </div>
        </section>
      )}

      {phase === "review" && (
        <section className="mx-auto max-w-2xl py-6">
          <h2 className="nibgate-display-title text-2xl font-medium md:text-3xl">{confidential ? "Review the run" : "Review the plan"}</h2>
          {!confidential && planSource === "fallback" && (
            <p role="alert" className="mt-4 border border-red-700 bg-red-50 p-4 text-sm text-red-900">
              The research model was unavailable, so these are placeholder steps. No deposit can be opened or approved. Go back and plan again when the service recovers.
            </p>
          )}
          <div className="mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5 text-left">
            <p className="text-[15px] font-medium leading-7">{project?.title || topic}</p>
            <p className="mt-1 text-xs opacity-60">{project?.description}</p>
            {confidential ? (
              <>
                <p className="mt-3 text-xs opacity-60">Supplied document only · analyzed end-to-end encrypted in the verified worker</p>
                <p className="mt-1 text-xs opacity-60">Report: {" "}
                  {length === "custom" ? `custom · ${Number(lengthWords || 0).toLocaleString()}+ words minimum` : `${length} · ${{ brief: "1,200", standard: "4,000", comprehensive: "12,000" }[length] || "4,000"}+ words minimum`}</p>
                <p className="mt-3 text-sm">Run {project?.id?.slice(0, 8)} · nothing charged on this test path</p>
              </>
            ) : (<>
            <p className="mt-3 text-xs opacity-60">Depth: {depth} · Cap: ${budgetCap.toFixed(2)} · {guestMode ? (liveWeb ? "public web sources after funding" : "text-only plan · add sources after sign-in") : liveWeb ? (privateBuildEnabled()&&!searchEnabled?"public URL reads · search off":"live web") : "uploaded sources only"} · {formats.join(", ")}</p>
            <p className="mt-1 text-xs opacity-60">Report: {length === "custom" ? `custom · ${Number(lengthWords || 0).toLocaleString()}+ words minimum` : `${length} · ${{ brief: "1,200", standard: "4,000", comprehensive: "12,000" }[length] || "4,000"}+ words minimum`}</p>
            <p className="mt-3 text-sm">Estimated cost: <strong>{estimate === null ? "Unavailable — replan before funding" : `$${estimate.toFixed(2)}`}</strong> · Run {project?.id?.slice(0, 8)}</p>
            </>)}
          </div>
          {subQuestions.length > 0 && (
            <div className="mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5 text-left">
              <p className="text-xs font-medium uppercase tracking-wider opacity-60">Plan steps — edit or drop any line before approving</p>
              <ol className="mt-2 space-y-2">
                {subQuestions.map((sq, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 opacity-50">{i + 1}.</span>
                    {editingSq === i ? (
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <input
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          aria-label={`Edit step ${i + 1}`}
                          className="min-w-0 flex-1 border border-dark-gray/50 bg-white px-2 py-2 text-sm focus-visible:outline-2"
                        />
                        <button
                          onClick={() => {
                            const t = editText.trim();
                            if (!t) { stick("Enter a plan step before saving. The previous step is unchanged."); return; }
                            const next = subQuestions.map((x, j) => (j === i ? t : x));
                            void savePlan(next);
                          }}
                          disabled={busy}
                          className="border border-black bg-black px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button onClick={() => setEditingSq(null)} className="px-2 py-1 text-xs opacity-60 hover:opacity-100">Cancel</button>
                      </span>
                    ) : (
                      <span className="flex flex-1 items-start justify-between gap-2">
                        <span className="leading-6">{sq}</span>
                        <span className="flex shrink-0 gap-1">
                          <button
                            onClick={() => { setEditingSq(i); setEditText(sq); }}
                            disabled={busy || adopting}
                            aria-label={`Edit step ${i + 1}`}
                            className="min-h-11 min-w-11 px-1.5 py-0.5 text-xs opacity-60 hover:opacity-100 hover:underline focus-visible:outline-2"
                          >
                            Edit
                          </button>
                          {subQuestions.length > 1 && (
                            <button
                              onClick={() => { void savePlan(subQuestions.filter((_, j) => j !== i)); }}
                              disabled={busy}
                              aria-label={`Drop step ${i + 1}`}
                              className="px-1.5 py-0.5 text-xs opacity-60 hover:text-red-700 hover:opacity-100 disabled:opacity-50"
                            >
                              Drop
                            </button>
                          )}
                        </span>
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
          {items.length > 0 && (
            <div className="mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5 text-left">
              <p className="text-xs font-medium uppercase tracking-wider opacity-60">Your answers — what the plan is built on</p>
              <ul className="mt-2 space-y-2">
                {items.map((it) => (
                  <li key={it.seq} className="text-sm">
                    <span className="font-medium leading-6">{it.question.prompt}</span>
                    <span className="block text-xs opacity-60">→ {it.answer ? (answerLabel(it) || "(answered)") : "Skipped"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {confidential && (
            <p className="mt-4 border border-dark-gray/50 bg-white p-4 text-sm">Your plan is ready. Continuing starts confidential research on the document you added — it stays in this browser and is encrypted to the verified worker. Nothing is charged on this test path.</p>
          )}
          {guestMode && <div className="mt-5 border border-dark-gray/50 p-4 text-sm">
            <h3 className="font-medium">Save this plan before funding</h3>
            <p className="mt-2">Sign in with Google or a wallet to save the encrypted project to your account. We’ll verify the plan and current estimate before showing funding. Sign-in does not fund or start research.</p>
            <button disabled={adopting || signInBusy || busy || guestRestoreBlocked} onClick={() => { void signInAndAdopt("plan"); }} className="mt-3 bg-black px-4 py-2 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50">{adoptionAwaitingSignIn || signInBusy ? "Waiting for sign-in…" : adopting ? "Saving and checking your plan…" : "Sign in to save this plan"}</button>
            {signInError && <p role="status" className="mt-2">{signInError}</p>}
          </div>}
          {!guestMode && !confidential && <>
          {escrowConfigured === true && project && !escrowFunded && planSource !== "fallback" && (
            <>
              <EscrowDeposit runId={project.id} budgetCap={budgetCap} estimate={privateFundingEnabled()?Math.max(Number(estimate??0),Number(project.plan?.minimumFunding??0)):estimate} onFunded={(confirmedBudget) => { setEscrowBudget(confirmedBudget); setEscrowFunded(true); }} />
              {escrowStale && (
                <p className="mt-2 text-xs text-red-700">
                  Escrow status isn&apos;t refreshing — anything you&apos;ve signed so far still stands.{" "}
                  <button onClick={() => project && loadEscrow(project.id)} className="underline">Retry</button>
                </p>
              )}
            </>
          )}
          {escrowConfigured === true && escrowFunded && (
            <p className="mt-4 border-2 border-black bg-white p-4 text-sm">✓ Escrow funded (${escrowBudget.toFixed(2)}) — approving starts the run against your deposit. Unspent money returns to your wallet automatically at settle.</p>
          )}
          {escrowConfigured === false && (
            <div className="mt-4 border border-dark-gray/50 bg-white p-4 text-sm">
              <p className="text-xs font-medium uppercase tracking-wider opacity-60">{privateBuildEnabled()&&!privateFundingEnabled()?"Private owner preview":"No onchain escrow on this network"}</p>
              <p className="mt-1 leading-6">
                {privateBuildEnabled()&&!privateFundingEnabled()?<>Approve starts real confidential processing within the configured owner test limits. It does not authorize a wallet payment or ledger allowance.</>:<>Approve authorizes a <strong>${Number(budgetCap || 0).toFixed(2)} ledger allowance</strong> — no wallet
                signature, no money moves now. Stages draw from the allowance.</>}
              </p>
            </div>
          )}
          {escrowConfigured === null && !escrowCheckFailed && (
            <p className="mt-4 text-xs opacity-60">Checking escrow support…</p>
          )}
          {escrowConfigured === null && escrowCheckFailed && project && (
            <div className="mt-4 border border-dark-gray/50 bg-white p-4 text-sm">
              <p className="text-xs font-medium uppercase tracking-wider opacity-60">Couldn&apos;t check escrow support</p>
              <p className="mt-1 leading-6">
                Approve stays locked until escrow support is confirmed. Retry the check:{" "}
                <button onClick={() => loadEscrow(project.id)} className="underline">Retry check</button>
              </p>
            </div>
          )}
          <p className="mt-4 text-xs leading-5 opacity-60">
            {privateBuildEnabled()&&!privateFundingEnabled() ? "Private owner test — no wallet payment or escrow." : escrowConfigured === true
              ? "Approving starts the run against the amount you fund onchain. Stages draw from that deposit; whatever isn't spent returns to your wallet at settle."
              : escrowConfigured === false
                ? "Ledger allowance path — nothing to sign, nothing to fund."
                : "Waiting on the escrow check before approve unlocks."}
          </p>
          </>}
          {privateBuildEnabled()&&busy&&project?.id?<PrivateRunningActivity runId={project.id}/>:null}
          <div className="mt-4 flex gap-2">
            <button onClick={() => setPhase("configure")} className="border border-dark-gray/60 px-4 py-2 text-sm font-medium">Back</button>
            {!guestMode && <button onClick={approve} disabled={ guestRestoreBlocked || adopting || Boolean(adoptionNeedsReview) || busy || !project || planSource === "fallback" || (!confidential && (escrowConfigured === null || (escrowConfigured === true && !escrowFunded)))} className="inline-flex items-center gap-2 bg-black px-6 py-2 text-sm font-medium text-white disabled:opacity-50" title={confidential ? undefined : planSource === "fallback" ? "Retry planning before funding" : escrowConfigured === null ? "Waiting on the escrow check" : escrowConfigured === true && !escrowFunded ? "Fund the escrow first" : undefined}>{busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}{busy ? (privateBuildEnabled()?"Researching and verifying…":"Starting…") : confidential ? "Approve & continue" : "Approve & run"}</button>}
          </div>
        </section>
      )}
    </div>
  );
}

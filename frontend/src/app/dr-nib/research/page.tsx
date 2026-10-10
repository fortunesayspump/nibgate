"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Send, Square } from "lucide-react";
import { drNibApi, type IntakeAnswer, type IntakeOption, type IntakeQuestion } from "@/lib/dr-nib-api";
import { useNibgateConnect } from "@/lib/useNibgateConnect";
import { EscrowDeposit } from "@/components/dr-nib/EscrowDeposit";

const SAMPLES = [
  "Compare Arc vs Base for USDC micropayments, last 90 days",
  "Which creator paywall models convert best in 2026?",
  "Summarize the x402 ecosystem and who is shipping on it",
];

type Phase = "composer" | "creating" | "questions" | "configure" | "review";
type Item = { seq: number; question: IntakeQuestion; answer?: IntakeAnswer; thinking?: string };

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
  // Dr. Nib is wallet-gated through the same shared hub session as the header.
  // When a call comes back 401 (wallet connected but not signed in), prompt and
  // open the shared connect/sign-in rather than showing a raw error.
  const { connect } = useNibgateConnect();
  const [phase, setPhase] = useState<Phase>("composer");
  const [topic, setTopic] = useState("");
  const [project, setProject] = useState<any | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [idx, setIdx] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, IntakeAnswer>>({});
  const [otherOpen, setOtherOpen] = useState<Record<number, boolean>>({});
  // Streaming reads accumulate: finished thinkings stay on screen in order
  // and the next streams in below — nothing is ever wiped for the next line.
  const [thinking, setThinking] = useState<{ history: string[]; shown: string } | null>(null);
  // The batch whose answers just landed: thinking streams first, then the UI
  // waits on Next (see advanceBatch). Nothing auto-advances.
  const [pendingBatch, setPendingBatch] = useState<null | { answers: { seq: number; answer: IntakeAnswer }[]; res: any }>(null);
  // True while the answers are still flying: the loading screen shows
  // instantly on click (optimistic), the stream lands into it when it arrives.
  const [loadingAnswer, setLoadingAnswer] = useState(false);
  const [depth, setDepth] = useState("standard");
  const [liveWeb, setLiveWeb] = useState(true);
  const [formats, setFormats] = useState<string[]>(["pdf"]);
  const [budgetCap, setBudgetCap] = useState(2.5);
  const [length, setLength] = useState("standard");
  const [lengthWords, setLengthWords] = useState(4000);
  const [estimate, setEstimate] = useState<number | null>(null);
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
  // Onchain escrow is opt-in per run: the ledger path stays default, and a
  // funded escrow becomes a hard gate at approve (backend enforces Funded).
  const [escrowOptIn, setEscrowOptIn] = useState(false);
  const [escrowFunded, setEscrowFunded] = useState(false);
  const stopRef = useRef<null | (() => void)>(null);

  // The open batch: every unanswered question, in order. Answered batches
  // render collapsed above it.
  const openBatch = items.filter((it) => !it.answer);
  const batchProgress = openBatch.filter((it) => {
    const d = drafts[it.seq] || { optionIds: [], text: "" };
    return hasAnswer(cleanAnswer(d, it.question, !!otherOpen[it.seq]));
  }).length;

  // Resume a project that was left mid-intake.
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("project");
    if (!id) return;
    (async () => {
      try {
        const run: any = await drNibApi.getRun(id);
        if (!["draft", "intake", "intake-done"].includes(run.status)) {
          router.replace(`/dr-nib/research/${id}`);
          return;
        }
        const loaded: Item[] = (run.decisions || [])
          .filter((d: any) => d.kind === "question")
          .map((d: any) => ({ seq: d.seq, question: d.question, answer: d.answer || undefined }));
        setProject({ id: run.id, title: run.title, description: run.description, status: run.status, metadata: run.metadata });
        setTopic(run.brief?.topic || "");
        setItems(loaded);
        const firstUnanswered = loaded.findIndex((it) => !it.answer);
        setIdx(firstUnanswered === -1 ? Math.max(0, loaded.length - 1) : firstUnanswered);
        setPhase(loaded.length ? "questions" : "composer");
      } catch {
        /* backend down — stay on composer */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    if (e?.code === "unauthenticated") {
      setNeedsSignIn(true);
      stick("Sign in to Nibgate to use Dr. Nib, then retry.");
      return;
    }
    if (e?.code === "unavailable") {
      // Outage, not logged-out: retrying is the fix, signing in changes nothing.
      stick("Dr. Nib couldn't reach accounts just now — retry in a moment.");
      return;
    }
    stick(`${label} (${e?.message || e}).`);
  }

  async function send() {
    const t = topic.trim();
    if (!t) return flash("Type a question first — even one line.");
    // Instant: the thinking screen opens on click with your message shown as
    // sent. No button-loading state ever — the screen IS the confirmation.
    setTopicEcho(t);
    setPhase("creating");
    setNotice("");
    try {
      const run: any = await drNibApi.createProject(t);
      setNeedsSignIn(false);
      setProject(run);
      const first = Array.isArray(run.questions) && run.questions.length
        ? run.questions
        : run.question ? [{ ...run.question, seq: 0 }] : [];
      if (!first.length) {
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
    } catch (e: any) {
      // Back to composer on failure — the thinking screen must never strand.
      setPhase("composer");
      fail(e, "Could not reach Dr. Nib");
    }
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
    if (!project || openBatch.length === 0) return;
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
    if (!project) return;
    setBusy(true);
    try {
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

  async function savePlan(next: string[]) {
    if (!project) return;
    setBusy(true);
    try {
      const res: any = await drNibApi.editPlan(project.id, next);
      setSubQuestions(Array.isArray(res?.plan?.sub_questions) ? res.plan.sub_questions.map(String) : next);
      if (Number.isFinite(Number(res?.plan?.estimate))) setEstimate(Number(res.plan.estimate));
      setEditingSq(null);
    } catch (e: any) {
      fail(e, "Plan edit failed");
    } finally {
      setBusy(false);
    }
  }

  async function plan() {
    if (!project) return;
    setBusy(true);
    setNotice("");
    try {
      await drNibApi.configureRun(project.id, {
        depth, budgetCap, formats, liveWeb,
        length, ...(length === "custom" ? { lengthWords } : {}),
      });
      // Planning is an LLM call away — replans especially can take a minute.
      // Never leave the user on a dead configure screen: either land review
      // or say so out loud.
      let landed = false;
      for (let i = 0; i < 90; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const full: any = await drNibApi.getRun(project.id);
        if (full.status === "planned" || full.status === "running" || full.status === "complete") {
          setEstimate(Number(full.plan?.estimate ?? 0.2));
          setSubQuestions(Array.isArray(full.plan?.sub_questions) ? full.plan.sub_questions.map(String) : []);
          setPhase("review");
          landed = true;
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
    if (!project) return;
    setBusy(true);
    try {
      await drNibApi.approveRun(project.id);
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
          value={draft.text || ""}
          onChange={(e) => setD({ optionIds: [], text: e.target.value })}
          rows={3}
          placeholder="Type your answer"
          className="mt-4 w-full resize-none border border-dark-gray/50 bg-white rounded-2xl px-4 py-3 text-sm outline-none"
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
      <div className="mt-4">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider opacity-50">
          {q.type === "pick_one" ? "Select one" : "Select all that apply"}
        </p>
        <div className="space-y-2">
          {q.options.map((o) => {
            const on = !other && (draft.optionIds || []).includes(o.id);
            return (
              <button key={o.id} onClick={() => pick(o)}
                className={`flex w-full items-center gap-3 border px-4 py-3 text-left text-sm transition ${on ? "border-black bg-black text-white" : "border-dark-gray/50 bg-white hover:border-black/50"}`}>
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center border ${on ? "border-white" : "border-dark-gray/60"} ${q.type === "pick_one" ? "rounded-full" : "rounded-sm"}`}>
                  {on && <span className={`bg-white ${q.type === "pick_one" ? "h-2 w-2 rounded-full" : "h-2.5 w-2.5 rounded-[2px]"}`} />}
                </span>
                {o.label}
              </button>
            );
          })}
          {q.allowOther && (
            <>
              <button
                onClick={() => {
                  if (q.type === "pick_one") { setO(true); setD({ optionIds: [], text: draft.text || "" }); }
                  else setO(!other);
                }}
                className={`flex w-full items-center gap-3 border px-4 py-3 text-left text-sm transition ${other ? "border-black bg-black text-white" : "border-dark-gray/50 bg-white hover:border-black/50"}`}>
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${other ? "border-white" : "border-dark-gray/60"}`}>
                  {other && <span className="h-2.5 w-2.5 rounded-[2px] bg-white" />}
                </span>
                Another answer…
              </button>
              {other && (
                <input
                  autoFocus
                  value={draft.text || ""}
                  onChange={(e) => setD({ ...draft, text: e.target.value })}
                  placeholder="Type your answer"
                  className="w-full border border-dark-gray/50 bg-white rounded-xl px-3 py-2.5 text-sm outline-none"
                />
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      {notice && <div className="mb-4 flex items-start justify-between gap-3 border border-dark-gray/50 bg-white px-4 py-2 text-sm"><span>{notice}{/live run/i.test(notice) && (<> — <button onClick={() => router.push("/dr-nib/projects")} className="underline">review them in Projects</button></>)}</span><button onClick={() => { setNotice(""); setNoticeSticky(false); }} aria-label="Dismiss" className="opacity-60 hover:opacity-100">✕</button></div>}
      {needsSignIn && (
        <div className="mb-4">
          <button onClick={() => { setNeedsSignIn(false); connect(); }} className="border border-black bg-black px-4 py-2 text-sm font-medium text-white">
            Sign in with wallet
          </button>
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
          <p className="mx-auto mt-3 max-w-xl text-sm opacity-60">Ask a question. A project is created straight away, so you can stop and pick it up later — nothing spends until you approve the plan.</p>
          <div className="relative mt-6">
            <textarea value={topic} onChange={(e) => setTopic(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              rows={4} placeholder="e.g. Compare Arc vs Base for USDC micropayments, last 90 days"
              className="w-full resize-none border border-dark-gray/50 bg-white rounded-2xl px-4 py-3 pb-12 text-left text-[15px] outline-none" />
            <button onClick={send} disabled={busy} aria-label="Send" className="absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center bg-black text-white disabled:opacity-50">
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} aria-hidden="true" />}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2">
            {SAMPLES.map((s) => (
              <button key={s} onClick={() => setTopic(s)} className="border border-dark-gray/50 bg-white px-3 py-1.5 text-left text-xs opacity-80 hover:opacity-100">{s.length > 52 ? s.slice(0, 52) + "…" : s}</button>
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
          <div className="relative mt-12 flex h-40 w-40 items-center justify-center" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-black/10" style={{ animationDuration: "2.2s" }} />
            <span className="absolute inline-flex h-28 w-28 animate-ping rounded-full bg-black/10" style={{ animationDuration: "2.2s", animationDelay: "0.4s" }} />
            <span className="absolute inline-flex h-16 w-16 animate-ping rounded-full bg-black/15" style={{ animationDuration: "2.2s", animationDelay: "0.8s" }} />
            <span className="relative inline-flex h-8 w-8 rounded-full bg-black">
              <span className="m-auto h-2 w-2 animate-pulse rounded-full bg-white" />
            </span>
          </div>
          <p className="mt-8 text-xs font-medium uppercase tracking-wider opacity-50">Dreaming up questions…</p>
        </section>
      )}

      {phase === "questions" && thinking && (
        <section className="mx-auto flex max-w-2xl flex-col items-center py-20 text-center">
          {(!streamDone || loadingAnswer) && <Loader2 className="mb-5 animate-pulse opacity-70" size={28} />}
          {loadingAnswer && <p className="mb-5 text-xs font-medium uppercase tracking-wider opacity-50">Sending answers…</p>}
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
            <p className="text-xs font-medium uppercase tracking-wider opacity-50">
              Answer these · {batchProgress} of {openBatch.length} done
            </p>
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
          <p className="mt-2 text-sm opacity-60">Set the bounds. Planning is free — money moves only when you approve.</p>
          <div className="mt-5 grid grid-cols-1 gap-4 text-left sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium" htmlFor="drnib-depth">Depth</label>
              <select id="drnib-depth" value={depth} onChange={(e) => setDepth(e.target.value)} className="mt-1.5 w-full border border-dark-gray/50 bg-white px-3 py-2 text-sm">
                <option value="quick">Quick — 1 pass</option>
                <option value="standard">Standard — balanced</option>
                <option value="deep">Deep — exhaustive</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium" htmlFor="drnib-cap">Budget cap (USDC)</label>
              <input id="drnib-cap" type="number" min={0.1} step={0.1} value={budgetCap} onChange={(e) => setBudgetCap(Number(e.target.value) || 0)} className="mt-1.5 w-full border border-dark-gray/50 bg-white px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={liveWeb} onChange={(e) => setLiveWeb(e.target.checked)} /> Live web search</label>
            <label className="flex items-center gap-2" title="Lock the cap in an onchain escrow instead of a ledger allowance">
              <input type="checkbox" checked={escrowOptIn} onChange={(e) => { setEscrowOptIn(e.target.checked); setEscrowFunded(false); }} /> Fund onchain escrow
            </label>
            <span className="opacity-60">Outputs:</span>
            {["pdf", "word", "excel", "powerpoint"].map((f) => (
              <button key={f} onClick={() => setFormats((p) => (p.includes(f) ? p.filter((x) => x !== f) : [...p, f]))} className={`border px-2.5 py-1 text-xs uppercase ${formats.includes(f) ? "border-black bg-black text-white" : "border-dark-gray/50 opacity-70"}`}>{f}</button>
            ))}
          </div>
          <div className="mt-4">
            <span className="text-sm font-medium">Report length</span>
            <div className="mt-1.5 flex flex-wrap gap-2" role="radiogroup" aria-label="Report length">
              {[
                { id: "brief", label: "Brief · ~1,200 words" },
                { id: "standard", label: "Standard · ~4,000 words" },
                { id: "comprehensive", label: "Comprehensive · ~12,000 words" },
                { id: "custom", label: "Custom…" },
              ].map((o) => (
                <button key={o.id} onClick={() => setLength(o.id)} aria-pressed={length === o.id}
                  className={`border px-3 py-1.5 text-xs ${length === o.id ? "border-black bg-black text-white" : "border-dark-gray/50 opacity-70"}`}>{o.label}</button>
              ))}
            </div>
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
          <div className="mt-5 flex gap-2">
            <button onClick={async () => { await reloadItems(); setPhase("questions"); }} disabled={busy} className="border border-dark-gray/60 px-4 py-2 text-sm font-medium disabled:opacity-50">Back</button>
            <button onClick={plan} disabled={busy} className="bg-black px-6 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Planning…" : "Plan run"}</button>
          </div>
        </section>
      )}

      {phase === "review" && (
        <section className="mx-auto max-w-2xl py-6">
          <h2 className="nibgate-display-title text-2xl font-medium md:text-3xl">Review the plan</h2>
          <div className="mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5 text-left">
            <p className="text-[15px] font-medium leading-7">{project?.title || topic}</p>
            <p className="mt-1 text-xs opacity-60">{project?.description}</p>
            <p className="mt-3 text-xs opacity-60">Depth: {depth} · Cap: ${budgetCap.toFixed(2)} · {liveWeb ? "live web" : "curated only"} · {formats.join(", ")}</p>
            <p className="mt-1 text-xs opacity-60">Report: {length === "custom" ? `custom · ~${Number(lengthWords || 0).toLocaleString()} words` : `${length} · ~${{ brief: "1,200", standard: "4,000", comprehensive: "12,000" }[length] || "4,000"} words`}</p>
            <p className="mt-3 text-sm">Estimated cost: <strong>${(estimate ?? 0.2).toFixed(2)}</strong> · Run {project?.id?.slice(0, 8)}</p>
          </div>
          {subQuestions.length > 0 && (
            <div className="mt-4 rounded-2xl border border-dark-gray/50 bg-white p-5 text-left">
              <p className="text-xs font-medium uppercase tracking-wider opacity-60">Plan steps — edit or drop any line before approving</p>
              <ol className="mt-2 space-y-2">
                {subQuestions.map((sq, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className="mt-0.5 opacity-50">{i + 1}.</span>
                    {editingSq === i ? (
                      <span className="flex flex-1 items-center gap-2">
                        <input
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          aria-label={`Edit step ${i + 1}`}
                          className="flex-1 border border-dark-gray/50 bg-white px-2 py-1 text-sm"
                        />
                        <button
                          onClick={() => {
                            const t = editText.trim();
                            if (!t || subQuestions.length <= 1) { setEditingSq(null); return; }
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
                            aria-label={`Edit step ${i + 1}`}
                            className="px-1.5 py-0.5 text-xs opacity-60 hover:opacity-100 hover:underline"
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
                    <span className="block text-xs opacity-60">→ {it.answer ? answerLabel(it) : "Skipped"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {escrowOptIn && project && !escrowFunded && (
            <EscrowDeposit runId={project.id} budgetCap={budgetCap} onFunded={() => setEscrowFunded(true)} />
          )}
          <p className="mt-4 text-xs leading-5 opacity-60">
            No wallet signature needed here — the ${budgetCap.toFixed(2)} cap is a spending allowance on Nibgate&apos;s metered providers, and whatever isn&apos;t spent is released when the run settles. Real money moves only if you fund the onchain escrow above.
          </p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setPhase("configure")} className="border border-dark-gray/60 px-4 py-2 text-sm font-medium">Back</button>
            <button onClick={approve} disabled={busy || !project || (escrowOptIn && !escrowFunded)} className="bg-black px-6 py-2 text-sm font-medium text-white disabled:opacity-50" title={escrowOptIn && !escrowFunded ? "Fund the escrow first" : undefined}>{busy ? "Starting…" : "Approve & run"}</button>
          </div>
        </section>
      )}
    </div>
  );
}

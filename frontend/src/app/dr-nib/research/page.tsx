"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Send, Square } from "lucide-react";
import { drNibApi, type IntakeAnswer, type IntakeOption, type IntakeQuestion } from "@/lib/dr-nib-api";
import { useNibgateConnect } from "@/lib/useNibgateConnect";

const SAMPLES = [
  "Compare Arc vs Base for USDC micropayments, last 90 days",
  "Which creator paywall models convert best in 2026?",
  "Summarize the x402 ecosystem and who is shipping on it",
];

type Phase = "composer" | "questions" | "configure" | "review";
type Item = { seq: number; question: IntakeQuestion; answer?: IntakeAnswer; thinking?: string };

function cleanAnswer(a: IntakeAnswer, q: IntakeQuestion, other: boolean): IntakeAnswer {
  const text = (a.text || "").trim();
  if (q.type === "free") return { text };
  return { optionIds: a.optionIds || [], text: other ? text : "" };
}
function hasAnswer(a: IntakeAnswer): boolean {
  return Boolean((a.optionIds && a.optionIds.length) || (a.text && a.text.trim()));
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
  const [draft, setDraft] = useState<IntakeAnswer>({ optionIds: [], text: "" });
  const [otherOpen, setOtherOpen] = useState(false);
  const [thinking, setThinking] = useState<{ shown: string } | null>(null);
  const [depth, setDepth] = useState("standard");
  const [liveWeb, setLiveWeb] = useState(true);
  const [formats, setFormats] = useState<string[]>(["pdf"]);
  const [budgetCap, setBudgetCap] = useState(2.5);
  const [length, setLength] = useState("standard");
  const [lengthWords, setLengthWords] = useState(4000);
  const [estimate, setEstimate] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const stopRef = useRef<null | (() => void)>(null);

  const current = items[idx];

  useEffect(() => {
    const a = items[idx]?.answer;
    setDraft({ optionIds: a?.optionIds || [], text: a?.text || "" });
    setOtherOpen(Boolean(a?.text));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idx]);

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

  function flash(msg: string) {
    setNotice(msg);
    setTimeout(() => setNotice(""), 3000);
  }

  // One place for failed calls: a 401 means the wallet is connected but there
  // is no hub session, so prompt and open the shared sign-in. Everything else
  // is a real error with the server's status shown.
  function fail(e: any, label: string) {
    if (e?.code === "unauthenticated") {
      flash("Sign in to Nibgate to use Dr. Nib.");
      connect();
      return;
    }
    flash(`${label} (${e?.message || e}).`);
  }

  async function send() {
    const t = topic.trim();
    if (!t) return flash("Type a question first — even one line.");
    setBusy(true);
    setNotice("");
    try {
      const run: any = await drNibApi.createProject(t);
      setProject(run);
      setItems(run.question ? [{ seq: 0, question: run.question }] : []);
      setIdx(0);
      setPhase("questions");
    } catch (e: any) {
      fail(e, "Could not reach Dr. Nib");
    } finally {
      setBusy(false);
    }
  }

  function streamThinking(text: string, onDone: () => void) {
    return new Promise<void>((resolve) => {
      const full = String(text || "");
      let i = 0;
      setThinking({ shown: "" });
      const stepChars = Math.max(1, Math.round(full.length / 110));
      const timer = setInterval(() => {
        i += stepChars;
        setThinking({ shown: full.slice(0, i) });
        if (i >= full.length) {
          clearInterval(timer);
          stopRef.current = null;
          setThinking(null);
          onDone();
          resolve();
        }
      }, 20);
      stopRef.current = () => {
        clearInterval(timer);
        stopRef.current = null;
        setThinking(null);
        resolve();
      };
    });
  }

  async function submit() {
    if (!project || !current) return;
    const ans = cleanAnswer(draft, current.question, otherOpen);
    if (!hasAnswer(ans)) return flash("Pick an answer, or type your own.");
    setBusy(true);
    setNotice("");
    try {
      const res: any = await drNibApi.answerQuestion(project.id, current.seq, ans);
      await streamThinking(res.thinking, () => {
        setItems((prev) => {
          const next = prev.map((it, i) => (i === idx ? { ...it, answer: ans, thinking: res.thinking } : it));
          if (res.next && !next.some((it) => it.seq === current.seq + 1)) {
            next.push({ seq: current.seq + 1, question: res.next });
          }
          return next;
        });
        if (res.project) setProject((p: any) => ({ ...p, ...res.project }));
        if (res.done) setPhase("configure");
        else setIdx((i) => i + 1);
      });
    } catch (e: any) {
      fail(e, "That didn't go through");
    } finally {
      setBusy(false);
    }
  }

  function goPrev() {
    if (idx > 0) setIdx(idx - 1);
    else setPhase("composer");
  }

  function goNext() {
    const saved = current?.answer;
    const changed = !saved || JSON.stringify(cleanAnswer(draft, current!.question, otherOpen)) !== JSON.stringify(saved);
    if (idx < items.length - 1 && !changed) setIdx(idx + 1);
    else submit();
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
      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 800));
        const full: any = await drNibApi.getRun(project.id);
        if (full.status === "planned" || full.status === "running" || full.status === "complete") {
          setEstimate(Number(full.plan?.estimate ?? 0.2));
          setPhase("review");
          break;
        }
      }
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

  function renderOptions(q: IntakeQuestion) {
    if (q.type === "free") {
      return (
        <textarea
          value={draft.text || ""}
          onChange={(e) => setDraft({ optionIds: [], text: e.target.value })}
          rows={4}
          placeholder="Type your answer"
          className="mt-6 w-full resize-none border border-dark-gray/50 bg-white rounded-2xl px-4 py-3 text-sm outline-none"
        />
      );
    }

    const pick = (o: IntakeOption) => {
      if (q.type === "pick_one") { setDraft({ optionIds: [o.id], text: "" }); setOtherOpen(false); }
      else {
        const ids = draft.optionIds || [];
        setDraft((d) => ({ ...d, optionIds: ids.includes(o.id) ? ids.filter((x) => x !== o.id) : [...ids, o.id] }));
      }
    };

    return (
      <div className="mt-6 space-y-2">
        {q.options.map((o) => {
          const on = !otherOpen && (draft.optionIds || []).includes(o.id);
          return (
            <button key={o.id} onClick={() => pick(o)}
              className={`block w-full border px-4 py-3 text-left text-sm transition ${on ? "border-black bg-black text-white" : "border-dark-gray/50 bg-white hover:border-black/50"}`}>
              {o.label}
            </button>
          );
        })}
        {q.allowOther && (
          <>
            <button
              onClick={() => {
                if (q.type === "pick_one") { setOtherOpen(true); setDraft({ optionIds: [], text: draft.text || "" }); }
                else setOtherOpen((v) => !v);
              }}
              className={`block w-full border px-4 py-3 text-left text-sm transition ${otherOpen ? "border-black bg-black text-white" : "border-dark-gray/50 bg-white hover:border-black/50"}`}>
              Another answer…
            </button>
            {otherOpen && (
              <input
                autoFocus
                value={draft.text || ""}
                onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                placeholder="Type your answer"
                className="w-full border border-dark-gray/50 bg-white rounded-xl px-3 py-2.5 text-sm outline-none"
              />
            )}
          </>
        )}
      </div>
    );
  }

  return (
    <div>
      {notice && <div className="mb-4 border border-dark-gray/50 bg-white px-4 py-2 text-sm">{notice}</div>}

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

      {phase === "questions" && thinking && (
        <section className="mx-auto flex max-w-2xl flex-col items-center py-20 text-center">
          <Loader2 className="mb-5 animate-spin opacity-70" size={22} />
          <p className="min-h-[3rem] max-w-xl text-sm italic leading-6 opacity-80">{thinking.shown}</p>
          <button onClick={() => stopRef.current?.()} className="mt-8 inline-flex items-center gap-2 border border-dark-gray/60 px-4 py-2 text-sm font-medium hover:bg-black hover:text-white">
            <Square size={12} /> Stop
          </button>
        </section>
      )}

      {phase === "questions" && !thinking && current && (
        <section className="mx-auto max-w-2xl py-6">
          <p className="text-xs font-medium uppercase tracking-wider opacity-50">Question {idx + 1}</p>
          <h2 className="nibgate-display-title mt-1 text-2xl font-medium md:text-3xl">{current.question.prompt}</h2>
          {renderOptions(current.question)}
          <div className="mt-6 flex items-center justify-between">
            <button onClick={goPrev} className="inline-flex items-center gap-2 border border-dark-gray/60 px-4 py-2 text-sm font-medium hover:bg-black hover:text-white">
              <ArrowLeft size={14} /> Back
            </button>
            <button onClick={goNext} disabled={busy} className="inline-flex items-center gap-2 bg-black px-6 py-2 text-sm font-medium text-white disabled:opacity-50">
              Next <ArrowRight size={14} />
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
            <button onClick={() => setPhase("questions")} className="border border-dark-gray/60 px-4 py-2 text-sm font-medium">Back</button>
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
          <div className="mt-4 flex gap-2">
            <button onClick={() => setPhase("configure")} className="border border-dark-gray/60 px-4 py-2 text-sm font-medium">Back</button>
            <button onClick={approve} disabled={busy || !project} className="bg-black px-6 py-2 text-sm font-medium text-white disabled:opacity-50">{busy ? "Starting…" : "Approve & run"}</button>
          </div>
        </section>
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  CircleAlert,
  CircleCheck,
  Download,
  FileText,
  Globe2,
  Library,
  ListChecks,
  Loader2,
  MessageSquare,
  Microscope,
  Pause,
  Play,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

type Trust = "high" | "medium" | "low";
type StepStatus = "pending" | "active" | "done";
type RunStatus = "draft" | "planned" | "running" | "paused" | "complete";
type Tab = "brief" | "activity" | "report";
type Nav = "research" | "chat" | "runs" | "sources" | "budget";

type Source = { id: number; title: string; domain: string; trust: Trust; snippet: string };
type Step = { id: number; label: string; detail: string; kind: "search" | "fetch" | "score" | "write"; status: StepStatus; cost: number };
type Msg = { id: number; role: "user" | "assistant"; text: string; cites?: number[] };

const NAV: { id: Nav; label: string; desc: string; icon: typeof Microscope }[] = [
  { id: "research", label: "Research", desc: "Structured briefs", icon: Microscope },
  { id: "chat", label: "Chat", desc: "Ask anything", icon: MessageSquare },
  { id: "runs", label: "Runs", desc: "Past reports", icon: ListChecks },
  { id: "sources", label: "Sources", desc: "Library", icon: Library },
  { id: "budget", label: "Budget", desc: "USDC + provider", icon: Wallet },
];

const SAMPLE_BRIEFS = [
  "Compare Arc vs Base for USDC micropayments, last 90 days",
  "Which creator paywall models convert best in 2026?",
  "Summarize the x402 ecosystem and who is shipping on it",
];

const DRAFT_STEPS: Omit<Step, "id" | "status">[] = [
  { label: "Search the web", detail: "6 queries across news, docs, and forums", kind: "search", cost: 0.03 },
  { label: "Fetch and read sources", detail: "open the top results and extract claims", kind: "fetch", cost: 0.06 },
  { label: "Score each source", detail: "JEV rates relevance and credibility", kind: "score", cost: 0.02 },
  { label: "Draft the report", detail: "synthesize with inline citations", kind: "write", cost: 0.09 },
];

const FOUND_SOURCES: Source[] = [
  { id: 1, title: "Arc mainnet goes live with native USDC", domain: "arc.io", trust: "high", snippet: "Arc settles payments in native USDC with sub-cent fees and deterministic finality." },
  { id: 2, title: "x402: payments for the open web", domain: "docs.nibgate.xyz", trust: "high", snippet: "The 402 challenge-response flow lets any client pay any resource, human or machine." },
  { id: 3, title: "Circle Gateway and batched authorizations", domain: "circle.com", trust: "high", snippet: "Gateway batches EIP-3009 authorizations for gasless, instant settlement." },
  { id: 4, title: "A thread on creator paywalls", domain: "x.com", trust: "low", snippet: "Unverified commentary; useful signal, weak provenance." },
  { id: 5, title: "Subblogs: own your domain, get paid", domain: "nibgate.xyz", trust: "medium", snippet: "Creators verify a domain once and unlock everything on it." },
];

const MOCK_REPORT = `## Headline

Arc and Circle Gateway are the strongest fit for USDC micropayments: native settlement, batched EIP-3009 authorizations, and no gas for the payer [1][3]. Alternative L2s work but carry bridge and gas overhead that shows up at sub-cent price points [2].

## What changed

Mainnet settlement is now the default surface, with a testnet mirror for staging [1]. Payments stay identical across humans and agents because the verification path is shared [2].

## What to watch

Provenance quality is the weak link: unverified social commentary should be weighted below primary docs [4].`;

const PAST_RUNS = [
  { title: "Arc vs Base for USDC", cost: 0.18, when: "2h ago", status: "complete" },
  { title: "Creator paywall models", cost: 0.21, when: "yesterday", status: "complete" },
  { title: "x402 ecosystem", cost: 0.0, when: "draft", status: "draft" },
];

function TrustChip({ trust }: { trust: Trust }) {
  const map: Record<Trust, { label: string; color: string; bg: string }> = {
    high: { label: "High", color: "#0b7a5b", bg: "rgba(15,140,100,0.12)" },
    medium: { label: "Medium", color: "#8a6d00", bg: "rgba(200,160,0,0.14)" },
    low: { label: "Low", color: "#a33b2e", bg: "rgba(190,60,40,0.12)" },
  };
  const t = map[trust];
  return <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ color: t.color, background: t.bg }}>{t.label}</span>;
}

function StepIcon({ status, kind }: { status: StepStatus; kind: Step["kind"] }) {
  if (status === "done") return <CircleCheck size={16} aria-hidden="true" style={{ color: "var(--nib-teal)" }} />;
  if (status === "active") return <Loader2 size={16} className="animate-spin" aria-hidden="true" />;
  if (kind === "score") return <ShieldCheck size={16} aria-hidden="true" className="opacity-50" />;
  if (kind === "write") return <FileText size={16} aria-hidden="true" className="opacity-50" />;
  return <Globe2 size={16} aria-hidden="true" className="opacity-50" />;
}

export default function DrNibWorkspace() {
  const [nav, setNav] = useState<Nav>("research");

  // research run
  const [status, setStatus] = useState<RunStatus>("draft");
  const [tab, setTab] = useState<Tab>("brief");
  const [topic, setTopic] = useState("");
  const [depth, setDepth] = useState("standard");
  const [liveWeb, setLiveWeb] = useState(true);
  const [formats, setFormats] = useState<string[]>(["pdf"]);
  const [provider, setProvider] = useState<"hub" | "byo">("hub");
  const [budgetCap, setBudgetCap] = useState(2.5);
  const [balance, setBalance] = useState(12.4);
  const [spent, setSpent] = useState(0);
  const [steps, setSteps] = useState<Step[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [cursor, setCursor] = useState(0);
  const [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  // chat
  const [messages, setMessages] = useState<Msg[]>([
    { id: 1, role: "assistant", text: "Ask me anything. I search the web, cite what I find, and charge it to your budget. Prefer a structured deliverable? Switch to Research." },
  ]);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);

  const estimate = DRAFT_STEPS.reduce((sum, s) => sum + s.cost, 0);
  const spentPct = Math.min(100, Math.round((spent / budgetCap) * 100));

  useEffect(() => {
    if (status !== "running") {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    timer.current = setInterval(() => setCursor((c) => c + 1), 1300);
    return () => { if (timer.current) clearInterval(timer.current); };
  }, [status]);

  useEffect(() => {
    if (status !== "running") return;
    setSteps((prev) => prev.map((s, i) => ({ ...s, status: i < cursor ? "done" : i === cursor ? "active" : "pending" })));
    if (cursor > 0 && cursor <= FOUND_SOURCES.length) setSources(FOUND_SOURCES.slice(0, cursor));
    setSpent(Math.min(estimate, Number((estimate * (cursor / DRAFT_STEPS.length)).toFixed(3))));
    if (cursor >= DRAFT_STEPS.length) { setStatus("complete"); setTab("report"); }
  }, [cursor, status, estimate]);

  function flash(msg: string) { setNotice(msg); setTimeout(() => setNotice(""), 2600); }

  function planRun() {
    if (!topic.trim()) return flash("Add a brief first — even one line.");
    setNotice("");
    setSteps(DRAFT_STEPS.map((s, i) => ({ ...s, id: i, status: "pending" })));
    setSources([]); setSpent(0); setCursor(0); setStatus("planned"); setTab("brief");
  }
  function approveRun() {
    if (estimate > balance) return flash("This run is over your balance — top up to continue.");
    setNotice(""); setStatus("running"); setTab("activity");
  }
  function toggleFormat(f: string) { setFormats((p) => (p.includes(f) ? p.filter((x) => x !== f) : [...p, f])); }
  function queueExport(f: string) { flash(`Export queued: ${f.toUpperCase()} (server render, lands in your downloads)`); }

  function send() {
    const text = draft.trim();
    if (!text || thinking) return;
    const mine: Msg = { id: Date.now(), role: "user", text };
    setMessages((m) => [...m, mine]);
    setDraft("");
    setThinking(true);
    setTimeout(() => {
      setMessages((m) => [...m, {
        id: Date.now() + 1,
        role: "assistant",
        text: "Here's what I found. Arc settles in native USDC and Circle Gateway batches EIP-3009 authorizations, so the payer never holds gas. The strongest sources are primary docs; I'd down-weight social commentary.",
        cites: [1, 2, 3],
      }]);
      setSpent((s) => Number((s + 0.04).toFixed(3)));
      setThinking(false);
      setSources((s) => (s.length ? s : FOUND_SOURCES.slice(0, 3)));
    }, 1400);
  }

  return (
    <div className="flex flex-col border-t min-h-[calc(100vh-80px-var(--testnet-banner-h,0px))] lg:flex-row lg:h-[calc(100vh-80px-var(--testnet-banner-h,0px))] lg:overflow-hidden" style={{ background: 'var(--nib-page-bg)', color: 'var(--nib-page-fg)', borderColor: 'var(--nib-border-soft)' }}>
      <nav aria-label="Dr. Nib" className="flex w-full shrink-0 flex-col border-b lg:h-full lg:max-h-full lg:w-[248px] lg:overflow-y-auto lg:border-b-0 lg:border-r" style={{ background: 'var(--nib-page-bg)', borderColor: 'var(--nib-border-soft)' }}>
          {NAV.map((item, index) => {
            const Icon = item.icon;
            const active = nav === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setNav(item.id)}
                className={`dashboard-box box-${index} flex-1 w-full ${active ? "active" : ""}`}
                data-tab={item.id}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="dashboard-box-icon" aria-hidden="true" strokeWidth={1.8} />
                <span className="dashboard-box-label">{item.label}</span>
                <span className="dashboard-box-description">{item.desc}</span>
              </button>
            );
          })}
        </nav>
        <main className="min-w-0 flex-1 lg:h-full lg:overflow-y-auto" style={{ background: 'var(--nib-page-bg)' }}>
        <div className="p-4 md:p-6">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-black text-white">
              <Microscope size={20} aria-hidden="true" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-wider opacity-60">Nibgate</p>
              <h1 className="nibgate-display-title text-2xl font-medium leading-none">Dr. Nib</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-dark-gray/50 bg-white px-3 py-1 text-sm">
              {status === "complete" ? "Run complete" : status === "running" ? "Running" : status === "planned" ? "Plan ready" : status === "paused" ? "Paused" : "Idle"}
            </span>
            <button
              onClick={() => { setNav("research"); setStatus("draft"); setTopic(""); setSteps([]); setSources([]); setSpent(0); setTab("brief"); }}
              className="flex items-center gap-1 border border-dark-gray/50 bg-white px-3 py-1.5 text-sm font-medium hover:bg-gray"
            >
              <Plus size={14} aria-hidden="true" /> New run
            </button>
          </div>
        </header>

        {notice && (
          <div className="mb-4 flex items-center gap-2 border border-dark-gray/50 bg-white px-4 py-2 text-sm">
            <CircleAlert size={15} aria-hidden="true" /> {notice}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">
            {nav === "research" && (
              <>
                <div className="mb-3 flex gap-1 border-b border-dark-gray/40 text-sm">
                  {(["brief", "activity", "report"] as Tab[]).map((t) => (
                    <button key={t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-4 py-2 capitalize ${tab === t ? "border-black font-medium" : "border-transparent opacity-60"}`}>{t}</button>
                  ))}
                </div>

                {tab === "brief" && (
                  <section className="border border-dark-gray/50 bg-white p-5">
                    {status === "draft" && topic === "" && (
                      <div className="mb-5">
                        <p className="mb-2 flex items-center gap-2 text-sm font-medium"><Sparkles size={15} aria-hidden="true" /> Start with a sample</p>
                        <div className="flex flex-wrap gap-2">
                          {SAMPLE_BRIEFS.map((s) => (
                            <button key={s} onClick={() => setTopic(s)} className="border border-dark-gray/50 px-3 py-1.5 text-left text-sm">{s}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    <label className="block text-sm font-medium" htmlFor="drnib-topic">Brief</label>
                    <textarea id="drnib-topic" value={topic} onChange={(e) => setTopic(e.target.value)} rows={4}
                      placeholder="What should Dr. Nib research? Add focus, time range, or a decision to support."
                      className="mt-2 w-full resize-none border border-dark-gray/50 bg-gray px-3 py-2 text-sm outline-none" />
                    <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <label className="text-sm font-medium" htmlFor="drnib-depth">Depth</label>
                        <select id="drnib-depth" value={depth} onChange={(e) => setDepth(e.target.value)} className="mt-2 w-full border border-dark-gray/50 bg-gray px-3 py-2 text-sm">
                          <option value="quick">Quick — 1 pass</option>
                          <option value="standard">Standard — balanced</option>
                          <option value="deep">Deep — exhaustive</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium" htmlFor="drnib-cap">Budget cap (USDC)</label>
                        <input id="drnib-cap" type="number" min={0.1} step={0.1} value={budgetCap} onChange={(e) => setBudgetCap(Number(e.target.value) || 0)} className="mt-2 w-full border border-dark-gray/50 bg-gray px-3 py-2 text-sm" />
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                      <label className="flex items-center gap-2"><input type="checkbox" checked={liveWeb} onChange={(e) => setLiveWeb(e.target.checked)} /> Live web search</label>
                      <span className="opacity-60">Outputs:</span>
                      {["pdf", "word", "excel", "powerpoint"].map((f) => (
                        <label key={f} className="flex items-center gap-2 capitalize"><input type="checkbox" checked={formats.includes(f)} onChange={() => toggleFormat(f)} /> {f}</label>
                      ))}
                    </div>
                    {status === "planned" && (
                      <div className="mt-5 border border-dark-gray/50 bg-gray p-4">
                        <p className="text-sm font-medium">Plan</p>
                        <ul className="mt-2 space-y-1 text-sm">
                          {steps.map((s) => (<li key={s.id} className="flex items-center gap-2"><span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--nib-teal)" }} /> {s.label} <span className="opacity-60">— {s.detail}</span></li>))}
                        </ul>
                        <p className="mt-3 text-sm">Estimated cost: <strong>${estimate.toFixed(2)}</strong> · Depth: {depth} · Provider: {provider === "hub" ? "hub" : "bring your own"}</p>
                      </div>
                    )}
                    <div className="mt-5 flex gap-2">
                      <button onClick={planRun} className="border border-dark-gray/60 px-4 py-2 text-sm font-medium">Plan run</button>
                      {status === "planned" && (
                        <button onClick={approveRun} className="flex items-center gap-2 bg-black px-4 py-2 text-sm font-medium text-white"><Play size={15} aria-hidden="true" /> Approve &amp; run</button>
                      )}
                    </div>
                  </section>
                )}

                {tab === "activity" && (
                  <section className="border border-dark-gray/50 bg-white p-5">
                    {steps.length === 0 ? (
                      <p className="text-sm opacity-60">No run yet. Plan one from the Brief tab.</p>
                    ) : (
                      <ol className="space-y-3">
                        {steps.map((s) => (
                          <li key={s.id} className="flex items-start gap-3">
                            <span className="mt-0.5"><StepIcon status={s.status} kind={s.kind} /></span>
                            <div className="min-w-0 flex-1"><p className="text-sm font-medium">{s.label}</p><p className="text-xs opacity-60">{s.detail}</p></div>
                            <span className="text-xs opacity-60">${s.cost.toFixed(2)}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                    <div className="mt-4 flex items-center justify-between border-t border-dark-gray/40 pt-3 text-sm">
                      <span className="opacity-70">Spent ${spent.toFixed(2)} of ${budgetCap.toFixed(2)}</span>
                      <div className="flex gap-2">
                        {status === "running" && (<button onClick={() => setStatus("paused")} className="flex items-center gap-1 border border-dark-gray/60 px-3 py-1.5 text-sm"><Pause size={14} aria-hidden="true" /> Pause</button>)}
                        {status === "paused" && (<button onClick={() => setStatus("running")} className="flex items-center gap-1 border border-dark-gray/60 px-3 py-1.5 text-sm"><Play size={14} aria-hidden="true" /> Resume</button>)}
                      </div>
                    </div>
                  </section>
                )}

                {tab === "report" && (
                  <section className="border border-dark-gray/50 bg-white p-5">
                    {status !== "complete" ? (
                      <p className="text-sm opacity-60">The report appears here when the run finishes.</p>
                    ) : (
                      <>
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                          <h2 className="text-lg font-medium">Report</h2>
                          <div className="flex flex-wrap gap-2">
                            {["pdf", "word", "excel", "powerpoint"].map((f) => (
                              <button key={f} onClick={() => queueExport(f)} className="flex items-center gap-1 border border-dark-gray/60 px-3 py-1.5 text-xs font-medium uppercase"><Download size={13} aria-hidden="true" /> {f}</button>
                            ))}
                          </div>
                        </div>
                        <article className="text-sm leading-7">
                          {MOCK_REPORT.split("\n").map((line, i) =>
                            line.startsWith("## ") ? (<h3 key={i} className="mt-5 mb-2 text-lg font-medium">{line.replace("## ", "")}</h3>) : line.trim() === "" ? null : (<p key={i} className="my-3">{line}</p>)
                          )}
                        </article>
                      </>
                    )}
                  </section>
                )}
              </>
            )}

            {nav === "chat" && (
              <section className="flex h-[70vh] flex-col border border-dark-gray/50 bg-white">
                <div className="border-b border-dark-gray/40 px-4 py-3 text-sm">
                  <p className="font-medium">Chat</p>
                  <p className="text-xs opacity-60">Answers cite sources and spend from your budget.</p>
                </div>
                <div className="flex-1 space-y-4 overflow-y-auto p-4">
                  {messages.map((m) => (
                    <div key={m.id} className={m.role === "user" ? "flex justify-end" : ""}>
                      <div className={`max-w-[85%] whitespace-pre-wrap border px-3 py-2 text-sm ${m.role === "user" ? "border-black bg-black text-white" : "border-dark-gray/40 bg-gray"}`}>
                        {m.text}
                        {m.cites && m.cites.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {m.cites.map((c) => (<span key={c} className="rounded border border-dark-gray/50 bg-white px-1.5 py-0.5 text-[11px]">[{c}] {FOUND_SOURCES[c - 1]?.domain}</span>))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {thinking && (<div className="flex items-center gap-2 text-sm opacity-60"><Loader2 size={14} className="animate-spin" aria-hidden="true" /> searching…</div>)}
                </div>
                <div className="flex items-end gap-2 border-t border-dark-gray/40 p-3">
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} rows={2}
                    placeholder="Ask Dr. Nib…" className="flex-1 resize-none border border-dark-gray/50 bg-gray px-3 py-2 text-sm outline-none" />
                  <button onClick={send} disabled={thinking} className="flex h-10 w-10 items-center justify-center bg-black text-white disabled:opacity-50" aria-label="Send"><Send size={16} aria-hidden="true" /></button>
                </div>
              </section>
            )}

            {nav === "runs" && (
              <section className="border border-dark-gray/50 bg-white p-5">
                <h2 className="mb-3 text-lg font-medium">Runs</h2>
                <ul className="divide-y divide-dark-gray/30">
                  {PAST_RUNS.map((r) => (
                    <li key={r.title} className="flex items-center justify-between py-3 text-sm">
                      <div><p className="font-medium">{r.title}</p><p className="text-xs opacity-60">{r.when}</p></div>
                      <div className="text-right"><p className="text-xs uppercase opacity-60">{r.status}</p><p className="text-xs">${r.cost.toFixed(2)}</p></div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {nav === "sources" && (
              <section className="border border-dark-gray/50 bg-white p-5">
                <h2 className="mb-3 text-lg font-medium">Source library</h2>
                {sources.length === 0 ? (<p className="text-sm opacity-60">Nothing saved yet. Sources from runs and chats collect here.</p>) : (
                  <ul className="space-y-3">
                    {sources.map((s, i) => (
                      <li key={s.id} className="border border-dark-gray/40 bg-gray p-3">
                        <div className="flex items-start justify-between gap-2"><p className="text-sm font-medium">[{i + 1}] {s.title}</p><TrustChip trust={s.trust} /></div>
                        <p className="mt-1 text-xs opacity-60">{s.domain}</p>
                        <p className="mt-2 text-xs opacity-70">{s.snippet}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {nav === "budget" && (
              <section className="border border-dark-gray/50 bg-white p-5">
                <h2 className="mb-3 text-lg font-medium">Budget</h2>
                <p className="text-3xl font-medium leading-none">${balance.toFixed(2)}</p>
                <p className="mt-1 text-xs opacity-60">USDC available</p>
                <div className="mt-4">
                  <div className="flex justify-between text-xs opacity-70"><span>Spent this run</span><span>${spent.toFixed(2)} / ${budgetCap.toFixed(2)}</span></div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full" style={{ width: `${spentPct}%`, background: "var(--nib-teal)" }} /></div>
                </div>
                <button onClick={() => { setBalance((b) => Number((b + 5).toFixed(2))); flash("Top-up: pay 5 USDC over x402 — wired once the worker lands."); }}
                  className="mt-4 border border-dark-gray/60 px-4 py-2 text-sm font-medium">Top up USDC</button>
                <div className="mt-4 border-t border-dark-gray/40 pt-4 text-sm">
                  <p className="mb-2 font-medium">Provider</p>
                  <div className="flex gap-2">
                    <button onClick={() => setProvider("hub")} className={`flex-1 border px-2 py-1.5 ${provider === "hub" ? "border-black bg-black text-white" : "border-dark-gray/50"}`}>Hub</button>
                    <button onClick={() => setProvider("byo")} className={`flex-1 border px-2 py-1.5 ${provider === "byo" ? "border-black bg-black text-white" : "border-dark-gray/50"}`}>Bring your own</button>
                  </div>
                  <p className="mt-2 text-xs opacity-60">{provider === "hub" ? "LLM + tools charged to your budget." : "You pay the provider directly; budget covers tools only."}</p>
                </div>
              </section>
            )}
          </div>

          {/* Right rail */}
          <aside className="flex flex-col gap-4">
            <section className="border border-dark-gray/50 bg-white p-4">
              <p className="mb-3 flex items-center gap-2 text-sm font-medium"><Search size={15} aria-hidden="true" /> Sources</p>
              {sources.length === 0 ? (
                <p className="text-xs opacity-60">Sources appear here as the run finds and scores them.</p>
              ) : (
                <ul className="space-y-3">
                  {sources.map((s, i) => (
                    <li key={s.id} className="border border-dark-gray/40 bg-gray p-3">
                      <p className="text-sm font-medium leading-tight">[{i + 1}] {s.title}</p>
                      <div className="mt-1 flex items-center justify-between gap-2"><span className="text-xs opacity-60">{s.domain}</span><TrustChip trust={s.trust} /></div>
                      <p className="mt-2 text-xs opacity-70">{s.snippet}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="border border-dark-gray/50 bg-white p-4 text-sm">
              <p className="mb-2 font-medium">Cost</p>
              <div className="flex justify-between text-xs opacity-70"><span>Accrued</span><span>${spent.toFixed(3)}</span></div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-black/10"><div className="h-full rounded-full" style={{ width: `${spentPct}%`, background: "var(--nib-teal)" }} /></div>
              <p className="mt-2 text-xs opacity-60">Runs pause before they exceed the cap. Top up mid-run and it resumes.</p>
            </section>
          </aside>
        </div>
        </div>
      </main>
    </div>
  );
}

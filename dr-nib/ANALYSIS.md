# Dr. Nib — full analysis

*What it is, how it works, how the decision-making stays sophisticated,
what makes it different, why anyone should use it, and who pays.
Grounded in current research-agent literature (2025–2026).*

---

## 1. What Dr. Nib is (final)

**Dr. Nib is a research agent that converts a question plus a USDC budget
into a cited, exportable report — while showing its work and its spending.**

Not a chatbot. Not a search box. A *run*: scoped, budgeted, planned,
executed, verified, delivered. Every consequential choice inside the run is
a structured, auditable decision — not an LLM whim. That decision layer is
JEV, and it is the product as much as the report is.

One sentence for the landing page: **ask a question, set a budget, get a
report with receipts.**

---

## 2. How proper research agents work (the literature)

The field has converged on a four-stage pipeline (surveyed across
2512.02038, 2508.12752):

1. **Planning** — decompose the question into sub-questions/sub-tasks
   (parallel, sequential, or tree/DAG-structured).
2. **Question developing** — turn each sub-goal into diverse, targeted
   retrieval queries (not keyword matching; task-aware generation).
3. **Web exploration** — iterative retrieve → read → filter → re-query
   (agent-driven, not single-shot RAG).
4. **Report generation** — synthesize accumulated evidence into a coherent,
   cited response with consistency checks.

Production systems split this across specialized roles (OpenAI cookbook,
Anthropic multi-agent DR, ByteByteGo teardown):

| Role | Job |
|---|---|
| Triage | Is this a lookup, a full run, or underspecified? |
| Clarifier | 2–3 questions when the brief is ambiguous |
| Instruction builder | Rewrites the enriched brief into a precise plan |
| Research workers | Execute sub-tasks (search, fetch, extract) in parallel |
| Synthesizer | Merges evidence packets into narrative |
| Citation checker | Verifies every claim maps to a supporting passage |

Stopping rules used in practice: ≥2 independent sources per sub-question,
novelty exhaustion (new searches stop surfacing new facts), contradictions
resolved-or-documented, confidence thresholds met — plus hard caps
(~30–60 searches, ~120–150 fetches). On hitting a cap, ship a **partial
report that says what is missing** rather than padding.

Dr. Nib implements exactly this pipeline. The difference is *where the
decisions live* (Section 3).

---

## 3. Sophisticated decision-making with JEV

### 3.1 The core principle

The LLM proposes; **JEV disposes**. No consequential choice is ever "the
model felt like it." Every gate is a JEV question with explicit criteria,
logged inputs, and a calibrated output. This is directly the lesson of the
2026 judging literature:

- **Rulers (2601.08654):** reliable scoring needs *locked rubrics* (fixed
  interpretation, no per-call drift) + *evidence-grounded execution*
  (every score traceable to a passage) + *calibration* to human bands.
- **Autorubric (2603.00077):** use *analytic* (per-criterion) rubrics, not
  holistic scores; score criteria independently to avoid conflation; allow
  **abstention** (`CANNOT_ASSESS`) instead of forced judgments; ensembles
  beat single judges.
- **Trust–truth separability (2608.21097):** trust scores must **never** be
  treated as evidence for truth. A source can be trustworthy yet wrong on a
  specific claim, and vice versa.

JEV's question types map onto this one-to-one: `score` for graded criteria,
`choice` for selections, `noul` for support/stop verdicts.

### 3.2 Every decision in a run, specified

| Decision | JEV shape | Criteria (locked, analytic) |
|---|---|---|
| Triage: lookup / full run / clarify | `choice` | specificity, multi-hop-ness, evidence need |
| Sub-question coverage | `selectMany`-style batch | one question per checklist item, no overlap |
| Source relevance (per source × sub-q) | `score` 0..1 | topicality, specificity, recency — scored **independently** |
| Source trust (per source) | `score` 0..1, **separate channel** | authority, provenance, corroboration history — never fed as truth |
| Claim support (per claim × passage) | `noul` → Supported / Contradicted / Insufficient | exact-span match; Insufficient ⇒ mark Unknown, never fabricate |
| Section framing | `choice` among candidate outlines | coverage of checklist, narrative fit |
| Continue vs stop (per sub-q) | `noul` on marginal novelty | stop when expected new facts < threshold, or caps hit |
| Revision scope | diff-scoped re-verify | only touched claims + their citations re-checked |

### 3.3 Failure modes we design against (with receipts)

- **Intrinsic Knowledge Dependence** (LiveBrowseComp, 2605.28721):
  agents answer from parametric memory and use search only to confirm
  (up to 44.5% answered without tools; scores drop 25–40 points on
  recency-gated questions). **Counter:** evidence-led discovery is
  enforced — a claim with no retrieved passage is Unknown by construction,
  and our eval set includes recency-gated questions no model can know.
- **Citation recall gap** (BrowseComp-Plus): agents retrieve useful docs
  but fail to cite them. **Counter:** the citation checker is a separate
  pass over *retrieved* evidence, not over memory.
- **Revision regression** (MR DRE, ACL 2026): edits fix the target but
  break 16–27% of previously covered content/citations. **Counter:**
  reports are versioned immutably; revision is diff-scoped and prior
  verified claims are never rewritten, only superseded with a new version.
- **Last-mile over/under-retrieval** (DeepSearchQA): agents either miss
  the long tail or pad with low-confidence extras. **Counter:** explicit
  novelty-based stopping + hard caps + partial-report honesty.
- **Rubric artifacts** (2609.02942): judges can score from rubric text
  alone without reading the response. **Counter:** evidence-grounding is
  mechanical (span must exist in the passage), not vibes.

### 3.4 Calibration and audit

JEV probabilities are mapped to human bands (high/med/low) and logged
with inputs, criteria version, and model. Every run ships a **decision
trace**: which sources were considered, what each scored, which claims
were dropped and why. That trace is the sophistication — competitors bury
it in chain-of-thought; we surface it as a first-class artifact.

---

## 4. The Dr. Nib pipeline (concrete)

```
0. Intake      brief form + budget cap + provider (hub / BYO)
               → pre-flight validation (budget ≥ estimate floor)
1. Triage      JEV choice: lookup / run / clarify
2. Clarify     (if needed) 2–3 questions → enriched brief
3. Plan        decompose → sub-questions DAG → cost estimate → USER APPROVES
4. Acquire     per sub-q: generate queries → retrieve → rerank
               → JEV score (relevance + trust, separate) → keep top-k
               → novelty check → stop or continue (caps enforced)
5. Memory      evidence store: claim → passage → source → scores
               (dedupe + entity resolution)
6. Synthesize  draft per section from evidence ONLY
               unverified claim ⇒ marked Unknown, never written as fact
7. Verify      active fact-check over ALL claims (cited and uncited)
               JEV noul per claim; drop or flag unsupported
8. Deliver     report + sources + decision trace + exports (R2)
               full audit log; versions immutable
```

Budget gates at 0 (pre-flight), 3 (approve estimate), 4 (pause on
projected overrun → top up in real USDC), and 8 (final metered receipt).
Cost per *supported claim* is the unit of account, not cost per token.

---

## 5. What makes it different

| Incumbent | What they do | What Dr. Nib does instead |
|---|---|---|
| ChatGPT Deep Research | Great reports, subscription quota (10–250/mo), decisions invisible, no budget control | Usage-based per run, decision trace attached, spend visible per step |
| Perplexity | Fast answers, citations, no deep runs/budgets | Full runs with plan approval, caps, and exports |
| AlphaSense / Hebbia ($18k–$40k/seat) | Licensed-corpus enterprise intelligence | No $18k seat; pay per run; agent-readable outputs |
| Gemini Deep Research | Plan approval, then black box | Approval + live activity + trust-separated scoring |
| DIY RAG wrappers | "Synthesize faster" — no moat | Pays for gated sources mid-run (Subblogs/Nibshare via x402); proprietary corpus + receipts |

Three structural moats, not vibes:

1. **Decisions are auditable by construction** (Section 3). Nobody else
   ships the trace.
2. **Budget is a control plane**, not a bill afterward: estimate before,
   meter during, pause/top-up at 80/95/100%, receipt after.
3. **It can buy what others can't read**: paid sources unlock mid-run
   from the run budget (our own rails), turning the paywall from a dead
   end into a line item.

---

## 6. Why people should use it

- **Cheaper than the alternative, provably.** A standard brief costs
  $0.05–$1.32 in model spend depending on tier (route cheap models for
  extraction, premium only for final judgment). An analyst hour costs
  $100+. AlphaSense seats run ~$18k/year. Dr. Nib charges per run with
  the meter visible — buyers see exactly what each answer cost.
- **Receipts, not vibes.** Inline citations to exact passages, trust
  chips separated from truth verdicts, Unknown marked instead of
  hallucinated.
- **No subscription trap.** No quota rationing (10/mo), no seat licenses.
  Set a budget, spend it, top up.
- **Agent-readable.** The report ships with a machine evidence packet on
  the same rails agents already use (MCP/API) — an agent can verify,
  extend, or re-run any claim programmatically.
- **It pays its way into gated knowledge.** When the answer sits behind a
  paywall, the run buys it instead of pretending it doesn't exist.

---

## 7. ICP (who pays)

**Primary — feels the pain directly:**

1. **Independent analysts, creators, and boutique funds.** Priced out of
   $18k seats and $50–100k deals; need diligence-grade answers per
   question, not per seat. Usage-based is the only model that fits.
2. **Crypto-native and agent-forward teams.** Already hold USDC, already
   think in wallets and budgets, need reports machines can consume.
   Willing to pay per run because every TradFi alternative is seatware.
3. **Agent developers.** Need research with receipts as a *component*
   (evidence packets via API), not a destination. Pay per call.

**Secondary:** creator economy (sell the report itself as a paid product
through Nibshare/Subblogs); hackathon and open-source agent ecosystem
(distribution and credibility).

**Anti-ICP (not v1):** large enterprises needing licensed broker data,
compliance sign-off, and SSO — AlphaSense/Hebbia territory. We don't
chase entitlements; we win on open-web depth, receipts, and price.

**Willingness-to-pay anchor:** buyers already pay $20–200/mo for capped
quotas and $18k/seat for enterprise. A $0.50–$5.00 metered run with full
provenance undercuts both while showing its work.

---

## 8. Cost engineering (how runs stay cheap)

- **Route by stage, not by brand:** cheap models scan/extract/cluster;
  premium models only judge and write the final pass.
- **Retrieval quality is cost control:** better retrieval ⇒ fewer search
  calls ⇒ lower bills (BrowseComp-Plus: stronger retriever cut calls and
  lifted GPT-5 55.9→70.1). Invest in rerank, not just tokens.
- **Caps with honesty:** search/fetch/iteration ceilings per depth tier;
  on cap, ship a partial report that names what's missing.
- **Meter the unit that matters:** cost per *supported claim*, reported
  on every run. If it drifts, the pipeline — not the price — gets fixed.

---

## 9. How we know it's good (evaluation)

Internal harness, run continuously — not vibes:

- **Citation faithfulness:** fraction of claims with ≥1 supporting
  passage. Target: everything cited or explicitly Unknown.
- **Claim groundedness:** supported claims ÷ all claims (uncited claims
  get actively fact-checked, per DeepResearchEval).
- **Revision regression rate:** touched-claim fix rate vs prior-content
  breakage (MR DRE axis). Target: zero breakage outside the diff.
- **Stopping efficiency:** searches per supported claim; novelty-at-stop.
- **Cost per supported claim**, per depth tier.
- **Adversarial spot checks:** recency-gated questions (LiveBrowseComp
  lesson) that defeat memory, forcing real discovery.

---

## 10. Build plan (locked decisions)

- Backend worker runs the loop (survives tab close).
- Live web search + JEV scoring from v1 (no mocked corpus).
- DB-backed runs/sources/reports (immutable versions).
- Server-side exports to R2 (PDF/Word/Excel/PPT).
- x402/USDC metering with pre-flight estimate, live ticker,
  pause-and-top-up at 80/95/100%.

UI shell exists against mock data; the worker fills the same contract.
Next: schema → worker → `/hub/research` routes → live search wiring →
export renderers → eval harness.

---

## 11. Competitive teardown (what to steal)

Researched Sep–Oct 2026. Rule used throughout: steal mechanisms, not
marketing. Anything below marked STEAL is a concrete backlog item.

### Commercial deep-research modes

| Project | Does best | STEAL for Dr. Nib |
|---|---|---|
| OpenAI Deep Research | 4-agent split (triage → clarify → instruct → research); clarification loop; longest reports | Triage gate before spend; clarification as first-class step, not an afterthought |
| Perplexity | Inline numbered citations; 2–4 min runs; export PDF/Pages | Citation-first UX; short depth tier that still cites |
| Perplexity Model Council | Parallel dispatch to 3 models + chair synthesizing agreement/disagreement | "Deep" tier option: two-model cross-check with disagreement surfaced |
| Gemini Deep Research | Editable plan approval; Gmail/Drive context; async task manager (survives tab close, notifications); Canvas/audio outputs | Plan editing; async worker + notify on complete; internal-corpus sources |
| Grok DeepSearch | Native X/social signal | Social-listening as an optional source channel, clearly labeled low-trust |
| You.com ARI / Research API | Single effort dial lite→frontier with legible pricing | Effort dial already maps to our depth tiers; publish the price ladder |
| Claude Research/Projects | Best synthesis of contradictions; Projects for ongoing research | Contradiction sections as a report primitive; saved projects (recurring runs) |
| Valyu | arXiv/PubMed/SEC coverage; async webhooks | Academic/financial corpus channels; webhook completion |
| Parallel Task API | 9-tier price/latency ladder ($5–$2,400/1k) | Predictable per-depth pricing buyers can model |

Industry-wide convergences worth noting: dedicated research model IDs are
dead — everyone moved to flagship + **effort dial** (validates our
Quick/Standard/Deep); quotas (10–250/mo) vs our usage-based budget is an
open differentiation lane; async jobs with poll/webhook is the correct
shape past ~1 minute runtime (matches our backend-worker decision).

### Academic stack (the arXiv pipeline)

| Project | Does best | STEAL for Dr. Nib |
|---|---|---|
| Elicit (138M papers) | Semantic search + screening criteria (visible include/exclude) + extraction tables + Reports with **exact-quote** citations + editable intermediate steps; validated vs Big-3 by 17 PhDs | Exact-span citations; user-editable plan and source set; extraction tables as an output template |
| Consensus | Consensus meter (yes/no/mixed across literature) | Agreement meter for contested questions |
| Scite | Smart Citations: support / contrast / mention per paper | Verification layer: how a cited claim has held up since |
| NotebookLM | Bounded source-grounded synthesis; audio overviews, briefings, decks | "Answer only from these sources" mode; grounded-≠-complete warning shown in UI |
| ResearchRabbit / Connected Papers | Citation-graph discovery from seeds | Expand-from-seed discovery channel |
| STORM / Co-STORM | Perspective-guided question asking; simulated expert interviews; outline-first; mind-map shared space; human steer mid-run | Perspective generation per brief; outline view before writing; steerable runs |
| Zotero | Bibliography source of truth (BibTeX/RIS) | **BibTeX/RIS export** — required for the arXiv use case |

The academic workflow that wins is a *loop*, not a tool: discover (Elicit)
→ screen → extract (tables) → verify (Scite) → synthesize (NotebookLM)
→ cite (Zotero). Dr. Nib's pipeline already mirrors these stages; the
missing pieces are explicit and listed above.

Honest limits the literature forces on us: extraction accuracy needs
spot-checks (Elicit study: 70/90 prompts hit 87%, quotes/reasoning match
far lower); "retrieves a real paper" ≠ "summarizes it correctly"; trust
labels are triage signals, not verdicts. Our Unknown-marking and
mechanical span checks exist precisely for this.

### Open source

| Project | Does best | STEAL for Dr. Nib |
|---|---|---|
| GPT Researcher (28k stars) | Planner/execution/publisher split; Tavily default; MCP sources; PDF/DOCX; MCP server (gptr-mcp); ~$0.1–0.4/run; #1 DeepResearchGym | MCP-shaped source interface (hub corpus plugs in the same way); cheap-model routing per stage |
| LangChain Open Deep Research | LangGraph researcher→summarize→compress→report; model-agnostic; most actively maintained | Compression stage as an explicit step (context management is a feature) |
| Local Deep Research | Fully local (Ollama, SearXNG, encrypted storage) | Privacy story for sensitive briefs (later) |
| STORM (reference) | Pre-writing depth | Perspective + outline machinery (above) |

### Retrieval infra (where runs get cheap and good)

- **Tavily** ($0.008/credit): AI-native snippets, the default everywhere.
  Use for breadth.
- **Exa** ($0.005/search): neural/semantic ranking, own index, native
  research-paper + company + people categories, deep-researcher mode.
  Beats Tavily on deep F1 in independent benches (48.2 vs 41.0). Use for
  semantic and academic discovery.
- **Firecrawl**: extraction + JS rendering for hostile pages.
- **Jina Reader**: shared fetch backend.
- **Brave**: snippet-rich surface (fewer fetches needed).
- Key paper (2607.10198): provider choice is a *policy* choice — pair
  each provider with a provider-aware fetch policy; run Tavily (coverage)
  + Exa (semantic) in parallel and treat disagreements as signals.

**Retrieval decision for Dr. Nib:** multi-provider from day one (Tavily
for breadth, Exa for semantic/academic, Firecrawl/Jina for extraction),
metered per call into the run budget. Never marry one index.

### Output formats (user's call: "up to the prompter")

Brief (default), executive one-pager, slide deck outline, extraction
table, academic thesis (abstract/methodology/results/references +
**BibTeX**), mind-map outline. Format picker in the brief form; the
pipeline is format-agnostic until synthesis.

---

## 12. Code-level mechanisms stolen from open source (repos cloned Sep 2026)

Read directly from `gpt-researcher`, `open-deep-research`, and `storm`
source. These are implementation patterns, not ideas.

### GPT Researcher

- **Retriever abstraction with a `requires_scraping` flag.** Each provider
  declares whether it returns previews (must scrape) or prefetched content.
  Multi-provider (`RETRIEVER="tavily,exa"`) with fallback to default.
  → Our retrieval layer copies this contract exactly.
- **Tiered model routing with token budgets:** FAST / SMART / STRATEGIC
  tiers, each with token limits, plus per-step cost accounting
  (`add_costs` / `get_step_costs`). → Our cost router + live ticker.
- **Bounded everything:** `MAX_ITERATIONS=3`, `MAX_SUBTOPICS=3`,
  scrape worker pool with rate limiting, deep mode with
  breadth/depth/concurrency caps. → Our caps per depth tier.
- **ChiefEditor graph with a fact_checker node and bounded revisions.**
  → Our verify pass, with revision caps.
- **Context compression as an explicit stage** (recursive split +
  embeddings filter, fast path under threshold). → Our compress step.
- **Single markdown source → PDF/DOCX converters**
  (md2pdf, mistune→htmldocx). → Our server exporters.
- **MCP both directions:** consume MCP sources *and* expose a
  `deep_research` MCP server. → Our hub corpus as MCP-like source, and
  our worker eventually callable the same way.
- **Deep mode:** tree exploration with depth/breadth, concurrency
  semaphore, context trimmed to word limit. → Our Deep tier.

### LangChain Open Deep Research

- **Research brief as a persisted artifact** passed between nodes.
  → Our brief form already is this; persist it on run creation.
- **Compress stage with retry-on-token-limit** (drop history, retry).
  → Copy the retry discipline verbatim.
- **Supervisor fan-out with `max_concurrent_research_units=5`** and
  overflow errors. → Our parallel sub-question cap.
- **Clarify gate** (`need_clarification` → wait for user). → Our triage.
- **Gap they leave open (we fill):** no approval gate before running,
  citations rely on prompt instruction with no validation pass.
  → Our Approve & run + mechanical span checks.

### STORM / Co-STORM

- **Perspective discovery** from related articles' tables of contents,
  then perspective-guided question asking. → Enrich our Plan step:
  generate angles before sub-questions.
- **Simulated writer/expert conversations** grounded on retrieved
  sources per turn. → Our acquire loop's Q&A shape.
- **Trust filter first:** ~200-domain blocklist (Wikipedia perennial
  sources) applied *before* LLM judgment. → Cheap rule gate before
  expensive JEV scoring.
- **Outline: draft parametric, then refine with evidence.**
  → Our outline view works exactly this way.
- **Section-by-section writing** with citation-index merging, dedup,
  and polish passes. → Our synthesize step.
- **Co-STORM moderator** mines *uncited* retrieved material for new
  questions; **mind map** as shared conceptual space; human steer
  mid-run. → Moderator-style gap-fill + outline view + steerable runs.

---

## 13. UI patterns & flows (researched)

Surveyed: Tempest/Mastra workspace shells, VS Code-pane libraries,
Dr. Claw (auditable loop), InterDeepResearch (coordinated views),
long-running-job UX literature, LangGraph streaming guidance.

**Field convergences we already match:** left nav for sessions/runs +
center work area + right contextual rail; chat and workspace as dual
panes; jobs as durable objects with lifecycle states
(queued/running/paused/complete/failed/canceled).

**Upgrades adopted into the UI contract:**

1. **Pause / resume / cancel with honest semantics.** Cancel means
   "stop after this step" (never mid-write); retry always creates a
   new run and keeps the original as history.
2. **Stale detection.** Worker heartbeats; UI shows "updated Xs ago" +
   manual refresh instead of pretending a dead run is alive.
3. **Completion path.** Notify on finish; runs stay discoverable in
   Runs; success states summarize what changed (sources, claims, spend).
4. **Cross-view linkage.** Click a citation → highlight the source;
   click a source → show the claims it supports (backtrace pattern).
5. **Mid-run steer.** Inject an instruction or skip a step without
   restarting (takeover pattern).
6. **SSE vocabulary, product language.** Small stable event names
   (`step.started`, `source.scored`, `paused`, `complete`, `failed`);
   compact payloads; reconnect replays durable state; slow poll fallback.
7. **Copy that answers "can I leave?"** Every long state says what
   happens on navigate-away and what the next action is.
8. **Fill contracts.** Stretch layouts manage internal scroll; start
   layouts flow. No nested page scroll.



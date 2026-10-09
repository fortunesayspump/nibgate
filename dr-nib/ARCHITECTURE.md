# Dr. Nib — backend architecture

*Separate service (`dr-nib/backend/`), separately hosted. Frontend lives
in the hub. This is a worker + API architecture — not a cron job, not a
script.*

## 1. System overview

```
hub frontend (/dr-nib) ──HTTPS/SSE──▶ dr-nib/backend ──▶ hub /hub/jev/*
        │                                    │
        │                              ┌─────┴──────┐
        │                              ▼            ▼
        │                        Postgres      Redis (BullMQ)
        │                              │            │
        └────────────── R2 (exports) ◀──┴── retrieval APIs ──▶ Tavily / Exa / Firecrawl
```

- **API process**: Express, stateless, serves UI + enqueues jobs.
- **Worker processes**: run pipeline stages, stream events, meter spend.
  Horizontally scalable; survives deploys via durable queue.
- **Postgres**: run state, evidence, ledger (own tables; may share the
  hub cluster, never hub tables).
- **Redis**: BullMQ queues, rate limits, idempotency keys.
- **R2**: rendered exports (same bucket conventions as hub media).

## 2. API surface (`/v1`)

| Method + path | Purpose |
|---|---|
| `POST /v1/runs` | Create run from topic (generates first intake question) |
| `GET /v1/runs` | List runs (filter by status) |
| `GET /v1/runs/:id` | Run + plan + steps + sources + decisions + recent events + live budget |
| `POST /v1/runs/:id/answers` | Answer intake question (advances transcript, may reframe) |
| `POST /v1/runs/:id/configure` | Set depth/cap/formats → planning → plan |
| `POST /v1/runs/:id/approve` | Approve plan → enqueue execution (gated on estimate + escrow Funded when escrowed) |
| `POST /v1/runs/:id/pause` / `/resume` | Cooperative pause (durable, resumable) |
| `GET /v1/runs/:id/events` | SSE: steps, tool calls, status, questions (replayable by seq) |
| `POST /v1/runs/:id/awaiting/answer` | Answer a mid-run parked question |
| `POST /v1/runs/:id/guidance` | Steer a moving run (applies at stage boundary) |
| `POST /v1/runs/:id/revise` | Reprompt: new version, full re-execution + prompt steering |
| `POST /v1/runs/:id/escrow` | Open onchain job (provider=splitter, evaluator=keeper) |
| `GET /v1/runs/:id/escrow` | Local record + live onchain job status |
| `POST /v1/runs/:id/escrow/complete` | Keeper submit+complete with ledger spend, returns split signature |
| `GET /v1/runs/:id/report` | Latest report version + citations |
| `POST /v1/runs/:id/exports` | Enqueue render `{md,json,bibtex}` |
| `POST /v1/budgets/:id/topup` | Raise cap (raise-only) |
| `GET /v1/budgets/:id` | Balance, holds, spend by category |

Auth: wallet session (same SIWE pattern as hub) for UI; service key for
agent callers. Every mutating route is idempotency-keyed.

## 3. Data model (own tables)

| Table | Key fields | Lifecycle |
|---|---|---|
| `research_run` | id, brief JSON, plan JSON, depth, status, budget_cap, provider, versions | draft → planned → running → paused → complete/failed |
| `research_step` | run_id, kind, status, input/output refs, cost, started/finished | append-only per run |
| `research_source` | run_id, url, title, domain, passage refs, relevance, trust, cost | deduped by normalized URL |
| `research_claim` | run_id, text, status (supported/contradicted/unknown), passage refs | append-only; never rewritten |
| `research_report` | run_id, version, markdown, citations JSON | immutable versions; revise creates n+1 |
| `research_export` | run_id, report_version, format, r2_key, status | async render jobs |
| `budget_ledger` | run_id, kind (deposit/spend/fee/refund), amount, txRef | append-only; source of truth |
| `research_decision` | run_id, step, question, criteria version, inputs, output | append-only; powers the trace |

Money rule: ledger is append-only; no negative balances (enforced in a
transaction with the spend write); reconciliation job compares ledger
against on-chain receipts nightly.

## 4. Worker design (the opposite of a cron job)

- **BullMQ** queues: `run.plan`, `run.acquire` (fan-out per
  sub-question), `run.synthesize`, `run.verify`, `run.export`.
  Concurrency caps per queue; per-depth budgets enforced by a gate
  before each dequeue.
- **Durable + resumable:** every step checkpoints to Postgres; workers
  are stateless and can be killed/restarted mid-run. Pause sets a flag
  the worker checks between steps — no lost work, resume continues.
- **Graceful shutdown:** SIGTERM drains in-flight steps (finish current
  LLM call, checkpoint, exit).
- **Heartbeats + leases:** long steps renew a lease; a sweeper requeues
  orphaned jobs. No silent stalls.
- **Local dev:** same code, in-process queue adapter (no Redis needed).

## 5. Pipeline execution detail (as built)

- **Intake:** topic → generated-or-banked questions, one at a time; each
  answer sharpens the brief and records model thinking. JEV owns stop/go
  (`proceed`/`ask_more`) and can veto the frame (`reframe` → next question
  opens a different angle). Ends in `intake-done`.
- **Plan:** brief → sub-questions + uncertainties + cost estimate (LLM with
  deterministic fallback) → persists → awaits approve.
- **Acquire (rounds):** per round: search (sub-questions keyword-ified,
  fanned across all providers) → fetch (ranked pages opened, PDFs and
  Office docs parsed) → data (model-directed http/sandbox/spend calls when
  retrieval is thin) → score (relevance from ranking, trust from JEV per
  source) → round review (learnings + follow-ups, JEV continue/write/stop).
- **Write:** sections from scored evidence only, citations or `(unsupported)`;
  advice notice on sensitive topics.
- **Verify + claims:** claim extraction with JEV support judgements.
- **Settle:** ledger settle + optional onchain escrow complete + split.
- Every stage skips when already done (resume/reprompt safe), charges through
  `draw()`, parks loudly on failure — never silent stalls.
- **Export:** markdown/JSON/BibTeX plus PDF/Word/Excel/PowerPoint renders for
  download; binary formats are returned base64 (R2 object streaming is a later
  optimization).

## 6. Retrieval layer (free-first, as built)

Provider contract: `{url, title, snippet|content, score, provider}` + per-
provider outcome rows `{name, ok, count|error}` surfaced, never averaged.
Keyed pair (Tavily breadth, Exa semantic) joins only when configured; the
free bench always runs: SearXNG (self-hosted, `SEARXNG_URL`), GDELT (news,
paced), Wikipedia, OpenAlex, Semantic Scholar, Crossref, SEC EDGAR,
Stack Exchange, Hacker News, Polymarket, arXiv. Direct extraction opens
result URLs (robots + paywalls respected, PDFs/Office parsed, bot-blocks
named). Every provider call is circuit-broken; every tool call metered
into the run budget with its result on the event log.

## 7. JEV integration

The worker calls JEV as a service (hub `/hub/jev/*` or shared package —
same API either way). Decision table in `ANALYSIS.md` §3.2 is the
contract: relevance `score`, trust `score` (separate channel), claim
support `noul`, framing `choice`, stopping `noul`, revision diff-scoped.
Criteria versions pinned per run; all inputs/outputs logged to
`research_decision`.

## 8. Budget engine

- Price table per stage (search call, fetch, score call, write tokens,
  export render) versioned in config.
- Pre-flight estimate from plan; approve requires balance ≥ estimate.
- Per-step metering with hold-and-settle (hold estimate, settle actual,
  release difference).
- Pause at 80/95/100% with top-up intent (x402); resume continues.
- Unit reported everywhere: cost per supported claim.

## 9. Exports

Markdown single source → format renderers → R2 (`research/{run}/...`)
with immutable content hashes. Formats: PDF, DOCX, XLSX (data appendix),
PPTX (deck outline), MD, JSON evidence packet, BibTeX. Signed URLs with
expiry; public links opt-in per run.

## 10. Streaming + UX contract

SSE events: `plan.ready`, `step.started`, `step.finished`,
`source.scored`, `cost.tick`, `paused`, `resumed`, `report.ready`,
`export.ready`, `failed` (what/why/next). The hub UI (`frontend/src/app/dr-nib/`)
consumes the live API — not mock data.

## 11. Eval harness (continuous, not vibes)

Nightly + per-deploy: citation faithfulness, claim groundedness
(incl. uncited claims), revision regression rate, stopping efficiency,
cost per supported claim per tier, recency-gated spot checks. Budgets
fail the build before quality regressions ship.

## 12. Ops

- Separate Railway service, own env, own deploy pipeline; shares
  Postgres cluster and R2 bucket by convention, nothing else.
- Structured logs with run_id on every line; metrics per stage
  (duration, cost, items); alerts on stuck runs (lease expiry) and
  budget anomalies.
- Secrets: provider keys, retrieval keys, x402 facilitator creds —
  env-only, never in DB or logs.

## Build status

Superseded by the audited Done/Partial/Pending table in `README.md` — this
section is kept only as the original sequencing record.

1. Schema + migrations — **done** (`prisma/schema.prisma`, `drnib` schema).
2. API + worker (mocked → live) — **done**; UI consumes the live API.
3. Queue + plan/approve/pause lifecycle — **done** (inline + BullMQ).
4. Retrieval adapters + metering — **done** (11 free indexes + keyed pair).
5. JEV wiring per decision table — **done** (`src/jev/`).
6. Synthesize + verify passes — **done** (`src/verify.js`).
7. Export renderers — **done**: md/json/bibtex + pdf/word/excel/powerpoint
   (`src/exports/render.js`); R2 streaming is a later optimization (base64
   today).
8. Eval harness + gates — **done** (`src/evals/`, `GATES.md`).

Escrow (ERC-8183 + splitter) is implemented beyond this original sequence:
contracts deployed on Arc testnet, backend `src/escrow/jobs.js`, routes, and
the hub deposit UI — see `ESCROW.md` (keeper key wired locally; pending: service env + app soak).

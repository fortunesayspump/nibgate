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
| `POST /v1/runs` | Create run from brief (validates budget ≥ estimate floor) |
| `GET /v1/runs` | List runs (filter by status) |
| `GET /v1/runs/:id` | Run + plan + cost summary |
| `POST /v1/runs/:id/approve` | Approve plan → enqueue execution |
| `POST /v1/runs/:id/pause` / `/resume` | Cooperative pause (durable, resumable) |
| `GET /v1/runs/:id/events` | SSE: step started/finished, source scored, cost tick, paused, complete |
| `POST /v1/runs/:id/revise` | Diff-scoped revision (new version, old immutable) |
| `GET /v1/runs/:id/report` | Latest report version + citations |
| `POST /v1/runs/:id/exports` | Enqueue render `{format}` → R2 |
| `GET /v1/runs/:id/exports/:exportId` | Signed download URL |
| `POST /v1/budgets/:id/topup` | x402 USDC top-up intent → receipt |
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

## 5. Pipeline execution detail

- **Plan:** brief → sub-question DAG (parallel/sequential marks) →
  cost estimate from per-stage price table → persisted → awaits approve.
- **Acquire (fan-out):** one job per sub-question (cap: 5 concurrent).
  Each: generate queries → retrieve (multi-provider) → rerank → JEV
  score (relevance + trust, separate calls) → keep top-k → emit events.
- **Novelty gate:** track seen fact-hashes per sub-question; stop when
  marginal novelty < threshold or caps hit (searches/fetches/iterations
  per depth tier).
- **Synthesize:** draft per section from evidence store only; claims
  without passages marked Unknown at write time.
- **Verify:** active fact-check over all claims; JEV noul per
  claim × passage; unsupported claims dropped or flagged; report
  versioned.
- **Export:** markdown single-source → renderers (PDF/DOCX/XLSX/PPTX) →
  R2 → signed URL.

## 6. Retrieval layer (stolen, then owned)

Provider contract (from GPT Researcher): `{url, title, snippet|content,
metadata}` + `requires_scraping` flag. Providers: Tavily (breadth),
Exa (semantic/academic), Firecrawl/Jina (extraction). Provider-aware
fetch policies; disagreements between providers surfaced, not averaged.
Hub corpus + user uploads mount as additional providers. Every call
metered into the run budget.

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
`export.ready`, `failed` (what/why/next). The hub UI shell already
renders these against mock data; the worker fills the same contract.

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

## Build order

1. Schema + migrations (`ResearchRun` → ledger last, money first in
   review).
2. API skeleton with mocked worker (UI already consumes it).
3. Queue + plan/approve/pause lifecycle.
4. Retrieval adapters + metering.
5. JEV wiring per decision table.
6. Synthesize + verify passes.
7. Export renderers → R2.
8. Eval harness + dashboards.

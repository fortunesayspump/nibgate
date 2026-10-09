# Dr. Nib — the tameion for AI spend

**Ask a question, set a USDC budget, get a cited report with receipts.**
Dr. Nib is a research agent *and* the business version of itself: the
spend-governed operator pattern, applied first to research and built to
generalize to any budget an agent touches.

## Why it exists

Every company is now bleeding on AI costs with zero controls — no budgets,
no per-step metering, no receipts. Dr. Nib is the answer in miniature:
an agent that holds a budget, plans before it spends, meters every step,
pauses instead of overspending, and logs every decision. Research is the
first job; the pattern is the product.

## Tameion fit (RFB 04 primary)

Dr. Nib is **RFB 04 · Autonomous Business Operator** applied to research
spend. Their demo workflow maps 1:1 onto a run:

| RFB 04 asks for | Dr. Nib run does |
|---|---|
| Receive revenue → assess liquidity | Fund budget → plan + cost estimate |
| Purchase a service inside policy | Buy steps/sources inside the cap |
| Record the decision + transaction | Decision trace + budget ledger |
| Escalate only on policy breach | Pause + top-up prompt at 80/95/100% |

Nibgate rails carry RFB 02/03 (receipts + ledger for AP/AR; hold →
claim → release/refund + reputation for vendor escrow). RFB 01
(idle-cash yield) is explicitly out of scope; RFB 05 gets our audit
half (append-only decision record).

Judging alignment: **agency** (JEV decides and explains),
**traction** (real businesses, real USDC), **Circle stack** (Gateway,
Wallets, USDC/x402 throughout), **innovation** (decision trace +
budget control plane + buying gated sources mid-run).

## The two products in one

1. **Research tool** (this repo + hub UI): brief → plan → acquire →
   verify → cited report + exports. For analysts, creators, funds.
2. **Business operator pattern**: budget wallet, policy gates, metering,
   audit log — reusable for any agent spend. For companies.

Same backend, same ledger, same trace. The brief changes; the money
machinery doesn't.

## Demand (why now, with numbers)

- Enterprise seats run ~$18k/yr (AlphaSense median) with $50–100k deals;
  buyers pay for analyst-hours saved, not software.
- Capped quotas (10–250 research runs/mo) ration the exact users who
  need volume; usage-based with visible metering is the open lane.
- The industry converged on flagship + effort dial (Quick/Standard/Deep)
  and async jobs — our shape matches; our budget layer is the
  differentiator nobody ships.

## Layout

| Path | What | Hosted |
|---|---|---|
| `dr-nib/backend/` | Worker service: pipeline, budget engine, exports, eval | Separately (own Railway service) |
| `frontend/src/app/dr-nib/` + `frontend/src/components/dr-nib/` | Hub UI (research, projects, sources, settings, escrow deposit) | Hub frontend |
| `dr-nib/references/` | Third-party implementations we learn from (gitignored, re-fetchable) | — |
| `dr-nib/ANALYSIS.md` | Full analysis: pipeline, JEV sophistication, teardown, ICP | — |
| `dr-nib/ARCHITECTURE.md` | Service design: API, DB, worker, budget, exports, eval | — |

Backend and hub share nothing except the JEV package and the payments
rails. Hub content is referenced by ID, never joined; the run ledger is
the source of truth for spend.

## Money rules

- Pays only when JEV judges acquisition justified — economic agency,
  not auto-pay.
- Pre-flight estimate, per-step metering, pause-and-top-up at
  80/95/100%. Runs never overspend; they pause.
- Cost per *supported claim* is the unit of account.
- Real USDC on whichever network the deployment targets.

## Status

Last audited **2026-10-07** against the code on disk. Legend: **Done** =
implemented and covered by tests; **Partial** = implemented but not
wired/enforced end-to-end; **Pending** = not built. Code existing is *not*
the same as a run having executed — runtime verification is a separate row.

| Area | State | Where / notes |
|---|---|---|
| Backend service | Done | `dr-nib/backend/`: Express + Prisma (own `drnib` schema), worker + inline/BullMQ queue, `/v1` runs+budgets+exports+x402, `/mcp` |
| Intake → plan → approve → pause/resume → revise | Done | JEV owns stop/go/reframe; cooperative pause; reprompt = new report version |
| Agent loop (propose–judge–execute) | Done | `src/agent/`: stops, self-model, DB-backed lessons, limits, dedupe/streak guards |
| JEV integration | Done | `src/jev/{client,decisions,intake}`; parks (never fabricates) when JEV is unreachable |
| Retrieval | Done | SearXNG, GDELT, Wikipedia, OpenAlex, Semantic Scholar, Crossref, EDGAR, Stack Exchange, HN, Polymarket, arXiv + keyed Tavily/Exa/direct |
| Tools | Done | `src/tools/`: http, web_fetch/search, run_code sandbox (Railway), compute, evidence, tip/unlock/x402 spend |
| Budget engine | Done | `src/money.js`: append-only ledger, 1% fee on drawdown, raise-only caps, settle/refund |
| Spend policy + guard | Done | per-call ceilings, run-balance gate, verdict binding, dual-RPC when configured |
| Verify + claims | Done | `src/verify.js`: JEV support judgements; `unverified` when JEV/LLM absent |
| Exports | Done | md / json / bibtex + pdf / word / excel / powerpoint (`src/exports/render.js`); binary formats returned base64 (R2 streaming is a later optimization) |
| Evals + build gates | Done | `src/evals/`, `GATES.md`; gates fail the build |
| MCP server | Done | tools call the same route code paths; service-key gated |
| Escrow — contracts | Done (testnet) | stock ERC-8183 core + `NibgateRunSplitter`, deployed Arc testnet; job 10 lifecycle proven (`ESCROW.md`) |
| Escrow — backend | Done | `src/escrow/jobs.js` create/status/submit+complete/signSplit; `/v1/runs/:id/escrow*` |
| Escrow — frontend | Done | `frontend/src/components/dr-nib/EscrowDeposit.tsx`; opt-in in `research/page.tsx`; approve gated on `Funded` |
| Escrow — env wiring | Done (local) | `ESCROW_KEEPER_KEY` wired in `dr-nib/backend/.env`; `isEscrowConfigured()` = true and onchain job 10 reads `Completed`. Deploys still set it on the service (see `DEPLOY.md`) |
| Gate 1 — wallet policy | **Pending** | no vendor deployable on Arc (CDP dead); the `NibgateSpender` onchain cap is the practical substitute (`GATES.md`) |
| Gate 2 — spend mandate (onchain cap) | Partial (ops) | `NibgateSpender` deployed testnet `0x903b0606…` ($2/day, not paused); code already routes tips via `spend()` — remaining work is fund + allowlist + set `DRNIB_SPENDER_ADDRESS` |
| Frontend UI | Done | `/dr-nib` research / projects / sources / settings + detail; renders on mainnet (real spend) and testnet (testnet-funded staging) |
| **Live end-to-end run** | **Partial** | Executed 2026-10-07 (run `80bf1397` complete, `afd319f4` browser partial — see `TESTS.md`). Harness lives in gitignored local-only `e2e/` |

`ARCHITECTURE.md` remains the design reference; the historical build order
there is superseded by this table.

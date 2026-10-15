# Dr. Nib — the tameion for AI spend

**Ask a question, set a USDC budget, get a cited report with receipts.**
Dr. Nib is a research agent *and* the business version of itself: the
spend-governed operator pattern, applied first to research and built to
generalize to any budget an agent touches.

## Current release scope

Funded research is available on Arc testnet and mainnet. The mainnet core and splitter are deployed, the keeper is funded, and the API and worker have the escrow settings; live health reports `acceptingRuns: true`. A signed-in mainnet browser run completed funding, research, report delivery, onchain settlement, and refund on 15 Oct 2026. External escrow review has not been evidenced. Private R2 originals and owner-only previews passed live write/read checks. See `docs/src/app/dr-nib/` for supported behavior and limits, and `TESTS.md` for dated evidence. Historical FLOW/UX documents contain proposals, not shipped-feature guarantees.

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
| Escalate only on policy breach | Pause at cap; on escrowed runs the pause names end-or-new-run (deposits are one-shot) |

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
| `frontend/src/app/dr-nib/` + `frontend/src/components/dr-nib/` | Hub UI (research, projects, sources, help, escrow deposit) | Hub frontend |
| `dr-nib/references/` | Third-party implementations we learn from (gitignored, re-fetchable) | — |
| `dr-nib/ANALYSIS.md` | Full analysis: pipeline, JEV sophistication, teardown, ICP | — |
| `dr-nib/ARCHITECTURE.md` | Service design: API, DB, worker, budget, exports, eval | — |

Backend and hub share nothing except the JEV package and the payments
rails. Hub content is referenced by ID, never joined; the run ledger is
the source of truth for spend.

## Money rules

- Pays only when JEV judges acquisition justified — economic agency,
  not auto-pay.
- Pre-flight estimate, per-step metering, pause at cap. Runs never
  overspend; they pause. On escrowed runs the deposit is one-shot, so an
  exhausted pause ends (report kept, remainder refunded) or restarts
  bigger as a new run — never a top-up the chain cannot accept.
- Cost per *supported claim* is the unit of account.
- Real USDC on whichever network the deployment targets.

## Status

Last audited **2026-10-11** against the code on disk. Legend: **Done** =
implemented and covered by tests; **Partial** = implemented but not
wired/enforced end-to-end; **Pending** = not built. Code existing is *not*
the same as a run having executed — runtime verification is a separate row.

| Area | State | Where / notes |
|---|---|---|
| Backend service | Done | `dr-nib/backend/`: Express + Prisma (own `drnib` schema), worker + inline/BullMQ queue, `/v1` runs+budgets+exports+x402, `/mcp` |
| Intake → plan → approve → pause/resume → revise | Done | JEV owns stop/go/reframe; cooperative pause; settled budgets require a fresh funded run |
| Agent loop (propose–judge–execute) | Done | `src/agent/`: stops, self-model (balance + cap + estimate + elapsed + status), DB-backed lessons, limits, dedupe/streak guards |
| JEV integration | Done | `src/jev/{client,decisions,intake}`; parks (never fabricates) when JEV is unreachable |
| Retrieval | Done | SearXNG, GDELT, Wikipedia, OpenAlex, Semantic Scholar, Crossref, EDGAR, Stack Exchange, HN, Polymarket, arXiv + keyed Tavily/Exa/direct + OpenRouter web_search over the LLM key |
| Tools | Done | `src/tools/`: http, web_fetch/search, run_code sandbox (Railway), compute, evidence, tip/unlock/x402 spend |
| Budget engine | Done | `src/money.js`: append-only ledger, 1% fee on drawdown, raise-only caps (never past the onchain deposit), settle/refund |
| Spend policy + guard | Done | per-call ceilings, run-balance gate, verdict binding, dual-RPC when configured |
| Verify + claims | Done | `src/verify.js` samples claims across report sections after every write (claims cleared per report): JEV support judgements; pass marked unverified when JEV/LLM absent or report input exceeds the cap; coverage badge + claim×source matrix read the sampled verdicts |
| Exports | Done | md / json (+escrow receipt block) / bibtex + pdf / word / excel (+escrow columns on Ledger) / powerpoint (`src/exports/render.js`); binary formats returned base64 (R2 streaming is a later optimization) |
| Evals + build gates | Done | `src/evals/`, `GATES.md`; gates fail the build |
| MCP server | Implemented | v0.2.6: named-source previews plus private source attach/list/read with image OCR, typed input schemas, shared end/settlement gates; trusted server-only service key; fallback plans cannot be funded |
| Escrow — contracts | Done (testnet) | stock ERC-8183 core + `NibgateRunSplitter`, deployed Arc testnet; job 10 lifecycle proven (`ESCROW.md`) |
| Escrow — backend | Done | `src/escrow/jobs.js` create/status/submit+complete/signSplit; `/v1/runs/:id/escrow*`; funding floor is the plan estimate, working cap aligns down to the deposit |
| Escrow — frontend | Done | `frontend/src/components/dr-nib/EscrowDeposit.tsx` (amount selector, min estimate, sequential receipts); mandatory where configured in `research/page.tsx`; approve gated on `Funded` ≥ estimate |
| Escrow — env wiring | Testnet and mainnet live | Funded runs 28 and 29 completed and split/refunded on testnet. Mainnet browser run `3d7ea349-1510-43d4-a2d8-2dc4fc598f62` completed escrow job 1 and its onchain split/refund. See `TESTS.md`. |
| Gate 1 — wallet policy | **Pending** | no vendor deployable on Arc (CDP dead); the `NibgateSpenderV2` onchain cap is the practical substitute (`GATES.md`) |
| Gate 2 — spend mandate (onchain cap) | Live direct-tip proof on both networks | Testnet `NibgateSpenderV2` `0x8F636a1a…` was funded with 1 test USDC. Mainnet V2 `0xae39444c…` was funded with 0.05 USDC. Each deployed worker routed a 0.02 USDC creator tip through V2 and received a hub receipt. Recipients are open; held tips and Gateway purchases remain EOA-funded. |
| Frontend UI | Done | `/dr-nib` research / projects / sources / help + detail on testnet and mainnet; review labels unfundable placeholder plans. Settlement receipt, coverage badge + claim×source matrix, version-pinned owner-only report links, version steer display, report Q&A, duplicate runs, feed timestamps + jump-to-latest |
| **Live end-to-end evidence** | Testnet and mainnet funded lifecycles verified | Funded testnet browser runs 28/29 and QA run 33, seven exports, multi-round JEV decisions and onchain split/refunds verified. Mainnet signed-in intake, private CSV upload, model planning, owner-visible report, JEV write choice, settlement, and 0.410249 USDC refund verified in run `3d7ea349-1510-43d4-a2d8-2dc4fc598f62`. Separate deployed-worker checks proved direct creator tips on both networks and a mainnet x402 article purchase. Autonomous paid-source selection and tipping inside a funded run, plus human-scored quality, remain unproven; see dated `TESTS.md`. QA artifacts remain in ignored `e2e/`. |

`ARCHITECTURE.md` remains the design reference; the historical build order
there is superseded by this table.

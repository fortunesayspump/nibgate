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
| `frontend/src/app/dr-nib/` + `frontend/src/components/dr-nib/` | Hub UI shell (workspace, chat, budget) | Hub frontend |
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

UI shell live on the hub (mock data). Backend: schema → worker →
`/hub/research`-style routes → live retrieval → exporters → eval harness.
See `ARCHITECTURE.md` for the build order.

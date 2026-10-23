# Nibgate agent gates — canonical spec

Where the agent's money is enforceable, by whom, and what remains trust-me.

Reference: Aomi Labs, "Three Gates from Intent to Settlement" (Sep 2026).
Their taxonomy maps 1:1 onto our stack. This file records our coverage per
gate, the bypass analysis, and the build order for what is missing.

## Current coverage

| Gate | Mechanism | Administrator | Bypass route | Status |
|---|---|---|---|---|
| 0.5 Runtime construction | loop: schema, caps, JEV verdicts, dedupe, budgets, checklist | Nibgate backend (us) | operator code change | ENFORCED (app boundary) |
| 0.5 Simulation | `previewPrice` reads the 402 free; signing hook rejects a missing or increased price and the per-call ceiling | backend | seller serves no price or changes the price → we refuse to sign | ENFORCED |
| 0.5 Verdict binding | judgement rows staple canonical `fp`; re-checked pre-execution (`verdict-void`) | backend | none in-process | ENFORCED |
| 0.5 Injected state | `crossCheckRpc` primary-vs-backup before every spend | backend, active only with `DRNIB_RPC_BACKUP` | single-RPC deploys skip it | PARTIAL |
| 1 Wallet policy | — | — | any backend compromise signs freely | **MISSING** |
| 2 Escrow mandate | `NibgateRunSplitter` (keeper/treasury/splits onchain) + funding floor (≥ plan estimate) + one-shot deposits + cap aligned to deposit | contract, keeper key | keeper key compromise | ENFORCED (testnet and mainnet; funded mainnet job 1 split/refunded) |
| 2 Spend mandate (direct creator tips) | `NibgateSpenderV2` (separate owner and agent, daily cap + optional restriction + pause) | contract (testnet and mainnet) | agent-key compromise can spend to any address up to cap while unpaused; EOA-funded Gateway and held-tip flows are outside the mandate | PAUSED (both networks contained and custody-rotated on 23 Oct 2026; do not resume until the private backend passes acceptance) |
| 3 Builder | — | Arc sequencer (not ours) | out of scope | NONE |

Procedural boundary in force until Gate 1 lands: the agent hot wallet holds
only operating float (~$20 testnet). Balance discipline, not cryptography.

## What Aomi itself uses (verified Oct 2026)

Not a vendor wallet: **"Aomi plans; you sign."** Their widget integrates
Para + wagmi and hands every transaction to the user's local wallet. The
agent never holds keys — their Gate 1 is the human. We cannot copy this:
our product IS autonomous spending (data stage buys, tips, unlocks), a
strictly harder problem than theirs. Their paper surveys the right
mechanisms; their product sidesteps the custody question.

## Track A — CDP server wallet + Policy Engine (Gate 1 vendor)

**SPIKE VERDICT (Oct 2026): DEAD ON ARC.** CDP supports Base, Ethereum,
Arbitrum, Polygon, Optimism, Solana (+ testnets) — Arc (5042/5042002) is not
listed, `evmNetwork` identifiers are a closed set, and Smart Accounts are
Base-only. Revisit only if Coinbase adds Arc; do not build.

(Kept for the record: the mechanism itself is right — project/account
policies, allowlist + `evmData` value caps, fail-secure default. If we ever
operate an agent wallet on a CDP-supported chain, this is the template.)

## Track B — Smart sessions (Gate 2 vendor)

- Rhinestone Smart Sessions / Safe + ERC-7579: session key with USDC spending limit + timeframe + recipient allowlist, enforced onchain.
- Blocked on chain infra: needs EntryPoint + bundler + module deployment on Arc. Verify availability; if absent, Track B is dead on Arc.
- SmartAgentKit (Safe + hook multiplexer + presets) is the packaged form of the same architecture — same infra dependency.

## Track C — Custom spend-limit contract (recommended near-term Gate 2)

**STATUS: V2 DEPLOYED ON ARC TESTNET AND MAINNET (Oct 2026).** `NibgateSpenderV2`
`0x8F636a1aCb99d96746b657645E1d8F2864bff7DA` (tx
`0xb7d01c81678bbd49dc2e59ac03eac87f953504635b9e79774b3c10f97ba35f17`):
owner = keeper, agent = live worker key, $2/day cap, open recipients, 9/9 forge tests green.
Deployer holds no privileges (constructor-assigned roles only).

Mainnet V2 `0xae39444c91aE8F0b8cF0642A18A521b6D312061B` (tx
`0x644e4049541a697384928119ea232ea3abc91583a01222361b052d3e20fdf412`)
has keeper owner, live worker agent, the same $2/day cap and open recipients.
It holds 0.05 USDC funded by tx
`0xe6aa683e648d0263392c3e63af3791517a2d2a3a46c8d6364b300715c62b7fea`.

The testnet contract holds 1 test USDC migrated from V1. The worker can
route hub-verified direct tips through `spend()` once
`DRNIB_SPENDER_ADDRESS=0x8F636a1aCb99d96746b657645E1d8F2864bff7DA` is set;
recipients are open by default, while the owner can enable an allowlist.
The model cannot override a verified creator's recipient; a mandate refusal
never falls back to EOA payment. Unresolved held tips stay EOA-funded because
the current refund API requires the recorded payer's EOA signature. Gateway
EIP-3009 flows also stay EOA-bound. The hot key therefore still holds some
float, and the contract's cap covers only its own balance.

- Minimal `NibgateSpenderV2`: owner = keeper, agent key = spender, per-day USDC cap, optional recipient restriction, forge-tested like the splitter. Open recipients trade flexibility for a larger agent-key blast radius within the cap.
- The contract bounds direct tips from its own balance; the agent EOA still
  pays Gateway purchases and refundable held tips.
- Accepts the residual: owner/keeper key is still trusted (same as escrow keeper).

## Bypass acceptance tests (Aomi § coverage)

Every gate ships with a test that tries to route around it:
1. Spend proposed without a verdict never executes (`verdict-void`).
2. Over-cap batch (spend mixed into fast batch) is rejected whole.
3. Post-simulation payload swap voids the approval.
4. Unjudged direct `runTool` spend still hits tool-level caps (defense in depth).
5. Owner-key / allowance abuse against session limits (Track B/C only).
6. Evaluator outage: JEV down → runs stop (`judge-unreachable`), never judgeless.
7. Unfunded approve on an escrowed run, via HTTP and via MCP: both refuse unless the job reads Funded ≥ estimate (live job-17 proof: funded $0.20 = estimate → approve 200; below estimate → 409).
8. Raise past the onchain deposit, via HTTP and via MCP: both refuse with the one-shot error (the chain cannot accept a top-up on a Funded job).

Tests 1–4 are implemented (`loop.test.js`, `executor.test.js`). Test 6 is implemented. Test 5 follows its track. Tests 7–8 are enforced in route + tool code (`routes/runs.js` approve/raise, `mcp/tools.js` approve_plan/raise_budget) and proven live on testnet; codified bypass tests are the remaining step.

## Decision

- Build now: verdict binding, bypass tests 1–4+6, dual-RPC guard (done, this repo).
- Track A: dead on Arc. Track B: blocked on 4337 infra (verify if ever needed).
- **Track C deployed on both networks** — testnet `NibgateSpenderV2` is funded at
  `0x8F636a1aCb99d96746b657645E1d8F2864bff7DA` (owner = keeper, agent = live
  worker key, $2/day cap, 9/9 forge tests). Mainnet is funded at
  `0xae39444c91aE8F0b8cF0642A18A521b6D312061B`. Both workers have
  `DRNIB_SPENDER_ADDRESS` configured. Verify deployment and a live tip on
  each network before claiming the gate operational.
- Unverified alternative (spike if float grows): Turnkey-style enclave +
  policy (chain-agnostic signing is plausibly Arc-compatible, unlike CDP's
  closed network list — but docs could not be verified, and it means vendor
  key custody + signing-path rework + monthly cost). Track C first; vendor
  Gate 1 only when the float justifies it.
- Procedural now: hot-wallet float discipline + movement alerting.
- Reconcile is Arc-decimal-safe: it reads logs only from the ERC-20 USDC
  contract address, so the native-leg system event (18-dec) can never
  double-count against the ERC-20 leg (6-dec).

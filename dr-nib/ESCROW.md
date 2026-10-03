# Research escrow on Arc

How a Dr. Nib run holds the user's money and gives it back. Design note, not
flow — the user-facing journey lives in `FLOW.md`.

**Status (Oct 2026): designed, not deployed.** Supersedes the Sep 2026 draft
below in one decision: we ship *stock* ERC-8183 plus a drawdown hook instead
of extending a contract. Nothing onchain exists for runs yet; the ledger in
`backend/src/money.js` is the only budget enforcement today.

## Short version

Do not invent an escrow standard. **ERC-8183 (Agentic Commerce,
published Feb 2026)** is built for exactly this shape — scoped work, escrowed
budget, an evaluator who alone decides the outcome — with a reference
implementation (`erc8183/erc8183-reference`: `AgenticCommerce.sol` + client
SDK, hooks, evaluator guide). Our money model already matches it, down to the
platform fee being basis points taken on completion.

We deploy the stock contract and solve the one gap it does not cover — a
research run spends over time, so unspent money must come home — with the
spec's own extension point: a **hook**, not a fork.

## ERC-8183 → Dr. Nib mapping

| ERC-8183 | Dr. Nib |
|---|---|
| `client` | the user wallet (pays, receives refunds) |
| `provider` | the operator wallet (does the research, receives spent) |
| `evaluator` | keeper EOA today (same key that relays tips/holding); JEV-gated evaluator contract later |
| `createJob(provider, evaluator, expiredAt, description)` | a new research run (backend creates at configure) |
| `setBudget(jobId, amount)` | the cap chosen at configure, before any funds move |
| `fund(jobId, expectedBudget)` | the deposit at approve: `approve(USDC)` + `fund()` from the user wallet (front-running protection included) |
| `submit(jobId, deliverable)` | worker submits `abi.encode(reportHash, spentUsdc)` when the report lands |
| `complete(jobId, reason)` | keeper completes with `reason = reportHash`; hook splits (below) |
| `reject(jobId, reason)` | run fails/ends early; escrow refunded to the client |
| `claimRefund(jobId)` after `expiredAt` | permissionless, un-hookable safety net |

Run-status correspondence: `intake/configure` → Open, `approve+fund` →
Funded, `running` → Funded, report written → Submitted, `complete/failed/
ended` → Completed/Rejected (+ `settle()`), expired → Expired.

## The one gap, solved with a hook: NibgateDrawdownHook

ERC-8183 settles all-or-nothing — `complete` releases the whole budget.
A research run prepaies a cap, stages draw it down, and the remainder comes
back. So `complete` runs through a standard `afterAction` hook that:

1. Reads `(reportHash, spentUsdc)` from the submitted deliverable (already
   attested by the keeper's `complete`, which verified it against the ledger).
2. Sends `spent − 1%` to the provider, `1%` of spent to the treasury
   (`platformFeeBP` on the job itself stays 0 — the hook *is* the fee logic).
3. Sends the remainder to the client, atomically in the same transaction.

Rejected/expired jobs bypass the hook by spec (full refund, no fee) —
`claimRefund` is deliberately not hookable, so a buggy hook can delay a
payout but can never trap funds. The escrow contract stays 100% stock:
audited surface, ecosystem-compatible, reputation-composable later.

Retired alternatives: **A (extend a contract with `drawDown`)** — rejected:
it forks the audited surface and tangles run money with the tip-holding
contracts, which serve a different product. **B (one job per stage)** —
rejected: breaks "prepay the cap" and multiplies gas/round-trips.
**C (meter offchain, settle once without escrow)** — rejected: no onchain
protection at all; this is today's ledger-only state, kept only until the
contract deploys.

## What the evaluator is, in phases

- **Now:** keeper EOA. Same trust already placed in it for tips and holding
  boxes; every attestation is an onchain event carrying the report hash.
- **Later:** JEV-gated evaluator contract — arbitrary checks before
  `complete`/`reject`, per the spec's evaluator-may-be-a-contract clause.
  The hook split works identically under either evaluator.

The evaluator is trusted for completion either way (spec § Security). For
research budgets this is acceptable; high-value runs get reputation gating
(ERC-8004 hooks exist in the reference impl) before mainnet volume.

## Arc specifics that will bite us

Canonical reference: <https://docs.arc.io/arc/references/evm-differences>.
USDC `0x3600000000000000000000000000000000000000` on both networks, 6-decimal
ERC-20 interface — the escrow and the ledger both account in 6-decimals end
to end (Circle is explicit: never credit 18-dec values into 6-dec records).

- **Transfers to `address(0)` revert** (forbidden burn); self-destructing a
  contract holding USDC *moves that USDC out*. Refund paths must never address
  zero; the hook must never be destructible.
- **Blocklist reverts consume gas with no receipt.** Settlement retries treat
  "no receipt" as unknown, never as success.
- **Block timestamps are non-decreasing, not increasing** — order onchain
  events by block number, never by timestamp.
- **`maxFeePerGas` below 20 Gwei is silently dropped** by the mempool: no
  error, no receipt, never mined. (Arc gas is USDC; keeper txs must clear it.)
- **Deterministic finality.** Single confirmation is final — no confirmation
  counting, no "pending" UI states.

## Relationship to what we already have

Untouched: `TipHoldingFactory`/`TipHoldingWallet` (tips), `GatewayFeeWallet`
(revenue split), `NibgateReputation` (ratings). Run escrow is a new,
separate deployment — different money, different lifecycle.

Reused as-is: the keeper relay pattern (hot key signs, hub verifies, events
recorded), the frontend signing primitives (`transfer` + `approve` calldata
via `packages/wallet`, Gateway adapter for gasless authorization), the
offchain ledger as the metering source the keeper attests against, and the
`expiredAt` → `claimRefund` guarantee that already protects tip-hold funds.

`submit`'s `deliverable` doubles as the audit anchor: `reportHash` commits
the exact report bytes the money paid for, retrievable from Postgres/R2.

## Build status

- [ ] Deploy stock `AgenticCommerce` on Arc testnet (reference impl, unmodified)
- [ ] Write + test `NibgateDrawdownHook` (split on complete, full passthrough otherwise)
- [ ] Backend job lifecycle: create/setBudget/fund-status/submit/complete/reject mirroring run status
- [ ] Frontend configure→approve becomes deposit (`approve` + `fund`, then run)
- [ ] Keeper completes with ledger-attested `(reportHash, spentUsdc)`
- [ ] Testnet soak with real (testnet) USDC before any mainnet discussion

## Open (unchanged)

- **Unaudited code must not hold real money.** Nothing here touches mainnet
  user funds before an external review and a testnet soak.
- JEV-gated evaluator contract design (phase 2).
- `expiredAt` duration policy per depth tier.
- How the keeper handles a `complete` whose ledger attestation disagrees
  with the submitted spent — evaluator rejects, flow restarts; the exact
  retry UX is undecided.

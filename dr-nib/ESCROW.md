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
research run spends over time, so unspent money must come home — by making
the job's **provider a splitter contract** instead of the operator wallet.

## The one gap, solved with a splitter-as-provider

ERC-8183 settles all-or-nothing — `complete` releases the whole budget.
A research run prepaies a cap, stages draw it down, and the remainder comes
back. A post-hoc hook cannot do the split: in the reference implementation
`complete()` transfers the full budget to the provider *before* `afterAction`
fires, so by hook time the money has already moved. The compliant answer is
structural: set the job's provider to `NibgateRunSplitter`, so `complete()`
parks the whole cap in the splitter, and a permissionless `split()` divides
it afterwards:

1. Worker `submit(jobId, abi.encode(reportHash, spentUsdc))` when the report
   lands; keeper `complete(jobId, reportHash)` after verifying spent against
   the ledger. Full cap now sits in the splitter.
2. Anyone calls `split(jobId, spent, operator, keeperSig)` with the keeper's
   spend attestation. The contract verifies: job Completed, provider is us,
   spent within budget, keeper signature over
   `(chain, core, splitter, job, spent, operator, client, treasury, fee)`.
3. Atomically in one transaction: `spent − 1%` to the operator, `1%` to the
   treasury (`platformFeeBP` on the job stays 0 — the splitter *is* the fee
   logic), remainder to the client. One split per job, then the door shuts.

Rejected/expired jobs never touch the splitter — the core refunds those
directly, un-hookable and un-splittable. And because the keeper pre-signs the
attestation at submit time, execution needs no live keeper: anyone (backend,
user, stranger) can run `split()` once the signature exists.

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

## The one gap, solved with a splitter-as-provider: NibgateRunSplitter

ERC-8183 settles all-or-nothing — `complete` releases the whole budget.
A research run prepaies a cap, stages draw it down, and the remainder comes
back. So `complete` parks the full cap in the splitter, and a permissionless
`split()` divides it afterwards:

1. Reads `(reportHash, spentUsdc)` from the submitted deliverable (already
   attested by the keeper's `complete`, which verified it against the ledger).
2. Sends `spent − 1%` to the provider, `1%` of spent to the treasury
   (`platformFeeBP` on the job itself stays 0 — the splitter *is* the fee logic).
3. Sends the remainder to the client, atomically in the same transaction.

Rejected/expired jobs bypass the splitter by spec (full refund, no fee) —
`claimRefund` is deliberately not hookable, so a buggy splitter can delay a
payout but can never trap funds. The escrow contract stays 100% stock:
audited surface, ecosystem-compatible, reputation-composable later.

Retired alternatives: **A (extend a contract with `drawDown`)** — rejected:
it forks the audited surface and tangles run money with the tip-holding
contracts, which serve a different product. **B (one job per stage)** —
rejected: breaks "prepay the cap" and multiplies gas/round-trips.
**B2 (post-hoc split hook)** — rejected on reading the reference code:
`complete()` transfers before `afterAction` fires, so a hook can observe the
payout but never redirect it. **C (meter offchain, settle once without
escrow)** — rejected: no onchain protection at all; this is today's
ledger-only state, kept only until the contract deploys.

## What the evaluator is, in phases

- **Now:** keeper EOA. Same trust already placed in it for tips and holding
  boxes; every attestation is an onchain event carrying the report hash.
- **Later:** JEV-gated evaluator contract — arbitrary checks before
  `complete`/`reject`, per the spec's evaluator-may-be-a-contract clause.
  The splitter math works identically under either evaluator.

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
  zero; the splitter must never be destructible (it isn't — no selfdestruct path).
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

- [x] Stock core surveyed (`erc8183-reference`: `ACPCore`, `IACP`/`IACPHook`, hooks, evaluator guide — read-only reference)
- [x] `NibgateRunSplitter` written + 7 forge tests green (split math, zero-spend refund, submitJob relay + keeper gate, wrong-key/overspend/double-split/uncompleted rejections)
- [x] Deployed on Arc testnet (Oct 2026): core `0x5135ae9be828be42b63f176848a7b720aedf4c58`, splitter `0xe6a0a29047147c65d2409bcb2501f7a0bab53ede` (keeper `0x796a…`, treasury `0x558e…`, 100 bps) — recorded in `contracts/deployments/arc-testnet.json:escrow`
- [x] Full lifecycle proven onchain with real testnet USDC (job 10, tx `0xcb6a…74b8`): $0.05 funded → $0.03 spent → split 17820 operator / 180 treasury / 12000 client refund, all atomic
- [ ] Backend job lifecycle: create/setBudget/fund-status/submit/complete/reject mirroring run status
- [ ] Frontend configure→approve becomes deposit (`approve` + `fund`, then run)
- [ ] Keeper completes with ledger-attested `(reportHash, spentUsdc)`
- [ ] Testnet soak with real (testnet) USDC before any mainnet discussion

## Reproducing the deployment

Toolchain: `tools/foundry/` (forge v1.8.4, gitignored, re-fetch per
`foundry.paradigm.xyz`), OpenZeppelin v5.0.2 sparse (`contracts/lib`,
gitignored, re-fetch per commands below).

```bash
# deps
git clone --depth 1 --branch v5.0.2 --filter=blob:none --sparse \
  https://github.com/OpenZeppelin/openzeppelin-contracts contracts/lib/openzeppelin-contracts
git -C contracts/lib/openzeppelin-contracts sparse-checkout set contracts
# build + test
./tools/foundry/forge build --root contracts
./tools/foundry/forge test --root contracts --match-contract NibgateRunSplitterTest
# deploy (local-ops/ scripts are local-only, not committed)
DEPLOYER_KEY=0x... KEEPER_ADDRESS=0x... node local-ops/deploy-escrow.mjs testnet
```

## Open (unchanged)

- **Unaudited code must not hold real money.** Nothing here touches mainnet
  user funds before an external review and a testnet soak.
- JEV-gated evaluator contract design (phase 2).
- `expiredAt` duration policy per depth tier.
- How the keeper handles a `complete` whose ledger attestation disagrees
  with the submitted spent — evaluator rejects, flow restarts; the exact
  retry UX is undecided.
